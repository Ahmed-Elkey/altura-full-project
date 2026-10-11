/** Table layout and inline styles keep the account design usable in mail clients. */
export function buildPasswordResetEmail(resetUrl: string): { html: string; text: string } {
  const parsed = new URL(resetUrl);
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Invalid reset URL');
  const link = resetUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const text = `ALTURA — Move Higher\n\nReset your password\n\nWe received a request to reset the password for your ALTURA account. Open this link to choose a new password:\n\n${resetUrl}\n\nThis link expires in 30 minutes and can be used only once.\n\nIf you didn't request a password reset, you can safely ignore this email. Your password will stay the same.\n\nALTURA account security`;
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>Reset your ALTURA password</title>
<style>@media only screen and (max-width: 520px){.email-shell{padding:28px 16px!important}.email-card{padding:24px 20px!important}.email-title{font-size:24px!important}}a:focus-visible{outline:2px solid #445d4b;outline-offset:4px}</style></head>
<body style="margin:0;padding:0;background-color:#f6f6f4;color:#171717;font-family:Inter,Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">Choose a new password for your ALTURA account. Your secure link expires in 30 minutes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f6f4"><tr><td class="email-shell" align="center" style="padding:48px 24px;">
<!--[if mso]><table role="presentation" width="520" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;table-layout:fixed;">
<tr><td style="padding:0 0 28px;font-size:18px;font-weight:400;letter-spacing:4px;color:#171717;">ALTURA</td></tr>
<tr><td class="email-card" bgcolor="#ffffff" style="padding:32px;border:1px solid #dededb;border-radius:12px;background-color:#ffffff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;">
<tr><td style="padding:0 0 12px;color:#757570;font-size:11px;line-height:18px;letter-spacing:1.5px;">ACCOUNT SECURITY</td></tr>
<tr><td><h1 class="email-title" style="margin:0;color:#171717;font-size:26px;font-weight:600;line-height:1.25;letter-spacing:-0.6px;">Reset your password</h1></td></tr>
<tr><td style="padding:14px 0 24px;color:#73736e;font-size:14px;line-height:23px;">We received a request to reset the password for your ALTURA account. Use the button below to choose a new password.</td></tr>
<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#171717" style="background-color:#171717;border-radius:10px;mso-padding-alt:16px 24px;"><a href="${link}" style="display:block;padding:16px 24px;border-radius:10px;font-family:Inter,Arial,Helvetica,sans-serif;font-size:14px;line-height:18px;font-weight:600;text-align:center;color:#ffffff;text-decoration:none;">Reset password</a></td></tr></table></td></tr>
<tr><td style="padding:14px 0 24px;color:#73736e;font-size:12px;line-height:20px;">This link expires in <strong style="font-weight:600;color:#171717;">30 minutes</strong> and can be used only once.</td></tr>
<tr><td style="padding:22px 0 0;border-top:1px solid #e6e6e3;color:#73736e;font-size:12px;line-height:20px;">Button not working? Copy and paste this link into your browser:</td></tr>
<tr><td style="padding:8px 0 24px;font-size:12px;line-height:20px;word-break:break-all;overflow-wrap:anywhere;"><a href="${link}" style="color:#171717;text-decoration:underline;word-break:break-all;overflow-wrap:anywhere;">${link}</a></td></tr>
<tr><td style="color:#73736e;font-size:12px;line-height:20px;">If you didn’t request a password reset, you can safely ignore this email. Your password will stay the same.</td></tr>
</table></td></tr>
<tr><td style="padding:24px 0 0;color:#73736e;font-size:11px;line-height:20px;">ALTURA · MOVE HIGHER<br>Sent to help keep your account secure.</td></tr>
</table><!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  return { html, text };
}
