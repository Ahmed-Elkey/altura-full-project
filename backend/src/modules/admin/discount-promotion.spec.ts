import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { DiscountType, Prisma } from "@prisma/client";
import { AdminService } from "./admin.service";
import { CreateDiscountDto } from "./dto/create-discount.dto";
const base = {
  code: "BUY2",
  type: DiscountType.BUY_X_GET_Y,
  value: 0,
  buyQuantity: 2,
  giftQuantity: 1,
  eligibleProductIds: [],
  eligibleCategoryIds: [],
};
describe("admin buy/get rules", () => {
  test("DTO retains validated promotion fields", async () => {
    const dto: any = plainToInstance(CreateDiscountDto, base);
    expect(await validate(dto, { whitelist: true })).toHaveLength(0);
    expect(dto.buyQuantity).toBe(2);
  });
  test.each([
    { buyQuantity: 0 },
    { giftQuantity: 1.5 },
    { maxGiftUnits: 0 },
    { eligibleProductIds: [""] },
    { eligibleCategoryIds: "sale" },
  ])("DTO rejects %j", async (bad) => {
    expect(
      (
        await validate(
          plainToInstance(CreateDiscountDto, { ...base, ...bad }),
          { whitelist: true },
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  test("general buy/get creation freezes a complete snapshot", () => {
    const service: any = new AdminService({} as any, {} as any);
    const result = service.createDiscountData(base);
    expect(result.offerSnapshot).toMatchObject({
      type: "BUY_X_GET_Y",
      buyQuantity: 2,
      giftQuantity: 1,
      currency: "EGP",
      eligibleProductIds: [],
    });
  });
  test("service rejects incomplete buy/get configuration", () => {
    const service: any = new AdminService({} as any, {} as any);
    expect(() =>
      service.assertDiscount({ type: "BUY_X_GET_Y", value: 0 }),
    ).toThrow("buyQuantity");
  });
  test("issued newsletter terms can only be activated or disabled", async () => {
    const prisma: any = {
      discount: {
        findUnique: async () => ({
          id: "reward",
          type: "PERCENTAGE",
          value: new Prisma.Decimal(10),
          minimumSubtotal: null,
          maximumDiscount: null,
          offerSnapshot: { type: "PERCENTAGE" },
          newsletterSubscriber: { id: "owner" },
        }),
      },
    };
    const service: any = new AdminService(prisma, {} as any);
    await expect(
      service.updateDiscount("admin", "reward", { value: 99 }),
    ).rejects.toThrow("immutable");
  });
 test('clearing a buy/get minimum clears its authoritative snapshot too',async()=>{
  const service:any=new AdminService({} as any,{} as any);
  const existing:any={id:'promo',...service.createDiscountData({...base,minimumSubtotal:100}),value:new Prisma.Decimal(0),minimumSubtotal:new Prisma.Decimal(100),maximumDiscount:null,startsAt:null,endsAt:null,newsletterSubscriber:null};
  const tx:any={discount:{update:jest.fn(async({data})=>({...existing,...data}))},auditLog:{create:jest.fn()}};
  service.prisma={discount:{findUnique:jest.fn(async()=>existing)},$transaction:jest.fn(async fn=>fn(tx))};
  await service.updateDiscount('admin','promo',{minimumSubtotal:null});expect(tx.discount.update.mock.calls[0][0].data.offerSnapshot.minimumSubtotal).toBeNull();
 });

});
