import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { SupportCrypto } from "./support-email";
import { memoryDb } from "./support-test-repository";
let SupportDeliveryService: any;
try {
  ({ SupportDeliveryService } = require("./support-delivery.service"));
} catch {}
describe("durable support delivery worker", () => {
  let db: any, mail: any, crypto: SupportCrypto, worker: any;
  beforeEach(async () => {
    db = memoryDb();
    mail = { sendMessage: jest.fn(async () => {}) };
    crypto = new SupportCrypto(
      new ConfigService({
        JWT_REFRESH_SECRET: "support-worker-secret-at-least-32-characters",
        SUPPORT_ORIGIN: "https://altura.example",
        FRONTEND_ORIGIN: "https://altura.example",
      }),
    );
    worker = SupportDeliveryService
      ? new SupportDeliveryService(
          db,
          new ConfigService({ SUPPORT_EMAIL_WORKER_ENABLED: false }),
          mail,
          crypto,
        )
      : null;
    await db.supportEmailDelivery.create({
      data: {
        ticketId: "ticket-test",
        recipient: "test@example.invalid",
        payloadEncrypted: crypto.encrypt({
          url: "https://altura.example/support/ticket-test#token=private",
          reference: "SUP-TEST",
          name: "Test",
          subject: "Question",
          body: "Safe body <script>",
          kind: "REPLY",
        }),
      },
    });
  });
  test("worker exists", () =>
    expect(SupportDeliveryService).toEqual(expect.any(Function)));
  test("claims and records a successful delivery without revealing payload", async () => {
    await worker.processPending();
    expect(db.rows.supportEmailDelivery[0]).toMatchObject({
      status: "SENT",
      attempts: 1,
      leaseId: null,
    });
    expect(mail.sendMessage.mock.calls[0][1].html).toContain("&lt;script&gt;");
  });
  test("two workers cannot send the same delivery while lease is active", async () => {
    let release: any;
    mail.sendMessage = jest.fn(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const first = worker.processPending();
    await new Promise((resolve) => setImmediate(resolve));
    const other = new SupportDeliveryService(
      db,
      new ConfigService({ SUPPORT_EMAIL_WORKER_ENABLED: false }),
      mail,
      crypto,
    );
    await other.processPending();
    expect(mail.sendMessage).toHaveBeenCalledTimes(1);
    release();
    await first;
  });
  test("failed SMTP keeps the saved delivery and backs off before retry", async () => {
    mail.sendMessage.mockRejectedValueOnce(Error("synthetic provider failure"));
    await worker.processPending();
    expect(db.rows.supportEmailDelivery[0].status).toBe("FAILED");
    expect(+db.rows.supportEmailDelivery[0].nextAttemptAt).toBeGreaterThan(
      Date.now(),
    );
    await worker.processPending();
    expect(mail.sendMessage).toHaveBeenCalledTimes(1);
    db.rows.supportEmailDelivery[0].nextAttemptAt = new Date(0);
    await worker.processPending();
    expect(db.rows.supportEmailDelivery[0]).toMatchObject({
      status: "SENT",
      attempts: 2,
    });
  });
  test("recovers expired claims and fences stale completion", async () => {
    const row = db.rows.supportEmailDelivery[0];
    Object.assign(row, {
      status: "SENDING",
      attempts: 1,
      leaseId: "old",
      leaseExpiresAt: new Date(0),
    });
    await worker.processPending();
    expect(row.status).toBe("SENT");
    expect(row.attempts).toBe(2);
  });
  test("finite attempts stop automatic delivery and exhausted expired lease becomes FAILED", async () => {
    const row = db.rows.supportEmailDelivery[0];
    Object.assign(row, {
      status: "FAILED",
      attempts: 5,
      nextAttemptAt: new Date(0),
    });
    await worker.processPending();
    expect(mail.sendMessage).not.toHaveBeenCalled();
    Object.assign(row, {
      status: "SENDING",
      leaseId: "abandoned",
      leaseExpiresAt: new Date(0),
    });
    await worker.processPending();
    expect(row.status).toBe("FAILED");
    expect(row.leaseId).toBeNull();
  });
  test("scoped verification consumes only deliveries belonging to its synthetic ticket", async () => {
    await db.supportEmailDelivery.create({
      data: {
        ticketId: "other-ticket",
        recipient: "other@example.invalid",
        payloadEncrypted: db.rows.supportEmailDelivery[0].payloadEncrypted,
      },
    });
    await worker.processPending("ticket-test");
    expect(db.rows.supportEmailDelivery[0].status).toBe("SENT");
    expect(db.rows.supportEmailDelivery[1].status).toBe("PENDING");
  });
  test("stale send completion cannot overwrite a successor lease", async () => {
    mail.sendMessage = jest.fn(async () => {
      Object.assign(db.rows.supportEmailDelivery[0], {
        leaseId: "successor",
        status: "SENDING",
      });
    });
    await worker.processPending();
    expect(db.rows.supportEmailDelivery[0]).toMatchObject({
      leaseId: "successor",
      status: "SENDING",
    });
  });
  test("disabled worker creates no timer on module initialization", () => {
    const spy = jest.spyOn(global, "setInterval");
    worker.onModuleInit();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
