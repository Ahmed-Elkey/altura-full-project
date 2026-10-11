import { BadRequestException } from "@nestjs/common";
export type OfferType =
  "PERCENTAGE" | "FIXED_AMOUNT" | "FREE_SHIPPING" | "BUY_X_GET_Y" | "NONE";
export interface OfferConfig {
  enabled: boolean;
  type: OfferType;
  value: number;
  currency: string;
  validityDays: number;
  usageLimit: number;
  minimumSubtotal: number | null;
  maximumDiscount: number | null;
  buyQuantity: number;
  giftQuantity: number;
  maxGiftUnits: number | null;
  eligibleProductIds: string[];
  eligibleCategoryIds: string[];
  title: string;
  welcomeText: string;
}
export const DEFAULT_OFFER: OfferConfig = {
  enabled: true,
  type: "PERCENTAGE",
  value: 10,
  currency: "EGP",
  validityDays: 30,
  usageLimit: 1,
  minimumSubtotal: null,
  maximumDiscount: null,
  buyQuantity: 2,
  giftQuantity: 1,
  maxGiftUnits: null,
  eligibleProductIds: [],
  eligibleCategoryIds: [],
  title: "Welcome to ALTURA",
  welcomeText: "Move higher, together.",
};
export function normalizeOffer(raw: unknown): OfferConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new BadRequestException("Invalid offer settings");
  const c = raw as OfferConfig;
  if (Object.keys(c).some((k) => !Object.prototype.hasOwnProperty.call(DEFAULT_OFFER,k)))
    throw new BadRequestException("Unknown offer setting");
  const fail = () => {
    throw new BadRequestException("Invalid offer settings");
  };
  const int = (n: number, min: number, max: number) =>
    Number.isInteger(n) && n >= min && n <= max;
  const money = (n: number | null) =>
    n === null ||
    (typeof n === "number" &&
      Number.isFinite(n) &&
      n >= 0 &&
      n <= 1000000 &&
      Math.abs(n * 100 - Math.round(n * 100)) < 0.000001);
  if (
    typeof c.enabled !== "boolean" ||
    ![
      "PERCENTAGE",
      "FIXED_AMOUNT",
      "FREE_SHIPPING",
      "BUY_X_GET_Y",
      "NONE",
    ].includes(c.type) ||
    !Number.isFinite(c.value) ||
    c.value < 0 ||
    c.value > 1000000 ||
    (c.type === "PERCENTAGE" && (c.value < 1 || c.value > 100)) ||
    !money(c.value) ||
    typeof c.currency !== "string" ||
    !/^[A-Z]{3}$/.test(c.currency) ||
    !int(c.validityDays, 1, 365) ||
    !int(c.usageLimit, 1, 100) ||
    !money(c.minimumSubtotal) ||
    !money(c.maximumDiscount) ||
    !int(c.buyQuantity, 1, 100) ||
    !int(c.giftQuantity, 1, 100) ||
    (c.maxGiftUnits !== null && !int(c.maxGiftUnits, 1, 10000))
  )
    fail();
  for (const ids of [c.eligibleProductIds, c.eligibleCategoryIds])
    if (
      !Array.isArray(ids) ||
      ids.length > 100 ||
      ids.some(
        (id) => typeof id !== "string" || !id.length || id.length > 100,
      ) ||
      new Set(ids).size !== ids.length
    )
      fail();
  if (
    typeof c.title !== "string" ||
    !c.title.trim() ||
    c.title.length > 120 ||
    typeof c.welcomeText !== "string" ||
    c.welcomeText.length > 1000
  )
    fail();
  return {
    ...c,
    title: c.title.trim(),
    welcomeText: c.welcomeText.trim(),
    eligibleProductIds: [...c.eligibleProductIds],
    eligibleCategoryIds: [...c.eligibleCategoryIds],
    value: ["FREE_SHIPPING", "BUY_X_GET_Y", "NONE"].includes(c.type)
      ? 0
      : c.value,
  };
}
export function presentOffer(
  c: OfferConfig,
  version: number,
  updatedAt: string | null = null,
) {
  const active = c.enabled && c.type !== "NONE";
  const incentive =
    c.type === "PERCENTAGE"
      ? `${c.value}% off products`
      : c.type === "FIXED_AMOUNT"
        ? `${c.currency} ${c.value.toFixed(2)} off products`
        : c.type === "FREE_SHIPPING"
          ? "free shipping"
          : `Buy ${c.buyQuantity}, get ${c.giftQuantity} free`;
  const description = active ? incentive : "News and updates from ALTURA";
  const restrictions = [
    c.minimumSubtotal !== null
      ? `Minimum product subtotal: ${c.currency} ${c.minimumSubtotal.toFixed(2)}.`
      : "",
    c.maximumDiscount !== null && c.type === "PERCENTAGE"
      ? `Maximum discount: ${c.currency} ${c.maximumDiscount.toFixed(2)}.`
      : "",
    c.eligibleProductIds.length || c.eligibleCategoryIds.length
      ? "Selected eligible products only."
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  const typeTerms =
    c.type === "FREE_SHIPPING"
      ? "Applies to the selected available shipping method. Products and tax are excluded."
      : c.type === "BUY_X_GET_Y"
        ? `Add ${c.buyQuantity + c.giftQuantity} eligible units for each group. The cheapest ${c.giftQuantity} eligible units in each group are free.${c.maxGiftUnits ? ` Maximum ${c.maxGiftUnits} free units per order.` : ""} Discounted bundles must be returned together. Shipping and tax are excluded.`
        : "Shipping and tax are excluded.";
  const terms = active
    ? `Confirm by email. ${c.usageLimit === 1 ? "One use" : `${c.usageLimit} uses`} within ${c.validityDays} days from issue, with the same email at checkout. ${typeTerms} ${restrictions} One code per order. Re-subscribing does not renew a used or expired reward.`
        .replace(/ +/g, " ")
        .trim()
    : "Confirm your email to receive ALTURA updates. You can unsubscribe at any time.";
  return {
    version,
    config: c,
    headline: active
      ? `Join ALTURA for ${incentive}.`
      : "Join the ALTURA newsletter.",
    description,
    terms,
    updatedAt,
  };
}
export function issuedOffer(discount: any): OfferConfig {
  if (discount?.offerSnapshot) return normalizeOffer(discount.offerSnapshot);
  return {
    ...DEFAULT_OFFER,
    type: discount?.type || "PERCENTAGE",
    value: Number(discount?.value ?? 10),
    currency: discount?.currency || "EGP",
    usageLimit: discount?.usageLimit || 1,
    minimumSubtotal:
      discount?.minimumSubtotal === null
        ? null
        : Number(discount?.minimumSubtotal ?? 0) || null,
    maximumDiscount:
      discount?.maximumDiscount === null
        ? null
        : Number(discount?.maximumDiscount ?? 0) || null,
  };
}
