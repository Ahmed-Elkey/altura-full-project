import { ConfigService } from "@nestjs/config";
let buildSupportEmail: any, SupportCrypto: any;
try {
  ({ buildSupportEmail, SupportCrypto } = require("./support-email"));
} catch {}

describe("support email security", () => {
  test("support email implementation exists", () =>
    expect(buildSupportEmail).toEqual(expect.any(Function)));
  test("escapes all submitted content and directs replies to the website", () => {
    const result = buildSupportEmail({
      reference: "SUP-TEST",
      name: "<script>x</script>",
      subject: "A & B",
      body: "<img src=x onerror=alert(1)>",
      url: "https://altura.example/support/test#token=safe",
      kind: "REPLY",
    });
    expect(result.html).not.toContain("<script>");
    expect(result.html).not.toContain("<img src=x");
    expect(result.html).toContain("&lt;img");
    expect(result.html).toContain("A &amp; B");
    expect(result.text).toContain("Replies to this email are not imported");
  });
  test.each([
    "javascript:alert(1)",
    "https://bad:password@example.com/support/1",
    "https://example.com/support/1?token=secret",
  ])("refuses unsafe destination %s", (url) => {
    expect(() =>
      buildSupportEmail({
        reference: "SUP-TEST",
        name: "Test",
        subject: "Test",
        body: "Safe message",
        url,
        kind: "REPLY",
      }),
    ).toThrow();
  });
  test("encrypts durable link payload and detects tampering", () => {
    const crypto = new SupportCrypto(
      new ConfigService({
        JWT_REFRESH_SECRET: "support-unit-secret-at-least-32-chars",
        SUPPORT_ORIGIN: "https://altura.example",
        FRONTEND_ORIGIN: "https://altura.example",
      }),
    );
    const value = {
      url: "https://altura.example/support/1#token=private-test-value",
      reference: "SUP-T",
    };
    const encrypted = crypto.encrypt(value);
    expect(encrypted).not.toContain("private-test-value");
    expect(crypto.decrypt(encrypted)).toEqual(value);
    expect(() => crypto.decrypt(encrypted.slice(0, -5) + "xxxxx")).toThrow();
  });
});
