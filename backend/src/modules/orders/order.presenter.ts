import {
  presentPromotionLine,
  summarizePromotion,
} from "../discounts/discounts.service";
import { Prisma } from "@prisma/client";

export const orderInclude = {
  items: { orderBy: { createdAt: "asc" as const } },
  addresses: { orderBy: { type: "asc" as const } },
  payments: { orderBy: { createdAt: "desc" as const } },
  shipments: { orderBy: { createdAt: "desc" as const } },
} satisfies Prisma.OrderInclude;

export type OrderRecord = Prisma.OrderGetPayload<{
  include: typeof orderInclude;
}>;

export function presentOrder(order: OrderRecord) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentMethod: order.payments.some(
      (payment) => payment.provider === "CASH_ON_DELIVERY",
    )
      ? "CASH_ON_DELIVERY"
      : "CARD",
    paymentStatus: order.payments[0]?.status ?? "PENDING",
    email: order.email,
    phone: order.phone,
    currency: order.currency,
    totals: {
      subtotal: Number(order.subtotal),
      discountTotal: Number(order.discountTotal),
      shippingTotal: Number(order.shippingTotal),
      taxTotal: Number(order.taxTotal),
      grandTotal: Number(order.grandTotal),
    },
    appliedCode: order.appliedCode,
    promotion: summarizePromotion(order.items),
    customerNote: order.customerNote,
    placedAt: order.placedAt,
    reservationExpiresAt: order.reservationExpiresAt,
    inventoryCommittedAt: order.inventoryCommittedAt,
    inventoryReleasedAt: order.inventoryReleasedAt,
    cancelledAt: order.cancelledAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: order.items.map((item) => ({
      id: item.id,
      sku: item.sku,
      productId: item.productId,
      variantId: item.variantId,
      productName: item.productName,
      variantName: item.variantName,
      colorName: item.colorName,
      size: item.size,
      productImageUrl: item.productImageUrl,
      unitPrice: Number(item.unitPrice),
      quantity: item.quantity,
      lineTotal: Number(item.lineTotal),
      promotionAllocation: item.promotionAllocation,
      promotion: presentPromotionLine(item),
    })),
    addresses: order.addresses.map((address) => ({
      type: address.type,
      recipientName: address.recipientName,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      region: address.region,
      postalCode: address.postalCode,
      countryCode: address.countryCode,
    })),
    payments: order.payments.map((payment) => ({
      id: payment.id,
      provider: payment.provider,
      status: payment.status,
      amount: Number(payment.amount),
      refundedAmount: Number(payment.refundedAmount),
      currency: payment.currency,
      failureReason: payment.failureReason,
      paidAt: payment.paidAt,
      refundedAt: payment.refundedAt,
      lastWebhookAt: payment.lastWebhookAt,
      createdAt: payment.createdAt,
    })),
    shipments: order.shipments.map((shipment) => ({
      id: shipment.id,
      status: shipment.status,
      carrier: shipment.carrier,
      service: shipment.service,
      shippingMethodId: shipment.shippingMethodId,
      priceSnapshot:
        shipment.priceSnapshot === null ? null : Number(shipment.priceSnapshot),
      currencySnapshot: shipment.currencySnapshot,
      trackingNumber: shipment.trackingNumber,
      trackingUrl: shipment.trackingUrl,
      shippedAt: shipment.shippedAt,
      deliveredAt: shipment.deliveredAt,
    })),
  };
}

function maskGuestEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}

/** Minimal order shape for the unauthenticated order-number + email flow. */
export function presentGuestOrder(order: OrderRecord) {
  const full = presentOrder(order);
  return {
    orderNumber: full.orderNumber,
    status: full.status,
    paymentMethod: full.paymentMethod,
    paymentStatus: full.paymentStatus,
    email: maskGuestEmail(full.email),
    currency: full.currency,
    totals: full.totals,
    promotion: full.promotion,
    placedAt: full.placedAt,
    createdAt: full.createdAt,
    items: full.items.map((item) => ({
      id: item.id,
      productName: item.productName,
      variantName: item.variantName,
      colorName: item.colorName,
      size: item.size,
      productImageUrl: item.productImageUrl,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
      promotion: item.promotion,
    })),
    shipments: full.shipments.map((shipment) => ({
      status: shipment.status,
      trackingNumber: shipment.trackingNumber,
      trackingUrl: shipment.trackingUrl,
      shippedAt: shipment.shippedAt,
      deliveredAt: shipment.deliveredAt,
    })),
  };
}
