import { Prisma } from "@prisma/client";
import { AdminCatalogService } from "./admin-catalog.service";
describe("category tree integrity", () => {
  function fixture() {
    const rows: any[] = [
      { id: "a", slug: "a", parentId: null },
      { id: "b", slug: "b", parentId: "a" },
      { id: "c", slug: "c", parentId: "b" },
    ];
    const db: any = {
      category: {
        findUnique: jest.fn(
          async ({ where }) =>
            rows.find((row) =>
              where.id ? row.id === where.id : row.slug === where.slug,
            ) || null,
        ),
        update: jest.fn(async ({ where, data }) => ({
          ...rows.find((row) => row.id === where.id),
          ...data,
        })),
      },
    };
    db.$transaction = async (fn: any) => fn(db);
    return { db, service: new AdminCatalogService(db, {} as any) };
  }
  it("rejects assigning a grandchild as parent", async () => {
    const { service } = fixture();
    await expect(
      service.updateCategory("a", { parentSlug: "c" }),
    ).rejects.toThrow("cycle");
  });
  it("retries category tree serialization conflicts before applying the change", async () => {
    const { db, service } = fixture();
    let attempts = 0;
    db.$transaction = async (fn: any, options: any) => {
      expect(options.isolationLevel).toBe("Serializable");
      if (attempts++ === 0)
        throw new Prisma.PrismaClientKnownRequestError("Conflict", {
          code: "P2034",
          clientVersion: "test",
        });
      return fn(db);
    };
    expect(
      (await service.updateCategory("b", { parentSlug: "" })).parentId,
    ).toBeNull();
    expect(attempts).toBe(2);
  });
  it("allows moving a child to the root", async () => {
    const { service } = fixture();
    expect(
      (await service.updateCategory("b", { parentSlug: "" })).parentId,
    ).toBeNull();
  });
});
