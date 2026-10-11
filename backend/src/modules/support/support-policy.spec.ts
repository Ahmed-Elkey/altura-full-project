import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { RateLimitService } from "../../common/security/rate-limit.service";
import { envValidationSchema } from "../../common/config/env.validation";
const base = {
  DATABASE_URL: "postgresql://test@127.0.0.1/test",
  JWT_ACCESS_SECRET: "x".repeat(32),
  JWT_REFRESH_SECRET: "y".repeat(32),
};
describe("support security policy", () => {
  test.each([
    ["support-create", 5],
    ["support-access", 20],
    ["support-reply", 20],
    ["support-recover", 5],
    ["support-read", 180],
  ])("limits %s in a 15 minute window", (name, limit) => {
    const service = new RateLimitService(new ConfigService({}));
    const policy = service.policy(name as any);
    expect(policy).toMatchObject({ limit, windowMs: 900000 });
    for (let i = 0; i < Number(limit); i++)
      expect(service.consume(policy, "synthetic-client", 100).allowed).toBe(
        true,
      );
    expect(service.consume(policy, "synthetic-client", 100).allowed).toBe(
      false,
    );
    expect(service.consume(policy, "synthetic-client", 900101).allowed).toBe(
      true,
    );
  });
  test("validates worker, origin, optional admin recipient and strict rate bounds", () => {
    const result = envValidationSchema.validate({
      ...base,
      SUPPORT_EMAIL_WORKER_ENABLED: "false",
      SUPPORT_ORIGIN: "https://altura.example",
      SUPPORT_ADMIN_EMAIL: "",
      RATE_LIMIT_SUPPORT_CREATE_LIMIT: 5,
    });
    expect(result.error).toBeUndefined();
    expect(result.value.SUPPORT_EMAIL_WORKER_ENABLED).toBe(false);
    for (const patch of [
      { SUPPORT_ADMIN_EMAIL: "invalid" },
      { SUPPORT_EMAIL_POLL_MS: 10 },
      { SUPPORT_EMAIL_MAX_ATTEMPTS: 100 },
      { SUPPORT_ENCRYPTION_SECRET: "short" },
      { RATE_LIMIT_SUPPORT_CREATE_LIMIT: 10000 },
    ])
      expect(
        envValidationSchema.validate({ ...base, ...patch }).error,
      ).toBeDefined();
  });
});
