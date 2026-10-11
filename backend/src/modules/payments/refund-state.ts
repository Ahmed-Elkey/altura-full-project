import { PaymentStatus, Prisma } from '@prisma/client';

export type RefundStateDecision =
  | { kind: 'advance'; status: PaymentStatus; refundedAmount: Prisma.Decimal }
  | { kind: 'stale'; status: PaymentStatus; refundedAmount: Prisma.Decimal; reason: string }
  | { kind: 'invalid'; reason: string };

/**
 * Reconcile a provider's cumulative refund amount without allowing an older
 * event to move the local payment backwards.
 */
export function reconcileRefundState(input: {
  capturedAmount: Prisma.Decimal;
  currentRefundedAmount: Prisma.Decimal;
  incomingAmount: Prisma.Decimal;
  incomingStatus: PaymentStatus;
}): RefundStateDecision {
  const { capturedAmount, currentRefundedAmount, incomingAmount, incomingStatus } = input;

  if (incomingAmount.lt(0)) {
    return { kind: 'invalid', reason: 'Provider refund amount cannot be negative' };
  }
  if (incomingAmount.gt(capturedAmount)) {
    return {
      kind: 'invalid',
      reason: `Provider refund exceeds captured amount: ${incomingAmount.toFixed(2)} > ${capturedAmount.toFixed(2)}`,
    };
  }
  if (incomingStatus === PaymentStatus.REFUNDED && incomingAmount.lt(capturedAmount)) {
    return { kind: 'invalid', reason: 'Provider marked a partial amount as fully refunded' };
  }
  if (incomingAmount.lte(currentRefundedAmount)) {
    return {
      kind: 'stale',
      status: currentRefundedAmount.gte(capturedAmount)
        ? PaymentStatus.REFUNDED
        : PaymentStatus.PARTIALLY_REFUNDED,
      refundedAmount: currentRefundedAmount,
      reason: 'Ignored stale or duplicate refund event',
    };
  }

  return {
    kind: 'advance',
    status: incomingAmount.gte(capturedAmount)
      ? PaymentStatus.REFUNDED
      : PaymentStatus.PARTIALLY_REFUNDED,
    refundedAmount: incomingAmount,
  };
}
