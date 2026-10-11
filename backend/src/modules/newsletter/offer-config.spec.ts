let api: any;
try {
  api = require("./offer-config");
} catch {
  api = {};
}
describe("authoritative newsletter offer copy and validation", () => {
  it("includes the newsletter-only offer description in plain text email", () => {
    const config = { ...api.DEFAULT_OFFER, type: "NONE" };
    const email = require("./newsletter-email").buildNewsletterEmail(null, new Date("2026-11-08"), "https://example.com/confirm", "https://example.com/unsubscribe", config);
    expect(email.text).toContain(api.presentOffer(config, 1).description);
    expect(email.text).not.toContain("Your code:");
  });
  it("describes the initial product-only ten percent offer", () => {
    expect(typeof api.presentOffer).toBe("function");
    expect(api.presentOffer(api.DEFAULT_OFFER, 1).headline).toContain("10%");
    expect(api.presentOffer(api.DEFAULT_OFFER, 1).terms).toContain(
      "Shipping and tax",
    );
  });
  it("renders free shipping without a percentage promise", () => {
    const result = api.presentOffer(
      { ...api.DEFAULT_OFFER, type: "FREE_SHIPPING" },
      2,
    );
    expect(result.headline).toContain("free shipping");
    expect(result.terms).not.toContain("10%");
  });
  it("renders gift quantities and cheapest-unit/bundle-return terms", () => {
    const result = api.presentOffer(
      {
        ...api.DEFAULT_OFFER,
        type: "BUY_X_GET_Y",
        buyQuantity: 2,
        giftQuantity: 1,
      },
      3,
    );
    expect(result.headline).toContain("Buy 2");
    expect(result.terms).toContain("cheapest");
    expect(result.terms).toContain("returned together");
  });
  it("does not promise a reward when incentives are off", () => {
    const result = api.presentOffer(
      { ...api.DEFAULT_OFFER, enabled: false },
      4,
    );
    expect(result.headline).not.toContain("10%");
    expect(result.terms).not.toContain("code");
  });
  it("rejects unsafe financial values and quantities", () => {
    for (const patch of [
      { value: 101 },
      { value: -1 },
      { validityDays: 0 },
      { usageLimit: 0 },
      { type: "BUY_X_GET_Y", buyQuantity: 0 },
      { type: "BUY_X_GET_Y", giftQuantity: 1.5 },
      { type: "BAD" },
      { currency: "BAD!" },
    ])
      expect(() =>
        api.normalizeOffer({ ...api.DEFAULT_OFFER, ...patch }),
      ).toThrow();
  });
  it("freezes new settings without modifying the input", () => {
    const raw = { ...api.DEFAULT_OFFER, eligibleProductIds: ["first"] };
    const normalized = api.normalizeOffer(raw);
    normalized.eligibleProductIds.push("second");
    expect(raw.eligibleProductIds).toEqual(["first"]);
  });
});
