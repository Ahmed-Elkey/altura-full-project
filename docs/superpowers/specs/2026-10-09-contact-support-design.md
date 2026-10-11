# ALTURA contact and support conversations

Status: approved, implemented and verified on the local production preview (2026-10-09).

## Outcome

Replace the current `/info/contact` mailto preparation with a persisted support conversation. Customers can submit a question or problem, admins can respond from the dashboard, and the customer can continue the same conversation. All screens and emails follow the existing ALTURA customer/admin typography and shared design styles.

## Chosen approach and alternatives

Recommend a website support inbox with outbound email notifications and secure guest access. It reuses the existing NestJS API, Prisma database, customer/admin authentication and configured SMTP transport. The database holds the conversation even when email delivery fails.

Email-only contact is simpler but does not provide a dashboard conversation or reliable saved history. A third-party helpdesk adds another service and different UI. Neither is necessary for the requested workflow.

## Customer flow

The existing Contact page offers name, email, subject, optional order reference and multiline message. Logged-in customers use their authenticated identity; the server does not trust an arbitrary user ID or supplied email to claim ownership. Guests may submit without an account. Order references are context only and never grant access to order details.

Successful submission means the server has saved the message. Show a ticket reference and clear next steps. Preserve inputs on errors, disable duplicate submission during requests and use an idempotency key for retried submissions. A confirmation email provides a secure conversation link. Anonymous submissions do not reveal earlier conversations for the submitted email address.

Add `/account/support` and `/account/support/[id]` for authenticated owners to list and continue their requests. Add a private `/support/[id]` guest conversation page. A cryptographically random token is sent only by email, stored as a hash, expires after 30 days, and is exchanged from a URL fragment into short-lived scoped access without putting it in query strings, logs or referrers. Guest access is limited to that conversation. The initial browser can retain scoped access after successful creation so it can follow its own request if delivery is temporarily unavailable.

Customers can read the message timeline, reply, see status, and reopen a resolved conversation by replying. First release supports text messages; attachments and live chat are outside this workflow.

## Admin flow

Add Support to the existing Relations navigation and `/admin/support` plus `/admin/support/[id]`. The inbox has paginated tickets, search by reference/subject/email, status filters, unread indicator, latest activity and customer identification. Only authenticated active ADMIN users can access or mutate it.

The detail page shows the full timeline and a reply editor, with Open, Awaiting customer and Resolved states. A saved admin reply schedules an email notification. Display delivery state distinctly from message-save success; failed delivery has an explicit retry action. Mark read only for the viewer; an admin viewing a ticket must not mark it read for the customer. Record admin replies, status changes and delivery retries in the existing audit log without logging tokens or message content.

## Conversation and email behavior

Customer message -> saved ticket/message -> visible in admin inbox. Admin reply -> saved message -> branded email notification -> customer follows link and replies on the website -> visible in the same admin thread.

These emails explicitly direct further responses to the website conversation. Replies made directly in Gmail or another email app are not automatically imported. Receiving and threading incoming email would need a separate inbound-mail integration; the initial implementation must not imply it exists.

Use the existing SMTP sender and a shared branded HTML/text template. Do not use the current placeholder `info@altura.eg` as a configured destination. Admin inbox is the authoritative destination; email notifications to admins are optional and enabled only with an explicit configured address, not guessed from credentials.

## Persistence and delivery

Add Prisma models for SupportTicket, SupportMessage, hashed scoped guest access and SupportEmailDelivery. Ticket fields include reference, optional authenticated owner, requester identity snapshot, subject, optional order reference, status, viewer-specific read cursors, version and activity timestamps. Messages record author type, optional actor ID, body, creation time and unique submission key.

Save message and pending email delivery atomically. Use a persisted worker with retry attempts, backoff and atomic claims; SMTP failures cannot delete or hide saved messages. Avoid duplicate messages on retries; document that SMTP cannot guarantee exactly-once delivery after ambiguous provider acceptance. Use version checks or transactions for competing status/reply changes and clearly surface conflicts without discarding drafts.

Apply additive database migrations against the preserved local database; no reset or reseed. Reuse existing module/auth conventions, transport and audit infrastructure, and avoid unrelated refactors.

## Access, validation and operational limits

Server-side length limits: name 120, email 254, subject 160, order reference 80, message 10–5000 characters. Render submitted content as text; escape it in emails. Rate-limit public creation and guest access/replies, include a honeypot, validate identity and ticket ownership on every request, cap pagination and refuse unsafe destinations. No email sends to arbitrary user-selected notification targets beyond the requester email captured for that ticket.

Support pages and APIs are private/noindex with no-store responses. Public Contact metadata stays indexed. Do not place support content in sitemap, analytics, logs or shared caches. Generic denied/not-found responses avoid leaking the existence of another customer's request. Expired guest access offers a rate-limited email recovery flow with a generic result. No automatic marketing consent or newsletter subscription.

## Verification and acceptance

Backend tests cover guest/customer creation, input validation, ownership isolation, ADMIN authorization, idempotent retry, concurrent replies/status updates, unread handling, guest-token expiry/recovery, rate limits and email worker retry behavior.

Browser checks cover actual form submit, admin inbox/filter/detail/reply/status, customer and guest continuation, delivery failure/retry, draft preservation and readable loading/error/empty states at 390/768/1440px without horizontal overflow.

Run a real local API/DB/browser round trip with synthetic records and captured email delivery; clean those records afterwards. An external inbox test requires a deliberately selected test recipient and must not send test messages to real customers. Run frontend/backend type checks, builds and relevant existing auth/account/admin regressions before completion. Keep the updated local preview running.
