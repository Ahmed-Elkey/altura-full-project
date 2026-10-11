# Contact and support conversations

Contact: `/info/contact` (also `/info/contact-us`). Saved support requests appear under `/admin/support`; account owners use `/account/support`. Guests continue from their scoped browser session or the secure email link to `/support/<id>`.

Messages are stored before the form confirms success. Admin replies set Awaiting customer; customer replies set Open and reopen Resolved tickets. Status and read state are distinct: each administrator has a read cursor, while customer/guest read acknowledgements cover only messages actually fetched. Explicit refresh controls and visible-tab polling keep conversations current. Search, status and unread filters plus pagination are available in the admin inbox.

Email notifications link back to the website conversation. Replies directly to Gmail or another mail app are **not imported**. Support does not opt anyone into newsletters. First release accepts text only, with message10–5000characters, subject160, name120, email254 and optional order reference80. Order reference does not authorize access to order data.

## Configuration and delivery

Existing `MAIL_PROVIDER`, SMTP/Resend credentials and `PASSWORD_RESET_FROM` send support email. `SUPPORT_ORIGIN` optionally chooses the website origin, falling back to `PASSWORD_RESET_ORIGIN` then the first `FRONTEND_ORIGIN`. Production requires HTTPS. Set the real public origin before deploying email links; localhost links work only where that local site is reachable.

`SUPPORT_ADMIN_EMAIL` is optional. Without it, requests still arrive in the dashboard; no arbitrary administrator address is guessed. Configure it deliberately to receive inbox notifications too.

The persistent worker runs in the API process. `SUPPORT_EMAIL_WORKER_ENABLED` defaults true; polling5000ms, batch10, lease120seconds. Failed delivery retries with exponential delay30seconds to1hour, maximum5attempts by default. Exhausted delivery stays Failed and admins can Retry email. Restarting the API preserves pending jobs, and expired leases are reclaimed. Saving a reply is separate from delivery success. SMTP acceptance can be ambiguous after a connection loss; exactly-once external email delivery is not promised, while message retries are idempotent.

Email payloads are AES-GCM encrypted. `SUPPORT_ENCRYPTION_SECRET` optionally supplies a stable32+character key; otherwise the key is derived from `JWT_REFRESH_SECRET`. Keep this key stable while encrypted pending jobs exist. Changing it requires deliberate handling of pending deliveries.

Guest link tokens are stored hashed and expire after30days; exchanged scoped sessions last30minutes. Anonymous creation retries cannot renew access beyond the original30minute creation window. Older exact retries preserve the saved request and direct the guest to email recovery. Email recovery results do not reveal whether the requester matches. Guest access/drafts use per-tab session storage with a memory fallback; successful replies clear drafts. Access keys never enter query strings or application logs.

Public creation/recovery/access/reply requests are rate-limited by the existing API process limiter. Each process has its own limiter; multiple API replicas should use a shared rate-limit store before horizontal scaling. Support HTML and API responses are private/no-store, noindex and no-referrer. Owner/active-admin authorization remains mandatory irrespective of these headers.

## Verification

`tests/support.spec.ts` exercises form submit/retry, scoped links, expiry/draft recovery, blocked browser storage, inbox/reply/status/email retry, old submission recovery, login return destination and responsive customer layout. Existing information-interaction tests now assert persisted contact behavior, rather than mailto preparation.

`scripts/verify-support.cjs` guards the actual local database127.0.0.1:5434/altura_friend, requires the local API worker disabled, creates synthetic accounts/tickets, exercises real API and browser roundtrips, captures email transport through the internal delivery service, checks permissions and expiry, and cleans all synthetic records. It does not send email to real recipients. The script captures responsive guest/customer/admin screenshots under `/tmp/altura-support-*`.

To run locally after builds/migration: disable worker only for the test API process with `SUPPORT_EMAIL_WORKER_ENABLED=false node scripts/restart-local-api.cjs`, run `node scripts/verify-support.cjs`, then restore normal API with `node scripts/restart-local-api.cjs`. No database reset or seed is needed.
