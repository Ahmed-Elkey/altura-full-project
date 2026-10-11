import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  Prisma,
  SupportAccessKind,
  SupportAuthorType,
  SupportTicketStatus,
} from "@prisma/client";
import { randomBytes } from "crypto";
import { AuthUser } from "../../common/auth/auth-user";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  CreateSupportDto,
  SupportListDto,
  SupportReplyDto,
  SupportStatusDto,
} from "./dto/support.dto";
import {
  SupportCrypto,
  SupportEmailPayload,
  supportHash,
} from "./support-email";

type Tx = Prisma.TransactionClient;
type Viewer =
  | { kind: "CUSTOMER"; user: AuthUser }
  | { kind: "ADMIN"; user: AuthUser }
  | { kind: "GUEST"; token: string };
const detailInclude = {
  messages: { orderBy: { sequence: "asc" as const } },
  deliveries: { orderBy: { createdAt: "asc" as const } },
  adminReads: true,
};
@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly crypto: SupportCrypto,
  ) {}
  private async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (e: any) {
        if (!["P2034", "P2002"].includes(e?.code)) throw e;
        if (attempt >= 3)
          throw new ConflictException(
            "Conversation changed; refresh and retry",
          );
      }
    }
  }
  private missing(): never {
    throw new NotFoundException("Conversation not found");
  }
  private denied(): never {
    throw new UnauthorizedException("Support access is invalid or expired");
  }
  private async activeUser(tx: Tx, user: AuthUser, admin = false) {
    const row = await tx.user.findUnique({ where: { id: user.id } });
    if (!row || row.status !== "ACTIVE" || (admin && row.role !== "ADMIN"))
      return this.missing();
    return row;
  }
  private async authorized(tx: Tx, id: string, viewer: Viewer) {
    if (viewer.kind === "GUEST") {
      if (
        typeof viewer.token !== "string" ||
        !/^[A-Za-z0-9_-]{43}$/.test(viewer.token)
      )
        this.denied();
      const access = await tx.supportGuestAccess.findUnique({
        where: { tokenHash: supportHash(viewer.token) },
      });
      if (
        !access ||
        access.ticketId !== id ||
        access.kind !== "SESSION" ||
        access.expiresAt <= new Date()
      )
        this.denied();
    } else await this.activeUser(tx, viewer.user, viewer.kind === "ADMIN");
    const row = await tx.supportTicket.findUnique({
      where: { id },
      include: detailInclude,
    });
    if (!row) return viewer.kind === "GUEST" ? this.denied() : this.missing();
    if (viewer.kind === "CUSTOMER" && row.ownerUserId !== viewer.user.id)
      this.missing();
    if (viewer.kind === "GUEST" && row.ownerUserId) this.denied();
    return row;
  }
  private present(row: any, viewer: Viewer, detail = true) {
    const unread =
      viewer.kind === "ADMIN"
        ? row.lastCustomerSequence >
          (row.adminReads?.find((r: any) => r.userId === viewer.user.id)
            ?.readSequence || 0)
        : row.lastAdminSequence > row.customerReadSequence;
    return {
      id: row.id,
      reference: row.reference,
      name: row.name,
      email: row.email,
      subject: row.subject,
      orderReference: row.orderReference,
      status: row.status,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastMessageAt: row.lastMessageAt,
      unread,
      ...(detail
        ? {
            messages: row.messages.map((m: any) => ({
              id: m.id,
              authorType: m.authorType,
              body: m.body,
              createdAt: m.createdAt,
            })),
          }
        : {}),
      ...(detail && viewer.kind === "ADMIN"
        ? {
            deliveries: row.deliveries.map((d: any) => ({
              id: d.id,
              messageId: d.messageId,
              status: d.status,
              attempts: d.attempts,
              sentAt: d.sentAt,
            })),
          }
        : {}),
    };
  }
  private async access(
    tx: Tx,
    ticketId: string,
    kind: SupportAccessKind,
    expiresAtCap?: Date,
  ) {
    const token = randomBytes(32).toString("base64url"),
      expiresAt = new Date(
        Math.min(
          Date.now() + (kind === "LINK" ? 30 * 86400000 : 30 * 60000),
          expiresAtCap?.getTime() ?? Infinity,
        ),
      );
    await tx.supportGuestAccess.create({
      data: { ticketId, kind, tokenHash: supportHash(token), expiresAt },
    });
    return { accessToken: token, expiresAt };
  }
  private async queue(
    tx: Tx,
    row: any,
    messageId: string | null,
    body: string,
    kind: SupportEmailPayload["kind"],
    admin = false,
  ) {
    const recipient = admin
      ? this.config.get<string>("SUPPORT_ADMIN_EMAIL")?.trim()
      : row.email;
    if (!recipient) return;
    let url =
      this.crypto.origin() +
      (admin
        ? "/admin/support/"
        : row.ownerUserId
          ? "/account/support/"
          : "/support/") +
      encodeURIComponent(row.id);
    if (!admin && !row.ownerUserId) {
      const link = await this.access(tx, row.id, "LINK");
      url += "#token=" + link.accessToken;
    }
    const payload: SupportEmailPayload = {
      url,
      reference: row.reference,
      name: row.name,
      subject: row.subject,
      body,
      kind,
    };
    await tx.supportEmailDelivery.create({
      data: {
        ticketId: row.id,
        messageId,
        recipient,
        payloadEncrypted: this.crypto.encrypt(payload),
      },
    });
  }
  async create(dto: CreateSupportDto, user?: AuthUser) {
    if (dto.website?.trim())
      throw new BadRequestException("Message could not be accepted");
    return this.transaction(async (tx) => {
      const account = user ? await this.activeUser(tx, user) : null;
      const name = account
        ? (
            [account.firstName, account.lastName].filter(Boolean).join(" ") ||
            "ALTURA customer"
          ).slice(0, 120)
        : dto.name.trim();
      const email = (account?.email || dto.email).trim().toLowerCase(),
        ownerUserId = account?.id || null;
      const normalized = {
        name,
        email,
        ownerUserId,
        subject: dto.subject.trim(),
        orderReference: dto.orderReference?.trim() || null,
        message: dto.message.trim(),
      };
      const creationKey = supportHash(dto.submissionKey),
        fingerprint = supportHash(JSON.stringify(normalized));
      let row = await tx.supportTicket.findUnique({
        where: { creationKey },
        include: detailInclude,
      });
      if (row) {
        if (row.ownerUserId !== ownerUserId) this.missing();
        if (row.creationFingerprint !== fingerprint)
          throw new ConflictException("Submission key was already used");
      } else {
        const ticket = await tx.supportTicket.create({
          data: {
            name,
            email,
            ownerUserId,
            subject: normalized.subject,
            orderReference: normalized.orderReference,
            creationKey,
            creationFingerprint: fingerprint,
            reference: "SUP-" + randomBytes(6).toString("hex").toUpperCase(),
            lastSequence: 1,
            lastCustomerSequence: 1,
            customerReadSequence: 1,
          },
        });
        const message = await tx.supportMessage.create({
          data: {
            ticketId: ticket.id,
            body: normalized.message,
            authorType: "CUSTOMER",
            actorUserId: ownerUserId,
            submissionKey: supportHash(dto.submissionKey),
            sequence: 1,
            ticketVersion: 0,
          },
        });
        await this.queue(tx, ticket, message.id, normalized.message, "CREATED");
        await this.queue(
          tx,
          ticket,
          message.id,
          normalized.message,
          "ADMIN",
          true,
        );
        row = await tx.supportTicket.findUnique({
          where: { id: ticket.id },
          include: detailInclude,
        });
      }
      const initialAccessExpiresAt = new Date(
        row!.createdAt.getTime() + 30 * 60000,
      );
      const access =
        ownerUserId || initialAccessExpiresAt.getTime() <= Date.now()
          ? undefined
          : await this.access(tx, row!.id, "SESSION", initialAccessExpiresAt);
      return {
        ticket: this.present(
          row,
          {
            kind: "CUSTOMER",
            user: user || { id: "", email, role: "CUSTOMER" },
          },
          false,
        ),
        ...(access ? { accessToken: access.accessToken } : {}),
      };
    });
  }
  async exchange(id: string, token: string) {
    return this.transaction(async (tx) => {
      if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token))
        this.denied();
      const link = await tx.supportGuestAccess.findUnique({
        where: { tokenHash: supportHash(token) },
      });
      if (
        !link ||
        link.ticketId !== id ||
        link.kind !== "LINK" ||
        link.expiresAt <= new Date()
      )
        this.denied();
      const row = await tx.supportTicket.findUnique({ where: { id } });
      if (!row || row.ownerUserId) this.denied();
      return this.access(tx, id, "SESSION");
    });
  }
  async recover(id: string, email: string) {
    await this.transaction(async (tx) => {
      const row = await tx.supportTicket.findUnique({ where: { id } });
      if (row && !row.ownerUserId && row.email === email.trim().toLowerCase())
        await this.queue(
          tx,
          row,
          null,
          "Use this link to continue your saved conversation.",
          "RECOVERY",
        );
    });
    return { accepted: true };
  }
  private async detail(id: string, viewer: Viewer) {
    return this.transaction(async (tx) =>
      this.present(await this.authorized(tx, id, viewer), viewer),
    );
  }
  detailCustomer(id: string, user: AuthUser) {
    return this.detail(id, { kind: "CUSTOMER", user });
  }
  detailAdmin(id: string, user: AuthUser) {
    return this.detail(id, { kind: "ADMIN", user });
  }
  detailGuest(id: string, token: string) {
    return this.detail(id, { kind: "GUEST", token });
  }
  private async list(
    query: SupportListDto,
    viewer: Extract<Viewer, { user: AuthUser }>,
  ) {
    const { page = 1, limit = 25, q, status, unread } = query;
    return this.transaction(async (tx) => {
      await this.activeUser(tx, viewer.user, viewer.kind === "ADMIN");
      const where: Prisma.SupportTicketWhereInput = {
        ...(viewer.kind === "CUSTOMER" ? { ownerUserId: viewer.user.id } : {}),
        ...(status ? { status: status as SupportTicketStatus } : {}),
        ...(q
          ? {
              OR: [
                { reference: { contains: q, mode: "insensitive" } },
                { subject: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      if (viewer.kind === "ADMIN" && unread !== undefined) {
        const unreadWhere: Prisma.SupportTicketWhereInput = {
          OR: [
            { adminReads: { some: { userId: viewer.user.id, unread: true } } },
            {
              adminReads: { none: { userId: viewer.user.id } },
              lastCustomerSequence: { gt: 0 },
            },
          ],
        };
        where.AND = unread ? unreadWhere : { NOT: unreadWhere };
      }
      const items = await tx.supportTicket.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
        include: { adminReads: { where: { userId: viewer.user.id } } },
      });
      return {
        items: items.map((row) => this.present(row, viewer, false)),
        total: await tx.supportTicket.count({ where }),
        page,
        limit,
      };
    });
  }
  listCustomer(query: SupportListDto, user: AuthUser) {
    return this.list(query, { kind: "CUSTOMER", user });
  }
  listAdmin(query: SupportListDto, user: AuthUser) {
    return this.list(query, { kind: "ADMIN", user });
  }
  private async reply(id: string, dto: SupportReplyDto, viewer: Viewer) {
    return this.transaction(async (tx) => {
      const row = await this.authorized(tx, id, viewer),
        authorType: SupportAuthorType =
          viewer.kind === "ADMIN" ? "ADMIN" : "CUSTOMER",
        actorUserId = viewer.kind === "GUEST" ? null : viewer.user.id;
      const submissionKey = supportHash(dto.submissionKey),
        body = dto.message.trim();
      const existing = await tx.supportMessage.findUnique({
        where: { ticketId_submissionKey: { ticketId: id, submissionKey } },
      });
      if (existing) {
        if (
          existing.authorType !== authorType ||
          existing.actorUserId !== actorUserId ||
          existing.body !== body
        )
          throw new ConflictException("Submission key was already used");
        return this.present(row, viewer);
      }
      if (row.version !== dto.version)
        throw new ConflictException("Conversation changed; refresh and retry");
      const sequence = row.lastSequence + 1;
      const changed = await tx.supportTicket.updateMany({
        where: { id, version: dto.version },
        data: {
          version: { increment: 1 },
          lastSequence: sequence,
          lastMessageAt: new Date(),
          status: authorType === "ADMIN" ? "AWAITING_CUSTOMER" : "OPEN",
          ...(authorType === "ADMIN"
            ? { lastAdminSequence: sequence }
            : {
                lastCustomerSequence: sequence,
                customerReadSequence: sequence,
              }),
        },
      });
      if (!changed.count)
        throw new ConflictException("Conversation changed; refresh and retry");
      const message = await tx.supportMessage.create({
        data: {
          ticketId: id,
          authorType,
          actorUserId,
          body,
          submissionKey,
          sequence,
          ticketVersion: row.version + 1,
        },
      });
      if (authorType === "ADMIN") {
        await this.queue(tx, row, message.id, body, "REPLY");
        await tx.auditLog.create({
          data: {
            actorUserId,
            action: "SUPPORT_REPLY",
            entityType: "SupportTicket",
            entityId: id,
            metadata: { messageId: message.id },
          },
        });
      } else {
        await tx.supportAdminRead.updateMany({
          where: { ticketId: id },
          data: { unread: true },
        });
        await this.queue(tx, row, message.id, body, "ADMIN", true);
      }
      const updated = await tx.supportTicket.findUnique({
        where: { id },
        include: detailInclude,
      });
      return this.present(updated, viewer);
    });
  }
  replyCustomer(id: string, dto: SupportReplyDto, user: AuthUser) {
    return this.reply(id, dto, { kind: "CUSTOMER", user });
  }
  replyGuest(id: string, dto: SupportReplyDto, token: string) {
    return this.reply(id, dto, { kind: "GUEST", token });
  }
  replyAdmin(id: string, dto: SupportReplyDto, user: AuthUser) {
    return this.reply(id, dto, { kind: "ADMIN", user });
  }
  async status(id: string, dto: SupportStatusDto, user: AuthUser) {
    return this.transaction(async (tx) => {
      await this.authorized(tx, id, { kind: "ADMIN", user });
      const result = await tx.supportTicket.updateMany({
        where: { id, version: dto.version },
        data: {
          status: dto.status as SupportTicketStatus,
          version: { increment: 1 },
        },
      });
      if (!result.count)
        throw new ConflictException("Conversation changed; refresh and retry");
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: "SUPPORT_STATUS",
          entityType: "SupportTicket",
          entityId: id,
          metadata: { status: dto.status },
        },
      });
      return this.present(
        await tx.supportTicket.findUnique({
          where: { id },
          include: detailInclude,
        }),
        { kind: "ADMIN", user },
      );
    });
  }
  private async read(id: string, viewer: Viewer, version: number) {
    return this.transaction(async (tx) => {
      const row = await this.authorized(tx, id, viewer);
      if (!Number.isInteger(version) || version < 0 || version > row.version)
        throw new ConflictException("Conversation changed; refresh and retry");
      const visibleSequence = row.messages
        .filter((message) => message.ticketVersion <= version)
        .reduce((max, message) => Math.max(max, message.sequence), 0);
      if (viewer.kind === "ADMIN") {
        const existing = row.adminReads.find(
          (read) => read.userId === viewer.user.id,
        );
        const readSequence = Math.max(
            visibleSequence,
            existing?.readSequence || 0,
          ),
          unread = row.lastCustomerSequence > readSequence;
        await tx.supportAdminRead.upsert({
          where: { ticketId_userId: { ticketId: id, userId: viewer.user.id } },
          create: {
            ticketId: id,
            userId: viewer.user.id,
            readSequence,
            unread,
          },
          update: { readSequence, unread },
        });
      } else
        await tx.supportTicket.updateMany({
          where: { id, customerReadSequence: { lt: visibleSequence } },
          data: { customerReadSequence: visibleSequence },
        });
      return { read: true };
    });
  }
  readCustomer(id: string, user: AuthUser, version: number) {
    return this.read(id, { kind: "CUSTOMER", user }, version);
  }
  readGuest(id: string, token: string, version: number) {
    return this.read(id, { kind: "GUEST", token }, version);
  }
  readAdmin(id: string, user: AuthUser, version: number) {
    return this.read(id, { kind: "ADMIN", user }, version);
  }
  async retry(id: string, deliveryId: string, user: AuthUser) {
    return this.transaction(async (tx) => {
      await this.authorized(tx, id, { kind: "ADMIN", user });
      const delivery = await tx.supportEmailDelivery.findUnique({
        where: { id: deliveryId },
      });
      if (!delivery || delivery.ticketId !== id) this.missing();
      const result = await tx.supportEmailDelivery.updateMany({
        where: { id: deliveryId, ticketId: id, status: "FAILED" },
        data: {
          status: "PENDING",
          attempts: 0,
          nextAttemptAt: new Date(),
          leaseId: null,
          leaseExpiresAt: null,
        },
      });
      if (!result.count)
        throw new ConflictException("This delivery cannot be retried");
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: "SUPPORT_DELIVERY_RETRY",
          entityType: "SupportTicket",
          entityId: id,
          metadata: { deliveryId },
        },
      });
      return { queued: true };
    });
  }
}
