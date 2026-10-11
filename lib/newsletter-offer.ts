export type OfferConfig = {
 enabled: boolean; type: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_SHIPPING' | 'BUY_X_GET_Y' | 'NONE'; value: number; currency: string; validityDays: number; usageLimit: number;
 minimumSubtotal: number | null; maximumDiscount: number | null; buyQuantity: number; giftQuantity: number; maxGiftUnits: number | null;
 eligibleProductIds: string[]; eligibleCategoryIds: string[]; title: string; welcomeText: string;
};
export type OfferPresentation = {version:number;config:OfferConfig;headline:string;description:string;terms:string;updatedAt:string|null};
export type NewsletterReward = {code:string;type:string;value:number;expiresAt:string;offer?:OfferConfig|null;description?:string;terms?:string;active?:boolean;usageCount?:number;usageLimit?:number|null};
export const rewardDescription = (reward:NewsletterReward) => reward.description || (reward.type === 'PERCENTAGE' ? `${reward.value}% off products.` : reward.type === 'FREE_SHIPPING' ? 'Free shipping.' : reward.type === 'FIXED_AMOUNT' ? `${reward.value} ${reward.offer?.currency || 'EGP'} off products.` : 'Your personal welcome reward.');
export const rewardTerms = (reward:NewsletterReward) => reward.terms || 'Use once within 30 days, with your subscribed email at checkout. Applies to products only.';
