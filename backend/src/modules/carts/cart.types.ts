export type CommerceOwner =
  | { userId: string; sessionId?: never; expiresAt?: never }
  | { userId?: never; sessionId: string; expiresAt: Date };

export interface CartValidationIssue {
  itemId: string;
  variantId: string;
  code: 'PRODUCT_UNAVAILABLE' | 'VARIANT_UNAVAILABLE' | 'OUT_OF_STOCK' | 'QUANTITY_REDUCED';
  message: string;
  requestedQuantity: number;
  availableQuantity: number;
}
