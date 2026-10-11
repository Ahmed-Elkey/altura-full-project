ALTER TYPE "DiscountType" ADD VALUE IF NOT EXISTS 'BUY_X_GET_Y';
ALTER TABLE "Discount" ADD COLUMN "offerSnapshot" JSONB;
ALTER TABLE "OrderItem" ADD COLUMN "promotionAllocation" JSONB;
ALTER TABLE "NewsletterSubscriber" ADD COLUMN "rewardIssuedAt" TIMESTAMP(3), ADD COLUMN "offerSnapshot" JSONB;
UPDATE "NewsletterSubscriber" SET "rewardIssuedAt" = "createdAt" WHERE "rewardDiscountId" IS NOT NULL;
CREATE TABLE "NewsletterOffer" (
 "id" TEXT NOT NULL DEFAULT 'newsletter', "version" INTEGER NOT NULL DEFAULT 1,
 "config" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "NewsletterOffer_pkey" PRIMARY KEY ("id")
);
