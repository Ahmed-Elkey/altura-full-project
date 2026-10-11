import { DEFAULT_OFFER, OfferConfig, presentOffer } from "./offer-config";
const escape = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
export function buildNewsletterEmail(
  code: string | null,
  expiresAt: Date,
  confirmUrl: string,
  unsubscribeUrl: string,
  config: OfferConfig = DEFAULT_OFFER,
) {
  for (const link of [confirmUrl, unsubscribeUrl]) {
    const url = new URL(link);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw Error("Invalid email link");
  }
  const expiry = new Intl.DateTimeFormat("en", {
    dateStyle: "long",
    timeZone: "Africa/Cairo",
  }).format(expiresAt);
  const display = presentOffer(config, 0);
  const active = !!code && config.enabled && config.type !== "NONE";
  const action = active
    ? `Confirm & unlock ${display.description}`
    : "Confirm subscription";
  const text = `ALTURA — Move Higher\n\n${config.title}\n${config.welcomeText}\n${display.description}\nConfirm your subscription${active ? ` to unlock ${display.description}` : ""}:\n${confirmUrl}\n\n${active ? `Your code: ${code}\nValid until ${expiry}. ` : ""}${display.terms}\n\nIf you did not request this, you can ignore this email. No subscription is activated without confirmation.\nUnsubscribe: ${unsubscribeUrl}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Welcome to ALTURA</title><style>@media(max-width:520px){.shell{padding:28px 16px!important}.card{padding:24px 20px!important}}</style></head><body style="margin:0;background:#f6f6f4;font-family:Inter,Arial,Helvetica,sans-serif;color:#171717"><div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escape(display.description)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f6f6f4"><tr><td class="shell" align="center" style="padding:48px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;table-layout:fixed"><tr><td style="padding-bottom:28px;font-size:18px;letter-spacing:4px">ALTURA</td></tr><tr><td class="card" bgcolor="#ffffff" style="padding:32px;border:1px solid #dededb;border-radius:12px"><p style="margin:0 0 12px;font-size:11px;letter-spacing:1.5px;color:#73736e">WELCOME TO THE COMMUNITY</p><h1 style="margin:0 0 14px;font-size:26px;line-height:1.25;font-weight:600;letter-spacing:-.6px">${escape(config.welcomeText || config.title)}</h1><p style="font-size:14px;line-height:23px;color:#73736e">${escape(config.title)}. Confirm your email to activate your subscription${active ? " and unlock your welcome reward" : ""}.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="#f6f6f4" style="padding:20px;border-radius:8px"><p style="margin:0 0 10px;font-size:13px;color:#73736e">${escape(display.description.toUpperCase())}</p><p style="margin:0;font-size:20px;font-weight:600;letter-spacing:2px;word-break:break-all">${escape(code || "Newsletter updates")}</p></td></tr><tr><td style="padding-top:24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="#171717" align="center" style="border-radius:10px;mso-padding-alt:16px 24px"><a href="${escape(confirmUrl)}" style="display:block;padding:16px 24px;font-size:14px;font-weight:600;text-decoration:none;color:#ffffff;border-radius:10px">${escape(action)}</a></td></tr></table></td></tr></table><p style="font-size:12px;line-height:20px;color:#73736e">${active ? `Valid until ${escape(expiry)}. ` : ""}${escape(display.terms)}</p><p style="padding-top:20px;border-top:1px solid #e6e6e3;font-size:12px;line-height:20px;color:#73736e">Button not working? Copy this link into your browser:</p><p style="font-size:12px;line-height:20px;word-break:break-all;overflow-wrap:anywhere"><a href="${escape(confirmUrl)}" style="color:#171717">${escape(confirmUrl)}</a></p><p style="font-size:12px;line-height:20px;color:#73736e">If you didn’t request this, ignore this email. Your subscription stays inactive until you confirm.</p></td></tr><tr><td style="padding-top:24px;font-size:11px;line-height:20px;color:#73736e">ALTURA · MOVE HIGHER<br><a href="${escape(unsubscribeUrl)}" style="color:#73736e;text-decoration:underline">Unsubscribe</a></td></tr></table></td></tr></table></body></html>`;
  return {
    subject: active
      ? `Welcome to ALTURA — ${display.description}`
      : "Welcome to ALTURA",
    html,
    text,
  };
}
