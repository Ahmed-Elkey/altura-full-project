import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { SupportCrypto, supportHash } from "./support-email";
let SupportService: any;
try {
  ({ SupportService } = require("./support.service"));
} catch {}
const customer = {
    id: "customer-a",
    email: "account@example.invalid",
    role: "CUSTOMER",
  },
  admin = { id: "admin-a", email: "admin@example.invalid", role: "ADMIN" };
const input = {
  name: "Test",
  email: "guest@example.invalid",
  subject: "A question",
  message: "Please help with my request",
  submissionKey: "0123456789abcdef0123456789abcdef",
};
import { memoryDb } from "./support-test-repository";
describe("support conversations", () => {
  let db: any, crypto: SupportCrypto, service: any;
  beforeEach(() => {
    db = memoryDb();
    crypto = new SupportCrypto(
      new ConfigService({
        JWT_REFRESH_SECRET: "support-test-secret-at-least-32-characters",
        SUPPORT_ORIGIN: "https://altura.example",
        FRONTEND_ORIGIN: "https://altura.example",
      }),
    );
    service = SupportService
      ? new SupportService(db, new ConfigService({}), crypto)
      : null;
  });
  test("support service exists", () =>
    expect(SupportService).toEqual(expect.any(Function)));
  test("saves guest ticket, encrypted delivery, and scoped access without sending", async () => {
    const result = await service.create(input);
    expect(result.ticket.reference).toMatch(/^SUP-/);
    expect(result.accessToken).toHaveLength(43);
    expect(db.rows.supportMessage).toHaveLength(1);
    expect(db.rows.supportEmailDelivery).toHaveLength(1);
    expect(
      db.rows.supportGuestAccess.every(
        (a: any) => a.tokenHash !== result.accessToken,
      ),
    ).toBe(true);
    expect(result.ticket).not.toHaveProperty("creationKey");
    expect(result.ticket).not.toHaveProperty("ownerUserId");
    expect(
      await service.detailGuest(result.ticket.id, result.accessToken),
    ).toMatchObject({
      id: result.ticket.id,
      messages: [{ body: input.message }],
    });
  });
  test("old guest creation replay stays idempotent without renewing scoped access", async () => {
    const created = await service.create(input);
    db.rows.supportTicket[0].createdAt = new Date(Date.now() - 60 * 86400000);
    for (const access of db.rows.supportGuestAccess)
      if (access.kind === "SESSION") access.expiresAt = new Date(0);
    const accessCount = db.rows.supportGuestAccess.length;
    const replayed = await service.create(input);
    expect(replayed.ticket.id).toBe(created.ticket.id);
    expect(Object.hasOwn(replayed, "accessToken")).toBe(false);
    expect(db.rows.supportGuestAccess).toHaveLength(accessCount);
    expect(db.rows.supportTicket).toHaveLength(1);
    expect(db.rows.supportMessage).toHaveLength(1);
    expect(db.rows.supportEmailDelivery).toHaveLength(1);
    await expect(
      service.detailGuest(created.ticket.id, created.accessToken),
    ).rejects.toMatchObject({ status: 401 });
  });
  test("guest creation retry access expires at the original creation window", async () => {
    const created = await service.create(input);
    db.rows.supportTicket[0].createdAt = new Date(Date.now() - 20 * 60000);
    const expiresAt = +db.rows.supportTicket[0].createdAt + 30 * 60000;
    const replayed = await service.create(input);
    expect(replayed.accessToken).toHaveLength(43);
    const newest = db.rows.supportGuestAccess.at(-1);
    expect(+newest.expiresAt).toBe(expiresAt);
    expect(
      await service.detailGuest(created.ticket.id, replayed.accessToken),
    ).toMatchObject({ id: created.ticket.id });
  });
  test("authenticated account identity wins over supplied name and email", async () => {
    const result = await service.create(input, customer);
    expect(result.ticket.email).toBe(customer.email);
    expect(result.ticket.name).toBe("Account Customer");
    expect(result).not.toHaveProperty("accessToken");
    expect(
      await service.detailCustomer(result.ticket.id, customer),
    ).toMatchObject({ id: result.ticket.id });
    await expect(
      service.detailCustomer(result.ticket.id, { ...customer, id: "another" }),
    ).rejects.toMatchObject({ status: 404 });
  });
  test("requires active ADMIN even when called below the controller", async () => {
    const result = await service.create(input);
    await expect(
      service.detailAdmin(result.ticket.id, customer),
    ).rejects.toMatchObject({ status: 404 });
    db.user.findUnique = async () => ({ ...admin, status: "BLOCKED" });
    await expect(
      service.detailAdmin(result.ticket.id, admin),
    ).rejects.toMatchObject({ status: 404 });
  });
  test("retries creation exactly once and refuses mismatched identity or payload", async () => {
    const a = await service.create(input),
      b = await service.create(input);
    expect(b.ticket.id).toBe(a.ticket.id);
    expect(db.rows.supportTicket).toHaveLength(1);
    expect(db.rows.supportMessage).toHaveLength(1);
    await expect(
      service.create({ ...input, message: "A different valid message" }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(service.create(input, customer)).rejects.toMatchObject({
      status: 404,
    });
  });
  test("exchanges 30 day link into 30 minute access and enforces ticket scope/expiry", async () => {
    const result = await service.create(input),
      delivery = db.rows.supportEmailDelivery[0];
    const payload = crypto.decrypt(delivery.payloadEncrypted),
      link = new URL(payload.url).hash.slice(7);
    const exchanged = await service.exchange(result.ticket.id, link);
    expect(exchanged.accessToken).not.toBe(link);
    await expect(
      service.detailGuest(result.ticket.id, link),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      service.detailGuest("different", exchanged.accessToken),
    ).rejects.toMatchObject({ status: 401 });
    const session = db.rows.supportGuestAccess.find(
      (a: any) => a.tokenHash === supportHash(exchanged.accessToken),
    );
    session.expiresAt = new Date(0);
    await expect(
      service.detailGuest(result.ticket.id, exchanged.accessToken),
    ).rejects.toMatchObject({ status: 401 });
    db.rows.supportGuestAccess.find(
      (a: any) => a.tokenHash === supportHash(link),
    ).expiresAt = new Date(0);
    await expect(
      service.exchange(result.ticket.id, link),
    ).rejects.toMatchObject({ status: 401 });
  });
  test("recovery returns the same result for wrong/missing identities and only queues matching guest", async () => {
    const result = await service.create(input);
    expect(await service.recover("missing", input.email)).toEqual({
      accepted: true,
    });
    expect(
      await service.recover(result.ticket.id, "wrong@example.invalid"),
    ).toEqual({ accepted: true });
    expect(db.rows.supportEmailDelivery).toHaveLength(1);
    expect(await service.recover(result.ticket.id, input.email)).toEqual({
      accepted: true,
    });
    expect(db.rows.supportEmailDelivery).toHaveLength(2);
  });
  test("admin reply marks awaiting customer, isolated reads, and customer reply reopens", async () => {
    const { ticket, accessToken } = await service.create(input);
    let detail = await service.replyAdmin(
      ticket.id,
      {
        message: "We can help you with that",
        submissionKey: "admin-reply-key-012345",
        version: 0,
      },
      admin,
    );
    expect(detail.status).toBe("AWAITING_CUSTOMER");
    expect(detail.version).toBe(1);
    expect(db.rows.auditLog[0]).toMatchObject({
      action: "SUPPORT_REPLY",
      actorUserId: admin.id,
    });
    expect(await service.detailGuest(ticket.id, accessToken)).toMatchObject({
      unread: true,
    });
    await service.readAdmin(ticket.id, admin, 1);
    expect(await service.detailGuest(ticket.id, accessToken)).toMatchObject({
      unread: true,
    });
    await service.readGuest(ticket.id, accessToken, 1);
    expect(await service.detailGuest(ticket.id, accessToken)).toMatchObject({
      unread: false,
    });
    detail = await service.status(
      ticket.id,
      { status: "RESOLVED", version: 1 },
      admin,
    );
    expect(detail.version).toBe(2);
    detail = await service.replyGuest(
      ticket.id,
      {
        message: "I still need help please",
        submissionKey: "guest-reply-key-012345",
        version: 2,
      },
      accessToken,
    );
    expect(detail.status).toBe("OPEN");
    expect(detail.version).toBe(3);
  });
  test("reply retry survives stale version but changed payload conflicts", async () => {
    const { ticket, accessToken } = await service.create(input),
      dto = {
        message: "A follow up support message",
        submissionKey: "guest-reply-key-012345",
        version: 0,
      };
    await service.replyGuest(ticket.id, dto, accessToken);
    await service.replyGuest(ticket.id, dto, accessToken);
    expect(db.rows.supportMessage).toHaveLength(2);
    await expect(
      service.replyGuest(
        ticket.id,
        { ...dto, message: "Another follow up message" },
        accessToken,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  test("two competing replies accept one and preserve the other as 409", async () => {
    const { ticket, accessToken } = await service.create(input);
    const results = await Promise.allSettled(
      ["a", "b"].map((s) =>
        service.replyGuest(
          ticket.id,
          {
            message: "Concurrent support message " + s,
            submissionKey: "concurrent-reply-key-" + s,
            version: 0,
          },
          accessToken,
        ),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { status: 409 },
    });
    expect(db.rows.supportMessage).toHaveLength(2);
  });
  test("read acknowledgement cannot clear a reply newer than the displayed version", async () => {
    const { ticket, accessToken } = await service.create(input);
    await service.replyAdmin(
      ticket.id,
      {
        message: "First administrator reply",
        submissionKey: "admin-first-reply-012345",
        version: 0,
      },
      admin,
    );
    await service.status(ticket.id, { status: "RESOLVED", version: 1 }, admin);
    await service.replyAdmin(
      ticket.id,
      {
        message: "A new unseen administrator reply",
        submissionKey: "admin-second-reply-012345",
        version: 2,
      },
      admin,
    );
    await service.readGuest(ticket.id, accessToken, 1);
    expect(await service.detailGuest(ticket.id, accessToken)).toMatchObject({
      unread: true,
    });
    await service.readGuest(ticket.id, accessToken, 3);
    expect(await service.detailGuest(ticket.id, accessToken)).toMatchObject({
      unread: false,
    });
    await expect(
      service.readGuest(ticket.id, accessToken, 4),
    ).rejects.toMatchObject({ status: 409 });
  });
  test("admin read acknowledgements stay isolated across active admins", async () => {
    const { ticket, accessToken } = await service.create(input),
      second = { ...admin, id: "admin-b" };
    const lookup = db.user.findUnique;
    db.user.findUnique = async (args: any) =>
      args.where.id === second.id
        ? { ...second, status: "ACTIVE" }
        : lookup(args);
    await service.readAdmin(ticket.id, admin, 0);
    expect(await service.detailAdmin(ticket.id, second)).toMatchObject({
      unread: true,
    });
    await service.replyGuest(
      ticket.id,
      {
        message: "An unseen customer followup",
        submissionKey: "new-customer-reply-012345",
        version: 0,
      },
      accessToken,
    );
    await service.readAdmin(ticket.id, admin, 0);
    expect(await service.detailAdmin(ticket.id, admin)).toMatchObject({
      unread: true,
    });
  });
  test("failed enqueue rolls back ticket and message atomically", async () => {
    db.supportEmailDelivery.create = async () => {
      throw new Error("synthetic persistence failure");
    };
    await expect(service.create(input)).rejects.toThrow(
      "synthetic persistence failure",
    );
    expect(db.rows.supportTicket).toHaveLength(0);
    expect(db.rows.supportMessage).toHaveLength(0);
    expect(db.rows.supportGuestAccess).toHaveLength(0);
  });
  test("competing status and reply writes return one version conflict", async () => {
    const { ticket } = await service.create(input);
    const result = await Promise.allSettled([
      service.status(ticket.id, { status: "RESOLVED", version: 0 }, admin),
      service.replyAdmin(
        ticket.id,
        {
          message: "Concurrent administrator reply",
          submissionKey: "competing-admin-reply-123",
          version: 0,
        },
        admin,
      ),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(result.find((r) => r.status === "rejected")).toMatchObject({
      reason: { status: 409 },
    });
  });
  test("retries only failed delivery on an authorized ticket and records content-free audit", async () => {
    const { ticket } = await service.create(input),
      delivery = db.rows.supportEmailDelivery[0];
    await expect(
      service.retry(ticket.id, delivery.id, admin),
    ).rejects.toMatchObject({ status: 409 });
    db.rows.supportEmailDelivery[0].status = "FAILED";
    db.rows.supportEmailDelivery[0].attempts = 5;
    await expect(
      service.retry(ticket.id, delivery.id, customer),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.retry("wrong-ticket", delivery.id, admin),
    ).rejects.toMatchObject({ status: 404 });
    expect(await service.retry(ticket.id, delivery.id, admin)).toEqual({
      queued: true,
    });
    expect(db.rows.supportEmailDelivery[0]).toMatchObject({
      status: "PENDING",
      attempts: 0,
    });
    expect(db.rows.auditLog[0]).toMatchObject({
      action: "SUPPORT_DELIVERY_RETRY",
      metadata: { deliveryId: delivery.id },
    });
    expect(JSON.stringify(db.rows.auditLog)).not.toContain(input.message);
  });
  test("old read acknowledgements never decrease a customer or admin cursor", async () => {
    const { ticket, accessToken } = await service.create(input);
    await service.replyAdmin(
      ticket.id,
      {
        message: "Administrator message to read",
        submissionKey: "admin-monotonic-reply-123",
        version: 0,
      },
      admin,
    );
    await service.readGuest(ticket.id, accessToken, 1);
    await service.readGuest(ticket.id, accessToken, 0);
    expect(await service.detailGuest(ticket.id, accessToken)).toMatchObject({
      unread: false,
    });
    await service.replyGuest(
      ticket.id,
      {
        message: "Customer message to read now",
        submissionKey: "guest-monotonic-reply-123",
        version: 1,
      },
      accessToken,
    );
    await service.readAdmin(ticket.id, admin, 2);
    await service.readAdmin(ticket.id, admin, 0);
    expect(await service.detailAdmin(ticket.id, admin)).toMatchObject({
      unread: false,
    });
  });
  test("bounds account identity snapshot to the support name limit", async () => {
    const lookup = db.user.findUnique;
    db.user.findUnique = async (args: any) => ({
      ...(await lookup(args)),
      firstName: "F".repeat(80),
      lastName: "L".repeat(80),
    });
    const result = await service.create(input, customer);
    expect(result.ticket.name).toHaveLength(120);
  });
  test("honeypot rejects spam before persistence", async () => {
    await expect(
      service.create({ ...input, website: "spam" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(db.rows.supportTicket).toHaveLength(0);
  });
});
