import { formatMoney } from "@/lib/money";
import type { PromotionSummary } from "@/lib/promotion-types";

export function PromotionBreakdown({
  promotion,
  currency,
}: {
  promotion: PromotionSummary;
  currency: string;
}) {
  return (
    <div
      className="customer-order__card"
      role="status"
      aria-label="Buy/get offer breakdown"
    >
      <strong>
        {promotion.buyQuantity !== undefined
          ? `Buy ${promotion.buyQuantity}, get ${promotion.giftQuantity} free`
          : "Buy/get offer"}
      </strong>
      <p className="customer-order__muted">
        {promotion.eligibleUnits !== undefined
          ? `${promotion.eligibleUnits} eligible units · `
          : ""}
        {promotion.qualifyingUnits} units in qualifying bundles ·{" "}
        {promotion.freeUnits} free{" "}
        {promotion.freeUnits === 1 ? "unit" : "units"}
      </p>
      <p>Savings: {formatMoney(promotion.savings, currency)}</p>
      {promotion.discountedUnits > promotion.freeUnits ? (
        <p className="customer-order__muted">
          {promotion.discountedUnits - promotion.freeUnits} additional unit(s)
          receive a capped discount.
        </p>
      ) : null}
      {promotion.capReached ? (
        <p className="customer-order__muted">
          The offer limit for this order has been reached.
        </p>
      ) : promotion.remainingUnits ? (
        <p className="customer-order__muted">
          Add {promotion.remainingUnits} more eligible{" "}
          {promotion.remainingUnits === 1 ? "unit" : "units"} for the next gift
          bundle.
        </p>
      ) : null}
      {promotion.discountedUnits > 0 ? (
        <p className="customer-order__muted">
          Return each discounted bundle together. Free units have no refundable
          value.
        </p>
      ) : null}
    </div>
  );
}
