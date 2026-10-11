import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../common/prisma/prisma.service";
import { JwtTokenService } from "../../common/security/jwt-token.service";
import { RateLimitService } from "../../common/security/rate-limit.service";
import { RateLimitGuard } from "../../common/security/rate-limit.guard";
import { JwtAuthGuard } from "../../common/auth/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../../common/auth/optional-jwt-auth.guard";
import { RolesGuard } from "../../common/auth/roles.guard";
import {
  SupportController,
  AdminSupportController,
  SupportPrivateInterceptor,
} from "./support.controller";
import { SupportService } from "./support.service";
import { SupportCrypto } from "./support-email";
import { SupportPrivateMiddleware } from "./support-private.middleware";
import { memoryDb } from "./support-test-repository";

describe("support HTTP contract", () => {
  let app: INestApplication, url: string, db: any;
  const input = {
    name: "Synthetic Guest",
    email: "synthetic@example.invalid",
    subject: "HTTP request",
    message: "A synthetic support question",
    submissionKey: "http-test-0123456789abcdef",
  };
  const request = async (
    path: string,
    method = "GET",
    body?: unknown,
    headers: Record<string, string> = {},
  ) => {
    const response = await fetch(url + path, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: response.status,
      data: await response.json(),
      headers: response.headers,
    };
  };
  beforeEach(async () => {
    db = memoryDb();
    const lookup = db.user.findUnique;
    db.user.findUnique = async (args: any) => {
      const row = await lookup(args);
      return row ? { ...row, authVersion: 0 } : null;
    };
    const config = new ConfigService({
      SUPPORT_ORIGIN: "https://altura.example",
      JWT_REFRESH_SECRET: "support-http-secret-at-least-32-characters",
      RATE_LIMIT_ENABLED: true,
    });
    const module = await Test.createTestingModule({
      controllers: [SupportController, AdminSupportController],
      providers: [
        SupportService,
        SupportCrypto,
        SupportPrivateInterceptor,
        RateLimitService,
        RateLimitGuard,
        JwtAuthGuard,
        OptionalJwtAuthGuard,
        RolesGuard,
        { provide: PrismaService, useValue: db },
        { provide: ConfigService, useValue: config },
        {
          provide: JwtTokenService,
          useValue: {
            verify: (token: string) => ({
              sub: token === "admin" ? "admin-a" : "customer-a",
              ver: 0,
            }),
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useLogger(["error"]);
    app.use(new SupportPrivateMiddleware().use);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.listen(0, "127.0.0.1");
    url = await app.getUrl();
  });
  afterEach(async () => {
    await app.close();
  });
  test("validates creation and returns only the contract fields with private headers", async () => {
    const bad = await request("/support", "POST", {
      ...input,
      message: "short",
    });
    expect(bad.status).toBe(400);
    expect(db.rows.supportTicket).toHaveLength(0);
    const saved = await request("/support", "POST", input);
    expect(saved.status).toBe(201);
    expect(saved.data.ticket).toMatchObject({ status: "OPEN", version: 0 });
    expect(saved.headers.get("cache-control")).toContain("no-store");
    expect(saved.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(Object.keys(saved.data.ticket).sort()).toEqual(
      [
        "id",
        "reference",
        "name",
        "email",
        "subject",
        "orderReference",
        "status",
        "version",
        "createdAt",
        "updatedAt",
        "lastMessageAt",
        "unread",
      ].sort(),
    );
  });
  test("real guards isolate guest/customer/admin routes and denied responses are private", async () => {
    const saved = await request("/support", "POST", input),
      id = saved.data.ticket.id;
    const denied = await request("/support/guest/" + id);
    expect(denied.status).toBe(401);
    expect(denied.headers.get("cache-control")).toContain("no-store");
    expect(
      (
        await request("/support/guest/" + id, "GET", undefined, {
          "X-Support-Access": saved.data.accessToken,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request("/support/me/" + id, "GET", undefined, {
          Authorization: "Bearer customer",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request("/admin/support/" + id, "GET", undefined, {
          Authorization: "Bearer customer",
        })
      ).status,
    ).toBe(403);
    const detail = await request("/admin/support/" + id, "GET", undefined, {
      Authorization: "Bearer admin",
    });
    expect(detail.status).toBe(200);
    expect(detail.data.deliveries).toHaveLength(1);
    expect(detail.data.deliveries[0]).not.toHaveProperty("payloadEncrypted");
  });
  test("read body rejects missing/future versions; stale displayed version leaves unseen reply unread", async () => {
    const saved = await request("/support", "POST", input),
      id = saved.data.ticket.id,
      access = { "X-Support-Access": saved.data.accessToken };
    expect(
      (await request("/support/guest/" + id + "/read", "POST", {}, access))
        .status,
    ).toBe(400);
    expect(
      (
        await request(
          "/admin/support/" + id + "/replies",
          "POST",
          {
            message: "A synthetic administrator reply",
            submissionKey: "http-admin-reply-012345",
            version: 0,
          },
          { Authorization: "Bearer admin" },
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await request(
          "/support/guest/" + id + "/read",
          "POST",
          { version: 0 },
          access,
        )
      ).data,
    ).toEqual({ read: true });
    expect(
      (await request("/support/guest/" + id, "GET", undefined, access)).data
        .unread,
    ).toBe(true);
    expect(
      (
        await request(
          "/support/guest/" + id + "/read",
          "POST",
          { version: 2 },
          access,
        )
      ).status,
    ).toBe(409);
  });
  test("actual guard enforces public creation limit without saving sixth request", async () => {
    for (let i = 0; i < 5; i++)
      expect(
        (
          await request("/support", "POST", {
            ...input,
            submissionKey: input.submissionKey + i,
          })
        ).status,
      ).toBe(201);
    const sixth = await request("/support", "POST", {
      ...input,
      submissionKey: input.submissionKey + "6",
    });
    expect(sixth.status).toBe(429);
    expect(sixth.headers.get("retry-after")).toBeTruthy();
    expect(db.rows.supportTicket).toHaveLength(5);
  });
});
