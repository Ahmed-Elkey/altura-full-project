-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'AWAITING_CUSTOMER', 'RESOLVED');

-- CreateEnum
CREATE TYPE "SupportAuthorType" AS ENUM ('CUSTOMER', 'ADMIN');

-- CreateEnum
CREATE TYPE "SupportAccessKind" AS ENUM ('LINK', 'SESSION');

-- CreateEnum
CREATE TYPE "SupportDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "subject" VARCHAR(160) NOT NULL,
    "orderReference" VARCHAR(80),
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "creationKey" TEXT NOT NULL,
    "creationFingerprint" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "lastSequence" INTEGER NOT NULL DEFAULT 1,
    "lastCustomerSequence" INTEGER NOT NULL DEFAULT 1,
    "lastAdminSequence" INTEGER NOT NULL DEFAULT 0,
    "customerReadSequence" INTEGER NOT NULL DEFAULT 1,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorType" "SupportAuthorType" NOT NULL,
    "actorUserId" TEXT,
    "body" VARCHAR(5000) NOT NULL,
    "submissionKey" TEXT NOT NULL,
    "ticketVersion" INTEGER NOT NULL DEFAULT 0,
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportGuestAccess" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "kind" "SupportAccessKind" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportGuestAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportAdminRead" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readSequence" INTEGER NOT NULL,
    "unread" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SupportAdminRead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportEmailDelivery" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "messageId" TEXT,
    "recipient" VARCHAR(254) NOT NULL,
    "payloadEncrypted" TEXT NOT NULL,
    "status" "SupportDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseId" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportEmailDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_reference_key" ON "SupportTicket"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_creationKey_key" ON "SupportTicket"("creationKey");

-- CreateIndex
CREATE INDEX "SupportTicket_ownerUserId_lastMessageAt_idx" ON "SupportTicket"("ownerUserId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "SupportTicket_status_lastMessageAt_idx" ON "SupportTicket"("status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "SupportTicket_lastMessageAt_idx" ON "SupportTicket"("lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupportMessage_ticketId_submissionKey_key" ON "SupportMessage"("ticketId", "submissionKey");

-- CreateIndex
CREATE UNIQUE INDEX "SupportMessage_ticketId_sequence_key" ON "SupportMessage"("ticketId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "SupportGuestAccess_tokenHash_key" ON "SupportGuestAccess"("tokenHash");

-- CreateIndex
CREATE INDEX "SupportGuestAccess_ticketId_kind_expiresAt_idx" ON "SupportGuestAccess"("ticketId", "kind", "expiresAt");

-- CreateIndex
CREATE INDEX "SupportGuestAccess_expiresAt_idx" ON "SupportGuestAccess"("expiresAt");

-- CreateIndex
CREATE INDEX "SupportAdminRead_userId_unread_idx" ON "SupportAdminRead"("userId", "unread");

-- CreateIndex
CREATE UNIQUE INDEX "SupportAdminRead_ticketId_userId_key" ON "SupportAdminRead"("ticketId", "userId");

-- CreateIndex
CREATE INDEX "SupportEmailDelivery_status_nextAttemptAt_idx" ON "SupportEmailDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "SupportEmailDelivery_status_leaseExpiresAt_idx" ON "SupportEmailDelivery"("status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "SupportEmailDelivery_ticketId_createdAt_idx" ON "SupportEmailDelivery"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportGuestAccess" ADD CONSTRAINT "SupportGuestAccess_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportAdminRead" ADD CONSTRAINT "SupportAdminRead_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportAdminRead" ADD CONSTRAINT "SupportAdminRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportEmailDelivery" ADD CONSTRAINT "SupportEmailDelivery_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportEmailDelivery" ADD CONSTRAINT "SupportEmailDelivery_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "SupportMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

