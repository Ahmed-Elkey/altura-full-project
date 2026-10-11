import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "crypto";
export interface SupportEmailPayload {
  url: string;
  reference: string;
  name: string;
  subject: string;
  body: string;
  kind: "CREATED" | "REPLY" | "RECOVERY" | "ADMIN";
}
export const supportHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const escape = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
export function buildSupportEmail(payload: SupportEmailPayload) {
  const url = new URL(payload.url);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    !/^\/(?:support|account\/support|admin\/support)\/[^/]+$/.test(url.pathname)
  )
    throw new Error("Unsafe support URL");
  const title =
    payload.kind === "CREATED"
      ? "Your message is saved"
      : payload.kind === "RECOVERY"
        ? "Open your conversation"
        : payload.kind === "ADMIN"
          ? "A customer needs support"
          : "A reply from ALTURA";
  const instruction =
    "Continue this conversation on the website. Replies to this email are not imported.";
  const text = `ALTURA · MOVE HIGHER\n\n${title}\n${payload.reference} · ${payload.subject}\n\nHello ${payload.name},\n\n${payload.body}\n\n${instruction}\n\n${payload.url}\n\nGuest links expire after 30 days. You can request a fresh link from the conversation page.`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f6f6f4;color:#171717;font-family:Inter,Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" style="max-width:540px;table-layout:fixed"><tr><td style="padding:0 0 24px;font-size:18px;letter-spacing:4px">ALTURA</td></tr><tr><td style="padding:28px;background:white;border:1px solid #dededb;border-radius:12px"><p style="font-size:11px;letter-spacing:1px;color:#73736e">SUPPORT · ${escape(payload.reference)}</p><h1 style="font-size:26px;font-weight:600">${title}</h1><p style="font-size:14px">${escape(payload.subject)}</p><p>Hello ${escape(payload.name)},</p><div style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;line-height:1.7">${escape(payload.body)}</div><p style="font-size:13px;color:#73736e;line-height:1.7">${instruction}</p><a href="${escape(payload.url)}" style="display:block;padding:16px;background:#171717;color:white;border-radius:8px;text-align:center;text-decoration:none">Open conversation</a><p style="font-size:12px;color:#73736e">Guest links expire after 30 days.</p></td></tr><tr><td style="padding-top:24px;font-size:11px;color:#73736e">ALTURA · MOVE HIGHER</td></tr></table></td></tr></table></body></html>`;
  return { html, text, subject: `ALTURA support · ${payload.reference}` };
}
@Injectable()
export class SupportCrypto {
  constructor(private readonly config: ConfigService) {}
  origin() {
    const raw =
      this.config.get<string>("SUPPORT_ORIGIN") ||
      this.config.get<string>("PASSWORD_RESET_ORIGIN") ||
      this.config.get<string>("FRONTEND_ORIGIN")?.split(",")[0];
    try {
      const url = new URL(raw?.trim() || "");
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        (this.config.get("NODE_ENV") === "production" &&
          url.protocol !== "https:")
      )
        throw new Error();
      return url.origin;
    } catch {
      throw new ServiceUnavailableException(
        "Support is temporarily unavailable",
      );
    }
  }
  private key() {
    const secret =
      this.config.get<string>("SUPPORT_ENCRYPTION_SECRET") ||
      this.config.get<string>("JWT_REFRESH_SECRET");
    if (!secret || secret.length < 32)
      throw new ServiceUnavailableException(
        "Support is temporarily unavailable",
      );
    return createHmac("sha256", secret)
      .update("altura-support-outbox-v1")
      .digest();
  }
  encrypt(value: unknown): string {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key(), iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]);
    return [
      "v1",
      iv.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      encrypted.toString("base64url"),
    ].join(".");
  }
  decrypt(value: string): SupportEmailPayload {
    const [version, iv, tag, data, extra] = value.split(".");
    if (version !== "v1" || !iv || !tag || !data || extra)
      throw new Error("Invalid support payload");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key(),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(data, "base64url")),
        decipher.final(),
      ]).toString("utf8"),
    );
  }
}
