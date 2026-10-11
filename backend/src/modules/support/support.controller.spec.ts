import "reflect-metadata";
import { GUARDS_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { JwtAuthGuard } from "../../common/auth/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../../common/auth/optional-jwt-auth.guard";
import { RolesGuard } from "../../common/auth/roles.guard";
import { RATE_LIMIT_METADATA } from "../../common/security/rate-limit.decorator";
let SupportController: any, AdminSupportController: any;
try {
  ({
    SupportController,
    AdminSupportController,
  } = require("./support.controller"));
} catch {}
describe("support API boundaries", () => {
  test("controllers exist at fixed contract paths", () => {
    expect(SupportController).toEqual(expect.any(Function));
    expect(Reflect.getMetadata(PATH_METADATA, SupportController)).toBe(
      "support",
    );
    expect(Reflect.getMetadata(PATH_METADATA, AdminSupportController)).toBe(
      "admin/support",
    );
  });
  test("creation permits optional authentication and is rate limited", () => {
    const method = SupportController.prototype.create;
    expect(Reflect.getMetadata(GUARDS_METADATA, method)).toContain(
      OptionalJwtAuthGuard,
    );
    expect(Reflect.getMetadata(RATE_LIMIT_METADATA, method)).toBe(
      "support-create",
    );
  });
  test("customer methods require JWT and every admin method requires JWT and ADMIN roles", () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, SupportController.prototype.me),
    ).toContain(JwtAuthGuard);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminSupportController),
    ).toEqual(expect.arrayContaining([JwtAuthGuard, RolesGuard]));
  });
  test.each([
    ["access", "support-access"],
    ["recover", "support-recover"],
    ["guestReply", "support-reply"],
  ])("guest %s has a public rate policy", (method, policy) =>
    expect(
      Reflect.getMetadata(
        RATE_LIMIT_METADATA,
        SupportController.prototype[method],
      ),
    ).toBe(policy),
  );
});
