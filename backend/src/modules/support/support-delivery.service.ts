import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { randomBytes } from "crypto";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PasswordResetMailService } from "../auth/password-reset-mail.service";
import { buildSupportEmail, SupportCrypto } from "./support-email";
@Injectable()
export class SupportDeliveryService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: PasswordResetMailService,
    private readonly crypto: SupportCrypto,
  ) {}
  onModuleInit() {
    if (
      this.config.get<boolean>("SUPPORT_EMAIL_WORKER_ENABLED", true) === false
    )
      return;
    this.timer = setInterval(
      () => {
        void this.processPending().catch(() => undefined);
      },
      this.config.get<number>("SUPPORT_EMAIL_POLL_MS", 5000),
    );
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async processPending(ticketId?: string) {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date(),
        maxAttempts = this.config.get<number>("SUPPORT_EMAIL_MAX_ATTEMPTS", 5);
      // A process can die on its final attempt; don't leave that exhausted lease stuck forever.
      await this.prisma.supportEmailDelivery.updateMany({
        where: {
          ...(ticketId ? { ticketId } : {}),
          status: "SENDING",
          attempts: { gte: maxAttempts },
          leaseExpiresAt: { lte: now },
        },
        data: { status: "FAILED", leaseId: null, leaseExpiresAt: null },
      });
      const eligible: Prisma.SupportEmailDeliveryWhereInput = {
        ...(ticketId ? { ticketId } : {}),
        attempts: { lt: maxAttempts },
        OR: [
          {
            status: { in: ["PENDING", "FAILED"] },
            nextAttemptAt: { lte: now },
          },
          { status: "SENDING", leaseExpiresAt: { lte: now } },
        ],
      };
      const candidates = await this.prisma.supportEmailDelivery.findMany({
        where: eligible,
        orderBy: { createdAt: "asc" },
        take: 10,
      });
      for (const row of candidates) {
        const leaseId = randomBytes(16).toString("hex");
        const claimed = await this.prisma.supportEmailDelivery.updateMany({
          where: { id: row.id, ...eligible },
          data: {
            status: "SENDING",
            attempts: { increment: 1 },
            leaseId,
            leaseExpiresAt: new Date(Date.now() + 120000),
          },
        });
        if (!claimed.count) continue;
        const fence = { id: row.id, status: "SENDING" as const, leaseId };
        try {
          const payload = this.crypto.decrypt(row.payloadEncrypted);
          const url = new URL(payload.url);
          if (url.origin !== this.crypto.origin())
            throw new Error("Unsafe support destination");
          await this.mail.sendMessage(
            row.recipient,
            buildSupportEmail(payload),
          );
          await this.prisma.supportEmailDelivery.updateMany({
            where: fence,
            data: {
              status: "SENT",
              sentAt: new Date(),
              leaseId: null,
              leaseExpiresAt: null,
            },
          });
        } catch {
          const attempts = row.attempts + 1;
          await this.prisma.supportEmailDelivery.updateMany({
            where: fence,
            data: {
              status: "FAILED",
              leaseId: null,
              leaseExpiresAt: null,
              nextAttemptAt: new Date(
                Date.now() + Math.min(3600000, 30000 * 2 ** (attempts - 1)),
              ),
            },
          });
        }
      }
    } finally {
      this.running = false;
    }
  }
}
