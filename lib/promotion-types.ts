export type PromotionLine = {
  freeUnits: number;
  discountedUnits: number;
  qualifyingUnits: number;
  savings: number;
  payableTotal: number;
};
export type PromotionSummary = {
  freeUnits: number;
  discountedUnits: number;
  qualifyingUnits: number;
  savings: number;
  bundleCount: number;
  buyQuantity?: number;
  giftQuantity?: number;
  eligibleUnits?: number;
  remainingUnits?: number;
  capReached?: boolean;
};
