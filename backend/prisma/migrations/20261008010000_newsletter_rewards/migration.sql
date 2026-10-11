ALTER TYPE "NewsletterStatus" ADD VALUE 'PENDING';
ALTER TABLE "NewsletterSubscriber"
 ADD COLUMN "confirmedAt" TIMESTAMP(3),
 ADD COLUMN "rewardDiscountId" TEXT,
 ADD COLUMN "welcomeStatus" TEXT NOT NULL DEFAULT 'PENDING',
 ADD COLUMN "welcomeSentAt" TIMESTAMP(3),
 ADD COLUMN "welcomeAttemptedAt" TIMESTAMP(3),
 ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "NewsletterSubscriber_rewardDiscountId_key" ON "NewsletterSubscriber"("rewardDiscountId");
ALTER TABLE "NewsletterSubscriber" ADD CONSTRAINT "NewsletterSubscriber_rewardDiscountId_fkey" FOREIGN KEY ("rewardDiscountId") REFERENCES "Discount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
