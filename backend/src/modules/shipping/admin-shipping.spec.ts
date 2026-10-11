import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { Reflector } from "@nestjs/core";
import { Prisma, UserRole } from "@prisma/client";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { JwtAuthGuard } from "../../common/auth/jwt-auth.guard";
import { RolesGuard } from "../../common/auth/roles.guard";
import { AdminShippingController } from "./admin-shipping.controller";
import { AdminShippingService } from "./admin-shipping.service";
import {
  CreateShippingMethodDto,
  CreateShippingZoneDto,
} from "./dto/admin-shipping.dto";

describe("shipping administration", () => {
  const valid = {
    zoneId: "zone",
    name: "Standard",
    code: "STANDARD",
    currency: "EGP",
    price: 50,
    freeAbove: 1000,
    estimatedMinDays: 2,
    estimatedMaxDays: 5,
  };
  it.each([
    { price: -1 },
    { price: 1.001 },
    { currency: "ZZZ" },
    { freeAbove: -5 },
    { estimatedMinDays: 1.5 },
  ])("rejects invalid method fields %j", async (patch) => {
    expect(
      (
        await validate(
          plainToInstance(CreateShippingMethodDto, { ...valid, ...patch }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it("rejects nonexistent country codes", async () => {
    expect(
      (
        await validate(
          plainToInstance(CreateShippingZoneDto, {
            name: "Test",
            countries: ["ZZ"],
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  function database() {
    const method = { id: "method", ...valid, active: true };
    const db: any = {
      shippingMethod: {
        findUnique: jest.fn(async () => method),
        update: jest.fn(async ({ data }) => ({ ...method, ...data })),
        create: jest.fn(async ({ data }) => ({ id: "method", ...data })),
      },
      shippingZone: {
        findUnique: jest.fn(async () => ({
          id: "zone",
          active: true,
          countries: ["EG"],
        })),
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }) => ({ id: "new", ...data })),
        update: jest.fn(async ({ data }) => ({ id: "zone", ...data })),
      },
      auditLog: { create: jest.fn(async () => ({})) },
    };
    db.$transaction = async (fn: any) => fn(db);
    return db;
  }
  it.each(["create", "update", "reactivate"])(
    "rejects overlapping active countries on %s",
    async (operation) => {
      const db = database();
      db.shippingZone.findFirst.mockResolvedValue({
        id: "other",
        name: "Other zone",
      });
      const service = new AdminShippingService(db);
      const task =
        operation === "create"
          ? service.createZone("admin", {
              name: "Duplicate",
              countries: ["EG"],
            })
          : service.updateZone(
              "admin",
              "zone",
              operation === "reactivate"
                ? { active: true }
                : { countries: ["EG", "AE"] },
            );
      await expect(task).rejects.toThrow("already assigned");
      expect(db.auditLog.create).not.toHaveBeenCalled();
    },
  );
  it("allows inactive zones to share countries", async () => {
    const db = database();
    db.shippingZone.findFirst.mockResolvedValue({ id: "other" });
    expect(
      (
        await new AdminShippingService(db).createZone("admin", {
          name: "Archive",
          countries: ["EG"],
          active: false,
        })
      ).active,
    ).toBe(false);
  });
  it("retries serialization conflicts and rechecks overlapping countries", async () => {
    const db = database();
    let attempts = 0;
    db.$transaction = jest.fn(async (fn: any, options: any) => {
      expect(options.isolationLevel).toBe("Serializable");
      if (attempts++ === 0)
        throw new Prisma.PrismaClientKnownRequestError("Conflict", {
          code: "P2034",
          clientVersion: "test",
        });
      return fn(db);
    });
    expect(
      (
        await new AdminShippingService(db).createZone("admin", {
          name: "Egypt",
          countries: ["EG"],
        })
      ).id,
    ).toBe("new");
    expect(attempts).toBe(2);
  });
  it("rejects estimates reversed by a partial update", async () => {
    const service = new AdminShippingService(database());
    await expect(
      service.updateMethod("admin", "method", { estimatedMinDays: 9 }),
    ).rejects.toThrow("Minimum delivery days");
  });
  it("deactivates historical methods and records the acting admin atomically", async () => {
    const db = database();
    const result = await new AdminShippingService(db).deactivateMethod(
      "admin",
      "method",
    );
    expect(result.active).toBe(false);
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: "admin",
          action: "shipping.method.deactivate",
          entityId: "method",
        }),
      }),
    );
  });
  it("authenticates before authorizing every shipping mutation", () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminShippingController),
    ).toEqual([JwtAuthGuard, RolesGuard]);
  });
  it("requires ADMIN for all mutation routes", () => {
    const guard = new RolesGuard(new Reflector());
    const context: any = {
      getClass: () => AdminShippingController,
      getHandler: () => AdminShippingController.prototype.createZone,
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: UserRole.CUSTOMER } }),
      }),
    };
    expect(() => guard.canActivate(context)).toThrow();
    context.switchToHttp = () => ({
      getRequest: () => ({ user: { role: UserRole.ADMIN } }),
    });
    expect(guard.canActivate(context)).toBe(true);
  });
});
