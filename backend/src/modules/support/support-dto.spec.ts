import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
let CreateSupportDto: any, SupportListDto: any, SupportReplyDto: any;
try {
  ({
    CreateSupportDto,
    SupportListDto,
    SupportReplyDto,
  } = require("./dto/support.dto"));
} catch {}
const valid = {
  name: "Test customer",
  email: "test@example.invalid",
  subject: "Test request",
  message: "A valid support message",
  submissionKey: "0123456789abcdef0123456789abcdef",
};
describe("support validation", () => {
  test("support DTOs exist", () =>
    expect(CreateSupportDto).toEqual(expect.any(Function)));
  test("accepts valid trimmed text", async () =>
    expect(
      await validate(plainToInstance(CreateSupportDto, valid)),
    ).toHaveLength(0));
  test.each([
    { name: "n".repeat(121) },
    { email: "invalid" },
    { subject: "s".repeat(161) },
    { orderReference: "o".repeat(81) },
    { message: "short" },
    { message: "m".repeat(5001) },
    { submissionKey: "guess" },
    { message: " ".repeat(20) },
  ])("rejects invalid fields %o", async (patch) => {
    expect(
      (
        await validate(
          plainToInstance(CreateSupportDto, { ...valid, ...patch }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  test("caps pagination and rejects ambiguous boolean values", async () => {
    expect(
      (
        await validate(
          plainToInstance(SupportListDto, { limit: 51, unread: "maybe" }),
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      await validate(
        plainToInstance(SupportListDto, { limit: 50, unread: "false" }),
      ),
    ).toHaveLength(0);
  });
  test("requires a nonnegative version for reply concurrency", async () =>
    expect(
      (
        await validate(
          plainToInstance(SupportReplyDto, {
            message: valid.message,
            submissionKey: valid.submissionKey,
            version: -1,
          }),
        )
      ).length,
    ).toBeGreaterThan(0));
});
