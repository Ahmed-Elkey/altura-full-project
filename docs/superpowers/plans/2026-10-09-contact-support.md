# Contact support implementation plan

> For agentic workers: use subagent-driven-development with scoped implementation and independent review; preserve existing workspace because this checkout has no Git repository.

**Goal:** Saved support conversations between website customers and admins with durable email notifications.
**Architecture:** NestJS support module owns authorization, Prisma persistence and an email outbox; shared React conversation components use explicit customer/admin/guest API boundaries. Existing SMTP transport sends branded links back to the website.
**Tech Stack:** Next15, React19, Nest11, Prisma6, PostgreSQL, Nodemailer, Jest, Playwright.
**Spec:** docs/superpowers/specs/2026-10-09-contact-support-design.md (approved by user).

## Global constraints

Preserve existing data; additive migrations only. No new dependencies. No private env/token content in output. Explicit owner/ADMIN permissions on every request. No consent changes, no attachments, no inbound-email claim. Existing customer/admin typography. Tests at390/768/1440px. Actual test email transport captured; no email to real customers.

## API contract

Every ticket: `{id,reference,name,email,subject,orderReference,status,version,createdAt,updatedAt,lastMessageAt,unread}`. Status `OPEN|AWAITING_CUSTOMER|RESOLVED`. Detail adds `messages:[{id,authorType:'CUSTOMER'|'ADMIN',body,createdAt}]`; only admin detail adds `deliveries:[{id,messageId,status:'PENDING'|'SENDING'|'SENT'|'FAILED',attempts,sentAt}]`.
Lists `{items,total,page,limit}`; default25, max50. List query q, status, page, limit, unread (admin only). Public create request `{name,email,subject,orderReference?,message,submissionKey,website?}` (website honeypot), response `{ticket,accessToken?}`. Authenticated identity wins over supplied email. Guest creation returns scoped short-lived accessToken for immediate continuation, never global account access.

`POST /support` optional account bearer auth. `POST /support/:id/access {token}` exchanges emailed30day fragment token for scoped access `{accessToken,expiresAt}`. Guest operations require `X-Support-Access` header. `POST /support/:id/recover {email}` always `{accepted:true}`. Customer GET `/support/me`, GET `/support/me/:id`, POST `/support/me/:id/replies`, POST `/support/me/:id/read`. Guest GET `/support/guest/:id`, POST `/support/guest/:id/replies`, POST `/support/guest/:id/read`. Admin GET `/admin/support`, GET `/admin/support/:id`, POST `/admin/support/:id/read`, POST `/admin/support/:id/replies`, PATCH `/admin/support/:id/status`, POST `/admin/support/:id/deliveries/:deliveryId/retry`.
Replies body `{message,submissionKey,version}` return detail; status `{status,version}` returns detail; read `{version}` acknowledges only the displayed ticket version and returns `{read:true}`; delivery retry `{}` returns `{queued:true}`. Known version conflicts409; denied/missing ticket404; expired/invalid guest access401. Ticket persistence is success even if email pending/failed.

## Task1: Backend support subsystem
Files: backend/prisma/schema.prisma, additive migration; backend/src/modules/support/{support.module,support.controller,support.service,support-email,support-delivery.service,dto,specs}; app.module; existing security/config policy registration.
- [x] Write and run failing Jest tests for validation, authorization, idempotency, guest access expiry, version conflicts, message/status transitions, outbox recovery and safe email escaping.
- [x] Implement transactionally persisted tickets/messages/deliveries, explicit ownership, scoped hashed guest links exchanged to short-lived access, escaped branded HTML/text. Sensitive outbox link payload encrypted with derived server secret, never plaintext logs.
- [x] Add poll worker with atomic lease, finite retry/backoff and expired-lease recovery. `SUPPORT_EMAIL_WORKER_ENABLED` defaults true, can disable for verification; never expose test bypass endpoint. Optional `SUPPORT_ADMIN_EMAIL` notifications only when configured.
- [x] Add RateLimit policies support-create(5/15min), support-access(20/15min), support-reply(20/15min), support-recover(5/15min), validated configuration and strict bounds.
- [x] Run prisma validate/generate, targeted Jest and backend typecheck/build. Do not migrate/reset/restart services yourself; root handles local runtime.

## Task2: Customer/guest/admin interfaces
Files: components/BalmoralContactForm.tsx, components/support/*, lib/support.ts, app/account/support/*, app/support/*, app/admin/support/*, account/admin nav, app/global styles and Next private headers.
- [x] Write browser RED tests: Contact has Send message and persists submission instead of mailto; admin reply/status; guest/customer conversation; failed submission preserves draft; expired access recovery; responsive layout.
- [x] Implement contact validation and stable submission key, disabled double-submit and genuine saved confirmation with ticket reference.
- [x] Shared detail component uses scoped endpoints, text rendering, reply drafts, refresh/retry, readable conflict errors, viewer read state and status. Guest fragment scrubbed immediately, access held per-tab sessionStorage; never localStorage/query URLs. No account auth requirement for guest route.
- [x] Implement admin paginated inbox/search/status/unread and failed-delivery retry, navigation links, readable loading/empty/error states. Account list includes start new request link.
- [x] Private pages noindex/no-store and no guest content SSR. Run frontend typecheck and mocked browser tests.

## Task3: Integrate, review and verify
Files: scripts/verify-support.cjs, tests/support.spec.ts, QA_REPORT.md, docs/support-workflow.md.
- [x] Deploy only the additive migration to guarded local5434/altura_friend, build/restart owned API with worker disabled during captured-email synthetic tests.
- [x] Real API/DB/browser roundtrip: guest create + customer create -> admin inbox/reply -> correct customer/guest read/reply -> resolved/reopen; wrong owner and non-admin forbidden, retries unique, missing/expired token denied. Exercise email worker directly with captured sendMessage and verify branded escaped payload/delivery state. Delete all synthetic support/users/audit records.
- [x] Request independent review of implementation/spec boundaries, address substantive findings and re-review.
- [x] Run all backend tests/build and frontend typecheck/build, final production support/account/admin/order/cart regressions, responsive screenshots and live health. Restore enabled mail worker; keep preview3100/API4000 running; document operational boundaries and exact test evidence.

## Preflight decisions

No Git checkout exists, so no worktree/commits can be made; preserve shared checkout and record scoped files. Frontend consumes the fixed contract; root owns frontend while the single backend implementer owns backend files. Review can run against completed backend while frontend implementation continues, avoiding concurrent implementation agents and file conflicts.
