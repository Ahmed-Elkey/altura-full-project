import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InventoryReason,
  OrderStatus,
  Payment,
  PaymentProvider,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import { MockPaymentOutcomeDto } from './dto/mock-payment-outcome.dto';
import { fromMinorUnits, toMinorUnits } from './payment-money';
import {
  PaymentProviderAdapter,
  ProviderCreatePaymentInput,
  ProviderCreatePaymentResult,
  ProviderWebhookEvent,
} from './payment.types';
import { MockPaymentProvider } from './providers/mock-payment.provider';
import { PaymobPaymentProvider } from './providers/paymob-payment.provider';
import { StripePaymentProvider } from './providers/stripe-payment.provider';
import { reconcileRefundState } from './refund-state';

const paymentOrderInclude = {
  items: { orderBy: { createdAt: 'asc' as const } },
  addresses: { orderBy: { type: 'asc' as const } },
  payments: { orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.OrderInclude;

type PaymentOrder = Prisma.OrderGetPayload<{ include: typeof paymentOrderInclude }>;

type StoredPayment = Payment;

class InventoryCommitError extends Error {}

const PAID_PAYMENT_STATUSES: PaymentStatus[] = [
  PaymentStatus.PAID,
  PaymentStatus.PARTIALLY_REFUNDED,
  PaymentStatus.REFUNDED,
];
const ACTIVE_PAYMENT_STATUSES: PaymentStatus[] = [
  PaymentStatus.PENDING,
  PaymentStatus.REQUIRES_ACTION,
];
const REFUNDED_PAYMENT_STATUSES: PaymentStatus[] = [
  PaymentStatus.REFUNDED,
  PaymentStatus.PARTIALLY_REFUNDED,
];
const INITIAL_TERMINAL_PAYMENT_STATUSES: PaymentStatus[] = [
  PaymentStatus.PAID,
  PaymentStatus.CANCELLED,
  PaymentStatus.FAILED,
];

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mockProvider: MockPaymentProvider,
    private readonly stripeProvider: StripePaymentProvider,
    private readonly paymobProvider: PaymobPaymentProvider,
  ) {}

  async initialize(
    userId: string | undefined,
    dto: InitializePaymentDto,
    idempotencyKey: string,
  ) {
    const orderNumber = dto.orderNumber.trim().toUpperCase();
    const guestEmail = dto.email?.trim().toLowerCase();
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: paymentOrderInclude,
    });
    if (!order) throw new NotFoundException('Order not found');
    this.assertOrderAccess(order, userId, guestEmail);

    if (order.payments.some(payment => payment.provider === PaymentProvider.CASH_ON_DELIVERY)) {
      throw new ConflictException('Cash on Delivery cannot be initialized as a card payment');
    }

    const provider = this.configuredProvider();
    const fingerprint = this.fingerprint({
      orderId: order.id,
      provider,
      amount: order.grandTotal.toFixed(2),
      currency: order.currency,
    });

    const idempotent = await this.prisma.payment.findUnique({ where: { idempotencyKey } });
    if (idempotent) {
      this.assertPaymentIdempotency(idempotent, order.id, provider, fingerprint);
      if (
        PAID_PAYMENT_STATUSES.includes(idempotent.status)
      ) {
        return this.presentInitialization(idempotent, true);
      }
      this.assertOrderPayable(order);
      if (idempotent.providerPaymentId) {
        return this.presentInitialization(idempotent, true);
      }
      return this.initializeProvider(idempotent, order, true);
    }

    this.assertOrderPayable(order);

    const alreadyPaid = order.payments.find((payment) =>
      PAID_PAYMENT_STATUSES.includes(payment.status),
    );
    if (alreadyPaid) throw new ConflictException('Order is already paid');

    const attemptKey = this.activeAttemptKey(order.id);
    const activeAttempt = order.payments.find((payment) =>
      ACTIVE_PAYMENT_STATUSES.includes(payment.status),
    );
    if (activeAttempt) {
      if (activeAttempt.provider !== provider) {
        throw new ConflictException(
          `Order already has an active ${activeAttempt.provider} payment attempt`,
        );
      }
      return activeAttempt.providerPaymentId
        ? this.presentInitialization(activeAttempt, true)
        : this.initializeProvider(activeAttempt, order, true);
    }

    let payment: StoredPayment;
    try {
      payment = await this.prisma.payment.create({
        data: {
          orderId: order.id,
          provider,
          status: PaymentStatus.PENDING,
          idempotencyKey,
          idempotencyFingerprint: fingerprint,
          activeAttemptKey: attemptKey,
          amount: order.grandTotal,
          currency: order.currency,
        },
      });
    } catch (error) {
      if (this.prismaErrorCode(error) === 'P2002') {
        const replay = await this.prisma.payment.findUnique({ where: { idempotencyKey } });
        if (replay) {
          this.assertPaymentIdempotency(replay, order.id, provider, fingerprint);
          return replay.providerPaymentId
            ? this.presentInitialization(replay, true)
            : this.initializeProvider(replay, order, true);
        }

        // A second request may have created another active attempt for the same
        // order/provider after our initial read. Reuse that attempt instead of
        // creating two remote payment sessions.
        const concurrentAttempt = await this.prisma.payment.findUnique({
          where: { activeAttemptKey: attemptKey },
        });
        if (concurrentAttempt) {
          if (concurrentAttempt.provider !== provider) {
            throw new ConflictException(
              `Order already has an active ${concurrentAttempt.provider} payment attempt`,
            );
          }
          return concurrentAttempt.providerPaymentId
            ? this.presentInitialization(concurrentAttempt, true)
            : this.initializeProvider(concurrentAttempt, order, true);
        }
      }
      throw error;
    }

    return this.initializeProvider(payment, order, false);
  }

  async completeMock(
    paymentId: string,
    dto: MockPaymentOutcomeDto,
    userId?: string,
    guestEmail?: string,
  ) {
    const nodeEnv = this.config.get<string>('NODE_ENV', 'development');
    if (nodeEnv === 'production' || this.configuredProvider() !== PaymentProvider.MOCK) {
      throw new ForbiddenException('Mock payment completion is disabled');
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: { select: { userId: true, email: true } } },
    });
    if (!payment || payment.provider !== PaymentProvider.MOCK) {
      throw new NotFoundException('Mock payment not found');
    }
    if (userId) {
      if (payment.order.userId !== userId) throw new NotFoundException('Mock payment not found');
    } else if (
      payment.order.userId ||
      !guestEmail ||
      payment.order.email.toLowerCase() !== guestEmail.toLowerCase()
    ) {
      throw new NotFoundException('Mock payment not found');
    }

    const status =
      dto.outcome === 'paid'
        ? PaymentStatus.PAID
        : dto.outcome === 'cancelled'
          ? PaymentStatus.CANCELLED
          : PaymentStatus.FAILED;
    const amountMinor = toMinorUnits(payment.amount, payment.currency);
    const event: ProviderWebhookEvent = {
      provider: PaymentProvider.MOCK,
      externalEventId: `mock:${payment.id}:${dto.outcome}`,
      eventType: `mock.${dto.outcome}`,
      providerPaymentId: payment.providerPaymentId ?? `mock_pi_${payment.id}`,
      providerTransactionId: `mock_tx_${payment.id}_${dto.outcome}`,
      status,
      amountMinor,
      currency: payment.currency,
      failureReason: dto.outcome === 'failed' ? 'Mock payment failure' : undefined,
      occurredAt: new Date(),
    };

    return this.processWebhookEvent(event, {
      type: event.eventType,
      paymentId: payment.id,
      outcome: dto.outcome,
    });
  }

  async issueMockRefund(paymentId: string, amount: Prisma.Decimal, referenceId: string) {
    const nodeEnv = this.config.get<string>('NODE_ENV', 'development');
    if (nodeEnv === 'production' || this.configuredProvider() !== PaymentProvider.MOCK) {
      throw new ConflictException('Automatic refunds are available only for the local Mock provider');
    }
    if (!amount.gt(0)) throw new BadRequestException('Refund amount must be positive');

    const externalEventId = `admin-return-refund:${referenceId}`;
    const existingEvent = await this.prisma.paymentWebhookEvent.findUnique({
      where: {
        provider_externalEventId: {
          provider: PaymentProvider.MOCK,
          externalEventId,
        },
      },
    });
    if (existingEvent?.processedAt) {
      if (existingEvent.processingError || existingEvent.paymentId !== paymentId) {
        throw new ConflictException('The previous local refund event was rejected or belongs to another payment; no refund was applied');
      }
      return { received: true, duplicate: true, status: 'already_processed' };
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true },
    });
    if (!payment || payment.provider !== PaymentProvider.MOCK) {
      throw new NotFoundException('Mock payment not found');
    }
    if (!PAID_PAYMENT_STATUSES.includes(payment.status)) {
      throw new ConflictException('Only a paid payment can be refunded');
    }

    const refundedAmount = payment.refundedAmount.plus(amount);
    if (refundedAmount.gt(payment.amount)) {
      throw new ConflictException('Refund amount exceeds the captured payment');
    }
    const status = refundedAmount.gte(payment.amount)
      ? PaymentStatus.REFUNDED
      : PaymentStatus.PARTIALLY_REFUNDED;
    const amountMinor = toMinorUnits(payment.amount, payment.currency);
    const refundedAmountMinor = toMinorUnits(refundedAmount, payment.currency);

    return this.processWebhookEvent(
      {
        provider: PaymentProvider.MOCK,
        externalEventId,
        eventType: 'admin.return.refund',
        localPaymentId: payment.id,
        providerPaymentId: payment.providerPaymentId ?? `mock_pi_${payment.id}`,
        // The refund event has its own idempotent event ID. Correlation must
        // continue to identify the original captured transaction.
        providerTransactionId: payment.providerTransactionId ?? undefined,
        status,
        amountMinor,
        refundedAmountMinor,
        currency: payment.currency,
        occurredAt: new Date(),
      },
      { source: 'admin-return', referenceId, paymentId: payment.id },
    );
  }

  async handleStripeWebhook(rawBody: Buffer, signature: string | undefined) {
    const parsed = this.stripeProvider.parseWebhook(rawBody, signature);
    return this.processWebhookEvent(parsed.event, parsed.payload);
  }

  async handlePaymobWebhook(body: unknown, hmac: string | undefined) {
    const parsed = this.paymobProvider.parseTransactionWebhook(body, hmac);
    return this.processWebhookEvent(parsed.event, parsed.payload);
  }

  private async initializeProvider(
    payment: StoredPayment,
    order: PaymentOrder,
    idempotentReplay: boolean,
  ) {
    const latest = await this.prisma.payment.findUnique({ where: { id: payment.id } });
    if (!latest) throw new NotFoundException('Payment not found');
    if (latest.providerPaymentId) {
      return this.presentInitialization(latest, true);
    }
    if (!ACTIVE_PAYMENT_STATUSES.includes(latest.status)) {
      return this.presentInitialization(latest, true);
    }

    // Only one request is allowed to initialize a remote payment session at a
    // time. A short stale lease lets a later retry recover after a crashed
    // process without creating concurrent provider sessions.
    const now = new Date();
    const staleBefore = new Date(now.getTime() - 90_000);
    const claimed = await this.prisma.payment.updateMany({
      where: {
        id: latest.id,
        providerPaymentId: null,
        status: { in: [PaymentStatus.PENDING, PaymentStatus.REQUIRES_ACTION] },
        OR: [
          { providerInitStartedAt: null },
          { providerInitStartedAt: { lte: staleBefore } },
        ],
      },
      data: {
        providerInitStartedAt: now,
        failureReason: null,
      },
    });

    if (claimed.count !== 1) {
      const inProgress = await this.prisma.payment.findUnique({ where: { id: latest.id } });
      if (!inProgress) throw new NotFoundException('Payment not found');
      if (inProgress.providerPaymentId) {
        return this.presentInitialization(inProgress, true);
      }
      throw new ConflictException('Payment initialization is already in progress; retry shortly');
    }

    const adapter = this.adapterFor(latest.provider);
    const providerInput = this.providerInput(latest.id, order);

    let result: ProviderCreatePaymentResult;
    try {
      result = await adapter.createPayment(providerInput);
    } catch (error) {
      await this.prisma.payment.update({
        where: { id: latest.id },
        data: {
          providerInitStartedAt: null,
          failureReason: this.errorMessage(error),
        },
      });
      if (error instanceof BadRequestException || error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new BadGatewayException(this.errorMessage(error));
    }

    const remainsActive = ACTIVE_PAYMENT_STATUSES.includes(result.status);
    let updated = await this.prisma.payment.update({
      where: { id: latest.id },
      data: {
        providerPaymentId: result.providerPaymentId,
        providerOrderId: result.providerOrderId,
        providerTransactionId: result.providerTransactionId,
        checkoutSecret: result.checkoutSecret,
        status: result.status,
        activeAttemptKey: remainsActive
          ? this.activeAttemptKey(order.id)
          : null,
        providerInitStartedAt: null,
        failureReason: null,
        metadata: result.metadata as Prisma.InputJsonValue | undefined,
      },
    });

    if (
      INITIAL_TERMINAL_PAYMENT_STATUSES.includes(result.status)
    ) {
      await this.processWebhookEvent(
        {
          provider: latest.provider,
          externalEventId: `initialize:${latest.id}:${result.status.toLowerCase()}`,
          eventType: `payment.initialize.${result.status.toLowerCase()}`,
          providerPaymentId: result.providerPaymentId,
          providerOrderId: result.providerOrderId,
          providerTransactionId: result.providerTransactionId,
          status: result.status,
          amountMinor: toMinorUnits(latest.amount, latest.currency),
          currency: latest.currency,
          occurredAt: new Date(),
        },
        { source: 'payment-initialization', paymentId: latest.id },
      );
      updated = (await this.prisma.payment.findUnique({ where: { id: latest.id } })) ?? updated;
    }

    return this.presentInitialization(updated, idempotentReplay, result);
  }

  private providerInput(paymentId: string, order: PaymentOrder): ProviderCreatePaymentInput {
    const billing = order.addresses.find((address) => address.type === 'BILLING') ?? null;
    return {
      paymentId,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        email: order.email,
        phone: order.phone,
        amountMinor: toMinorUnits(order.grandTotal, order.currency),
        amountDecimal: order.grandTotal.toFixed(2),
        currency: order.currency,
        reservationExpiresAt: order.reservationExpiresAt,
        items: order.items.map((item) => ({
          name: item.productName,
          description: [item.colorName, item.size].filter(Boolean).join(' / ') || item.sku,
          unitAmountMinor: toMinorUnits(item.unitPrice, order.currency),
          quantity: item.quantity,
        })),
        billingAddress: billing
          ? {
              recipientName: billing.recipientName,
              phone: billing.phone,
              line1: billing.line1,
              line2: billing.line2,
              city: billing.city,
              region: billing.region,
              postalCode: billing.postalCode,
              countryCode: billing.countryCode,
            }
          : null,
      },
    };
  }

  private async processWebhookEvent(event: ProviderWebhookEvent, payload: unknown) {
    const webhook = await this.createOrLoadWebhook(event, payload);
    if (webhook.processedAt) {
      return { received: true, duplicate: true, status: 'already_processed' };
    }

    const payment = await this.findPaymentForEvent(event);
    if (!payment) {
      await this.prisma.paymentWebhookEvent.update({
        where: { id: webhook.id },
        data: { processingError: 'Payment could not be correlated' },
      });
      throw new NotFoundException('Payment could not be correlated');
    }

    const correlationError = this.providerCorrelationError(payment, event);
    if (correlationError) {
      await this.markWebhookProcessed(webhook.id, payment.id, payment.orderId, correlationError);
      throw new ConflictException('Payment webhook correlation failed');
    }

    if (
      (event.status === PaymentStatus.REFUNDED ||
        event.status === PaymentStatus.PARTIALLY_REFUNDED) &&
      event.refundedAmountMinor === undefined
    ) {
      const reason = 'Refund amount was not cryptographically authenticated by the provider';
      await this.markWebhookProcessed(webhook.id, payment.id, payment.orderId, reason);
      throw new ConflictException('Refund callback is missing an authenticated amount');
    }

    try {
      switch (event.status) {
        case PaymentStatus.PAID:
          await this.applyPaidEvent(payment.id, webhook.id, event);
          break;
        case PaymentStatus.CANCELLED:
          await this.applyCancelledEvent(payment.id, webhook.id, event);
          break;
        case PaymentStatus.REFUNDED:
        case PaymentStatus.PARTIALLY_REFUNDED:
          await this.applyRefundEvent(payment.id, webhook.id, event);
          break;
        case PaymentStatus.FAILED:
          await this.applySimpleEvent(payment.id, webhook.id, event, PaymentStatus.FAILED);
          break;
        case PaymentStatus.REQUIRES_ACTION:
        case PaymentStatus.PENDING:
          await this.applySimpleEvent(payment.id, webhook.id, event, event.status);
          break;
        default:
          await this.markWebhookProcessed(webhook.id, payment.id, payment.orderId, 'Unsupported status');
      }
    } catch (error) {
      if (event.status === PaymentStatus.PAID && error instanceof InventoryCommitError) {
        await this.markPaidForReview(payment.id, webhook.id, event, error.message);
      } else {
        await this.prisma.paymentWebhookEvent.update({
          where: { id: webhook.id },
          data: { processingError: this.errorMessage(error) },
        });
        throw error;
      }
    }

    const updated = await this.prisma.payment.findUnique({ where: { id: payment.id } });
    return {
      received: true,
      duplicate: false,
      paymentId: payment.id,
      status: updated?.status ?? event.status,
    };
  }

  private async applyPaidEvent(
    paymentId: string,
    webhookId: string,
    event: ProviderWebhookEvent,
  ): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const payment = await tx.payment.findUnique({
          where: { id: paymentId },
          include: {
            order: {
              include: {
                items: true,
                payments: true,
              },
            },
          },
        });
        if (!payment) throw new NotFoundException('Payment not found');

        const now = event.occurredAt ?? new Date();
        const validationError = this.providerAmountMismatch(payment, event);
        if (validationError) {
          await tx.payment.update({
            where: { id: payment.id },
            data: this.paidPaymentData(event, now),
          });
          await tx.order.update({
            where: { id: payment.orderId },
            data: {
              status: OrderStatus.PAYMENT_REVIEW,
              reservationExpiresAt: null,
              internalNote: this.appendNote(payment.order.internalNote, validationError),
            },
          });
          await tx.paymentWebhookEvent.update({
            where: { id: webhookId },
            data: {
              paymentId: payment.id,
              orderId: payment.orderId,
              processedAt: new Date(),
              processingError: validationError,
            },
          });
          return;
        }

        if (REFUNDED_PAYMENT_STATUSES.includes(payment.status)) {
          await tx.paymentWebhookEvent.update({
            where: { id: webhookId },
            data: {
              paymentId: payment.id,
              orderId: payment.orderId,
              processedAt: new Date(),
              processingError: 'Ignored stale success after refund state',
            },
          });
          return;
        }

        if (payment.status === PaymentStatus.PAID && payment.order.inventoryCommittedAt) {
          await tx.paymentWebhookEvent.update({
            where: { id: webhookId },
            data: {
              paymentId: payment.id,
              orderId: payment.orderId,
              processedAt: new Date(),
            },
          });
          return;
        }

        const otherPaid = payment.order.payments.find(
          (candidate) =>
            candidate.id !== payment.id &&
            PAID_PAYMENT_STATUSES.includes(candidate.status),
        );
        if (otherPaid) {
          const reason = `Duplicate successful payment detected (${payment.id} after ${otherPaid.id})`;
          await tx.payment.update({
            where: { id: payment.id },
            data: this.paidPaymentData(event, now),
          });
          await tx.order.update({
            where: { id: payment.orderId },
            data: {
              status: OrderStatus.PAYMENT_REVIEW,
              internalNote: this.appendNote(payment.order.internalNote, reason),
            },
          });
          await tx.paymentWebhookEvent.update({
            where: { id: webhookId },
            data: {
              paymentId: payment.id,
              orderId: payment.orderId,
              processedAt: new Date(),
              processingError: reason,
            },
          });
          return;
        }

        if (
          payment.order.status !== OrderStatus.PENDING ||
          payment.order.inventoryCommittedAt ||
          payment.order.inventoryReleasedAt
        ) {
          const reason = `Successful payment arrived for non-fulfillable order state (${payment.order.status})`;
          await tx.payment.update({
            where: { id: payment.id },
            data: this.paidPaymentData(event, now),
          });
          await tx.order.update({
            where: { id: payment.orderId },
            data: {
              status: OrderStatus.PAYMENT_REVIEW,
              internalNote: this.appendNote(payment.order.internalNote, reason),
            },
          });
          await tx.paymentWebhookEvent.update({
            where: { id: webhookId },
            data: {
              paymentId: payment.id,
              orderId: payment.orderId,
              processedAt: new Date(),
              processingError: reason,
            },
          });
          return;
        }

        for (const item of payment.order.items) {
          if (!item.variantId) {
            throw new InventoryCommitError(`Order item ${item.sku} has no live variant reference`);
          }
          const changed = await tx.$executeRaw`
            UPDATE "Inventory"
            SET "quantity" = "quantity" - ${item.quantity},
                "reservedQuantity" = "reservedQuantity" - ${item.quantity},
                "updatedAt" = NOW()
            WHERE "variantId" = ${item.variantId}
              AND "reservedQuantity" >= ${item.quantity}
              AND "quantity" >= ${item.quantity}
          `;
          if (changed !== 1) {
            throw new InventoryCommitError(
              `Reserved inventory could not be committed for ${item.sku}`,
            );
          }
          await tx.inventoryMovement.create({
            data: {
              variantId: item.variantId,
              reason: InventoryReason.PURCHASE,
              quantity: -item.quantity,
              referenceId: payment.order.id,
              note: `Payment ${payment.id} committed reserved inventory`,
            },
          });
        }

        await tx.payment.update({
          where: { id: payment.id },
          data: this.paidPaymentData(event, now),
        });
        await tx.order.update({
          where: { id: payment.orderId },
          data: {
            status: OrderStatus.CONFIRMED,
            inventoryCommittedAt: now,
            reservationExpiresAt: null,
            cancelledAt: null,
          },
        });
        await tx.paymentWebhookEvent.update({
          where: { id: webhookId },
          data: {
            paymentId: payment.id,
            orderId: payment.orderId,
            processedAt: new Date(),
            processingError: null,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async markPaidForReview(
    paymentId: string,
    webhookId: string,
    event: ProviderWebhookEvent,
    reason: string,
  ): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const payment = await tx.payment.findUnique({
          where: { id: paymentId },
          include: { order: true },
        });
        if (!payment) throw new NotFoundException('Payment not found');
        const now = event.occurredAt ?? new Date();
        await tx.payment.update({
          where: { id: payment.id },
          data: this.paidPaymentData(event, now),
        });
        await tx.order.update({
          where: { id: payment.orderId },
          data: {
            status: OrderStatus.PAYMENT_REVIEW,
            reservationExpiresAt: null,
            internalNote: this.appendNote(payment.order.internalNote, reason),
          },
        });
        await tx.paymentWebhookEvent.update({
          where: { id: webhookId },
          data: {
            paymentId: payment.id,
            orderId: payment.orderId,
            processedAt: new Date(),
            processingError: reason,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async applyCancelledEvent(
    paymentId: string,
    webhookId: string,
    event: ProviderWebhookEvent,
  ) {
    await this.prisma.$transaction(
      async (tx) => {
        const payment = await tx.payment.findUnique({
          where: { id: paymentId },
          include: { order: { include: { items: true, payments: true } } },
        });
        if (!payment) throw new NotFoundException('Payment not found');
        const now = event.occurredAt ?? new Date();

        if (
          PAID_PAYMENT_STATUSES.includes(payment.status)
        ) {
          await tx.paymentWebhookEvent.update({
            where: { id: webhookId },
            data: {
              paymentId: payment.id,
              orderId: payment.orderId,
              processedAt: new Date(),
              processingError: 'Ignored stale cancellation after terminal payment state',
            },
          });
          return;
        }

        if (payment.status !== PaymentStatus.CANCELLED) {
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: PaymentStatus.CANCELLED,
              activeAttemptKey: null,
              providerInitStartedAt: null,
              failureReason: event.failureReason ?? 'Payment cancelled',
              providerTransactionId: event.providerTransactionId ?? payment.providerTransactionId,
              lastWebhookAt: now,
            },
          });
        }

        const otherActive = payment.order.payments.some(
          (candidate) =>
            candidate.id !== payment.id &&
            [...ACTIVE_PAYMENT_STATUSES, PaymentStatus.PAID].includes(candidate.status),
        );

        if (
          !otherActive &&
          payment.order.status === OrderStatus.PENDING &&
          !payment.order.inventoryCommittedAt
        ) {
          if (!payment.order.inventoryReleasedAt) {
            await this.releaseReservedInventory(
              tx,
              payment.order.id,
              payment.order.items,
              `Payment ${payment.id} cancelled`,
            );
          }
          await tx.order.update({
            where: { id: payment.orderId },
            data: {
              status: OrderStatus.CANCELLED,
              cancelledAt: now,
              reservationExpiresAt: null,
              inventoryReleasedAt: payment.order.inventoryReleasedAt ?? now,
            },
          });
          await tx.discountUsage.deleteMany({ where: { orderId: payment.orderId } });
        }

        await tx.paymentWebhookEvent.update({
          where: { id: webhookId },
          data: {
            paymentId: payment.id,
            orderId: payment.orderId,
            processedAt: new Date(),
            processingError: null,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async applyRefundEvent(
    paymentId: string,
    webhookId: string,
    event: ProviderWebhookEvent,
  ) {
    await this.prisma.$transaction(
      async (tx) => {
        const payment = await tx.payment.findUnique({
          where: { id: paymentId },
          include: { order: { include: { items: true } } },
        });
        if (!payment) throw new NotFoundException('Payment not found');
        const now = event.occurredAt ?? new Date();
        const refundedAmount =
          event.refundedAmountMinor === undefined
            ? null
            : fromMinorUnits(event.refundedAmountMinor, payment.currency);
        let validationError = this.providerAmountMismatch(payment, event);
        if (!PAID_PAYMENT_STATUSES.includes(payment.status)) {
          validationError = `Refund received for payment in ${payment.status} state`;
        }
        if (!refundedAmount) {
          validationError = 'Refund amount was not cryptographically authenticated by the provider';
        }

        const decision = refundedAmount
          ? reconcileRefundState({
              capturedAmount: payment.amount,
              currentRefundedAmount: payment.refundedAmount,
              incomingAmount: refundedAmount,
              incomingStatus: event.status,
            })
          : null;
        const refundValidationError = validationError ?? (decision?.kind === 'invalid' ? decision.reason : null);
        const advance = decision?.kind === 'advance' ? decision : null;

        if (refundValidationError) {
          await tx.order.update({
            where: { id: payment.orderId },
            data: {
              status: OrderStatus.PAYMENT_REVIEW,
              reservationExpiresAt: payment.order.inventoryCommittedAt ? undefined : null,
              internalNote: this.appendNote(payment.order.internalNote, refundValidationError),
            },
          });
        } else if (!advance) {
          await tx.paymentWebhookEvent.update({
            where: { id: webhookId },
            data: {
              paymentId: payment.id,
              orderId: payment.orderId,
              processedAt: new Date(),
              processingError: decision?.kind === 'stale' ? decision.reason : 'Ignored stale refund event',
            },
          });
          return;
        } else if (!payment.order.inventoryCommittedAt) {
          const fullRefund = advance.status === PaymentStatus.REFUNDED;
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: advance.status,
              activeAttemptKey: null,
              providerInitStartedAt: null,
              refundedAmount: advance.refundedAmount,
              refundedAt: fullRefund ? now : payment.refundedAt,
              providerTransactionId: event.providerTransactionId ?? payment.providerTransactionId,
              lastWebhookAt: now,
            },
          });
          if (fullRefund) {
            if (!payment.order.inventoryReleasedAt) {
              await this.releaseReservedInventory(
                tx,
                payment.order.id,
                payment.order.items,
                `Full refund for payment ${payment.id} before inventory commit`,
              );
            }
            await tx.order.update({
              where: { id: payment.orderId },
              data: {
                status: OrderStatus.REFUNDED,
                reservationExpiresAt: null,
                inventoryReleasedAt: payment.order.inventoryReleasedAt ?? now,
              },
            });
            await tx.discountUsage.deleteMany({ where: { orderId: payment.orderId } });
          } else {
            const reason = 'Partial refund received before inventory was committed';
            await tx.order.update({
              where: { id: payment.orderId },
              data: {
                status: OrderStatus.PAYMENT_REVIEW,
                reservationExpiresAt: null,
                internalNote: this.appendNote(payment.order.internalNote, reason),
              },
            });
          }
        } else {
          const fullRefund = advance.status === PaymentStatus.REFUNDED;
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: advance.status,
              activeAttemptKey: null,
              providerInitStartedAt: null,
              refundedAmount: advance.refundedAmount,
              refundedAt: fullRefund ? now : payment.refundedAt,
              providerTransactionId: event.providerTransactionId ?? payment.providerTransactionId,
              lastWebhookAt: now,
            },
          });
          // Inventory was already sold. A financial refund alone must not silently
          // restock physical inventory; returns/restocking is handled separately.
          await tx.order.update({
            where: { id: payment.orderId },
            data: {
              status: fullRefund ? OrderStatus.REFUNDED : OrderStatus.PARTIALLY_REFUNDED,
            },
          });
        }

        await tx.paymentWebhookEvent.update({
          where: { id: webhookId },
          data: {
            paymentId: payment.id,
            orderId: payment.orderId,
            processedAt: new Date(),
            processingError: validationError || null,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async applySimpleEvent(
    paymentId: string,
    webhookId: string,
    event: ProviderWebhookEvent,
    nextStatus: PaymentStatus,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!payment) throw new NotFoundException('Payment not found');
      const terminal = [...PAID_PAYMENT_STATUSES, PaymentStatus.CANCELLED].includes(payment.status);
      const now = event.occurredAt ?? new Date();

      if (!terminal) {
        const remainsActive = ACTIVE_PAYMENT_STATUSES.includes(nextStatus);
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: nextStatus,
            activeAttemptKey: remainsActive
              ? payment.activeAttemptKey ?? this.activeAttemptKey(payment.orderId)
              : null,
            providerInitStartedAt: null,
            failureReason:
              nextStatus === PaymentStatus.FAILED
                ? event.failureReason ?? 'Payment failed'
                : null,
            providerTransactionId: event.providerTransactionId ?? payment.providerTransactionId,
            lastWebhookAt: now,
          },
        });
      }
      await tx.paymentWebhookEvent.update({
        where: { id: webhookId },
        data: {
          paymentId: payment.id,
          orderId: payment.orderId,
          processedAt: new Date(),
          processingError: null,
        },
      });
    });
  }

  private async releaseReservedInventory(
    tx: Prisma.TransactionClient,
    orderId: string,
    items: Array<{ variantId: string | null; quantity: number; sku: string }>,
    context: string,
  ): Promise<void> {
    for (const item of items) {
      if (!item.variantId) continue;
      const changed = await tx.$executeRaw`
        UPDATE "Inventory"
        SET "reservedQuantity" = "reservedQuantity" - ${item.quantity},
            "updatedAt" = NOW()
        WHERE "variantId" = ${item.variantId}
          AND "reservedQuantity" >= ${item.quantity}
      `;
      if (changed !== 1) {
        throw new InventoryCommitError(
          `Reservation release mismatch for ${item.sku} (${context}, order ${orderId})`,
        );
      }
    }
  }

  private async createOrLoadWebhook(event: ProviderWebhookEvent, payload: unknown) {
    try {
      return await this.prisma.paymentWebhookEvent.create({
        data: {
          provider: event.provider,
          externalEventId: event.externalEventId,
          eventType: event.eventType,
          payload: payload as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (this.prismaErrorCode(error) !== 'P2002') throw error;
      const existing = await this.prisma.paymentWebhookEvent.findUnique({
        where: {
          provider_externalEventId: {
            provider: event.provider,
            externalEventId: event.externalEventId,
          },
        },
      });
      if (!existing) throw error;
      return existing;
    }
  }

  private async findPaymentForEvent(event: ProviderWebhookEvent): Promise<Payment | null> {
    if (event.localPaymentId) {
      const byLocalId = await this.prisma.payment.findFirst({
        where: { id: event.localPaymentId, provider: event.provider },
      });
      if (byLocalId) return byLocalId;
    }
    if (event.providerPaymentId) {
      const byPayment = await this.prisma.payment.findFirst({
        where: {
          provider: event.provider,
          providerPaymentId: event.providerPaymentId,
        },
      });
      if (byPayment) return byPayment;
    }
    if (event.providerOrderId) {
      const byOrder = await this.prisma.payment.findFirst({
        where: {
          provider: event.provider,
          providerOrderId: event.providerOrderId,
        },
        orderBy: { createdAt: 'desc' },
      });
      if (byOrder) return byOrder;
    }
    if (event.providerTransactionId) {
      return this.prisma.payment.findFirst({
        where: {
          provider: event.provider,
          providerTransactionId: event.providerTransactionId,
        },
        orderBy: { createdAt: 'desc' },
      });
    }
    return null;
  }

  private providerCorrelationError(payment: Payment, event: ProviderWebhookEvent): string | null {
    if (event.providerPaymentId && payment.providerPaymentId && event.providerPaymentId !== payment.providerPaymentId) {
      return 'Provider payment identifier conflicts with the stored payment';
    }
    if (event.providerOrderId && payment.providerOrderId && event.providerOrderId !== payment.providerOrderId) {
      return 'Provider order identifier conflicts with the stored payment';
    }
    if (event.provider === PaymentProvider.PAYMOB) {
      if (!event.providerOrderId || !payment.providerOrderId) {
        return 'Paymob callback is missing a signed provider order correlation';
      }
      if (event.merchantReference) {
        const expected = `altura_${payment.id}`;
        if (event.merchantReference !== expected) {
          return 'Paymob merchant reference conflicts with the correlated payment';
        }
      }
    }
    if (
      event.providerTransactionId &&
      payment.providerTransactionId &&
      event.providerTransactionId !== payment.providerTransactionId
    ) {
      return 'Provider transaction identifier conflicts with the stored payment';
    }
    return null;
  }

  private async markWebhookProcessed(
    webhookId: string,
    paymentId: string,
    orderId: string,
    processingError?: string,
  ) {
    await this.prisma.paymentWebhookEvent.update({
      where: { id: webhookId },
      data: {
        paymentId,
        orderId,
        processedAt: new Date(),
        processingError,
      },
    });
  }

  private paidPaymentData(event: ProviderWebhookEvent, now: Date): Prisma.PaymentUpdateInput {
    return {
      status: PaymentStatus.PAID,
      paidAt: now,
      activeAttemptKey: null,
      providerInitStartedAt: null,
      failureReason: null,
      providerTransactionId: event.providerTransactionId,
      lastWebhookAt: now,
    };
  }

  private providerAmountMismatch(payment: Payment, event: ProviderWebhookEvent): string | null {
    if (event.currency && event.currency.toUpperCase() !== payment.currency.toUpperCase()) {
      return `Provider currency mismatch: expected ${payment.currency}, received ${event.currency}`;
    }
    if (event.amountMinor !== undefined) {
      const received = fromMinorUnits(event.amountMinor, payment.currency);
      if (!received.eq(payment.amount)) {
        return `Provider amount mismatch: expected ${payment.amount.toFixed(2)}, received ${received.toFixed(2)}`;
      }
    }
    return null;
  }

  private assertOrderAccess(order: PaymentOrder, userId?: string, guestEmail?: string): void {
    if (userId) {
      if (order.userId !== userId) throw new NotFoundException('Order not found');
      return;
    }
    if (order.userId) throw new NotFoundException('Order not found');
    if (!guestEmail || order.email.toLowerCase() !== guestEmail.trim().toLowerCase()) {
      throw new NotFoundException('Order not found');
    }
  }

  private assertOrderPayable(order: PaymentOrder): void {
    if (
      order.status !== OrderStatus.PENDING ||
      order.inventoryCommittedAt ||
      order.inventoryReleasedAt
    ) {
      throw new ConflictException(`Order cannot accept a payment while status is ${order.status}`);
    }
    if (order.reservationExpiresAt && order.reservationExpiresAt <= new Date()) {
      throw new ConflictException('Order reservation has expired; create a new checkout');
    }
  }

  private activeAttemptKey(orderId: string): string {
    return orderId;
  }

  private assertPaymentIdempotency(
    payment: Payment,
    orderId: string,
    provider: PaymentProvider,
    fingerprint: string,
  ): void {
    if (
      payment.orderId !== orderId ||
      payment.provider !== provider ||
      payment.idempotencyFingerprint !== fingerprint
    ) {
      throw new ConflictException('Payment idempotency key was used with a different request');
    }
  }

  private configuredProvider(): PaymentProvider {
    const mode = this.config.get<string>('PAYMENT_MODE', 'mock').toLowerCase();
    if (mode === 'stripe') return PaymentProvider.STRIPE;
    if (mode === 'paymob') return PaymentProvider.PAYMOB;
    return PaymentProvider.MOCK;
  }

  private adapterFor(provider: PaymentProvider): PaymentProviderAdapter {
    switch (provider) {
      case PaymentProvider.MOCK:
        return this.mockProvider;
      case PaymentProvider.STRIPE:
        return this.stripeProvider;
      case PaymentProvider.PAYMOB:
        return this.paymobProvider;
      default:
        throw new ServiceUnavailableException('Payment provider is not supported');
    }
  }

  private presentInitialization(
    payment: Payment,
    idempotentReplay: boolean,
    result?: ProviderCreatePaymentResult,
  ) {
    const publicKey =
      result?.publicKey ??
      (payment.provider === PaymentProvider.STRIPE
        ? this.config.get<string>('STRIPE_PUBLISHABLE_KEY')?.trim()
        : payment.provider === PaymentProvider.PAYMOB
          ? this.config.get<string>('PAYMOB_PUBLIC_KEY')?.trim()
          : undefined);

    const canContinueCheckout = ACTIVE_PAYMENT_STATUSES.includes(payment.status);

    return {
      idempotentReplay,
      payment: {
        id: payment.id,
        orderId: payment.orderId,
        provider: payment.provider,
        status: payment.status,
        amount: Number(payment.amount),
        currency: payment.currency,
      },
      checkout: {
        mode:
          payment.provider === PaymentProvider.MOCK
            ? 'mock'
            : payment.provider === PaymentProvider.STRIPE
              ? 'stripe_client_secret'
              : 'paymob_intention',
        clientSecret: canContinueCheckout ? payment.checkoutSecret ?? undefined : undefined,
        publicKey: canContinueCheckout ? publicKey || undefined : undefined,
        checkoutUrl: canContinueCheckout ? result?.checkoutUrl : undefined,
      },
    };
  }

  private appendNote(current: string | null, note: string): string {
    const stamped = `[${new Date().toISOString()}] ${note}`;
    return current ? `${current}\n${stamped}` : stamped;
  }

  private fingerprint(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message.slice(0, 500);
    return 'Payment provider error';
  }

  private prismaErrorCode(error: unknown): string | undefined {
    if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
}
