# ALTURA QA report — 7 October 2026

## Scope and environment
The audit covers every implemented page family, static aliases, all 9 active catalog products and representative account/admin detail records. Public inventory: 65 paths. Protected inventory: 18 paths. Responsive widths: 390, 768 and 1440px; homepage layout also covers 1024 and 1920px.

The stable frontend production preview runs at http://127.0.0.1:3100. API: loopback port 4000. PostgreSQL: the existing local QA database on port 5434. Initial production verification used a separate temporary preview on port 3200; final verification uses the stable preview on 3100. `.next-dev` and `.next` isolate dev and production artifacts, and `npm run local:start` reuses a healthy existing server. No database reset, migration or reseed was performed.

## Confirmed results
- Backend: 14 Jest suites, 94 tests passed; health reports a connected database.
- Public production scan: all 65 paths at all three widths passed HTTP, heading, runtime-error and horizontal overflow checks; alias regression passed.
- Protected production scan: 63 tests passed, including populated pages, Inter headings, contained scrollable tables, filter/pagination requests and modal focus behavior.
- Homepage production layout: passed at five widths, including product links, images, color swatches and footer containment.
- Production build: passed compilation, type checking and generation of 53 static pages.

## Fixed defects
See DESIGN_AUDIT.md. Functional fixes include legacy links, missing Security navigation, dialog keyboard focus, mobile admin filter sizing and information-header contrast/spacing. Outdated tests were corrected for Next image optimization, streamed redirects, image load readiness and the approved light-only palette.

## Real registration evidence and rate limit
A fresh synthetic customer successfully registered, merged guest cart/wishlist ownership, reloaded an authenticated session, accessed Profile, signed out and signed back in. Repeating this workflow consumed the intentionally configured per-IP registration allowance. Its final duplicate-registration attempt returned HTTP 429 instead of the test's expected 409. No rate-limit protection was disabled. This run is not counted as a fully passing integration test; duplicate handling also has backend test coverage. The public registration role-injection check and six responsive auth-form checks passed.

## Coverage limits
The protected route scan uses synthetic API fixtures, so it verifies display, navigation and request contracts rather than every live record or every administrative mutation. Payment and shipment workflows are local/demo integrations. No real payment charge, external carrier handoff, email delivery or third-party webhook was initiated. Contact prepares an email link and does not claim to send a message. A route inventory and finite interaction tests cannot establish that every possible input, device or future record is bug-free.

## Final verification
- Selected browser suite: 184 unique checks; **183 passed**, 1 deliberately skipped (the real-outage test requires an unavailable backend). Two inventory test defects in the combined run were corrected and their targeted reruns passed: streamed product headings and lazy/visible responsive assets. This is aggregate verification across the combined run and targeted reruns, not a claim that the original combined run exited successfully.
- All 65 public paths passed at 390, 768 and 1440px, including visible heading typography.
- Real customer/admin login returned 200, protected reads returned 200, and the actual ALTURA refresh/guest cookies had HttpOnly/Lax flags. Development HMR cookies are excluded from auth-cookie assertions.
- Contact/FAQ/lookbook controls and light palette/autofill/focus checks passed at all selected widths.
- `npm run lint`: passed. `npm run check:local`: passed, including 196 product JPGs, 20 product folders and 21 visible colorways.
- Detached launcher occupied-port regression: passed. `npm run local:preview` correctly reused the running app.
- Final frontend health, About/Journal aliases and backend health returned HTTP 200; commerceReady=true and database=connected.

### How to use the result
The app is running at http://127.0.0.1:3100 in a detached production preview. `npm run local:preview` starts/reuses this mode after a successful build. For code editing, stop the known preview process and use `npm run local:start` (detached development) or `npm run dev:local` (foreground). Logs and PID are under `.hero-build/production.*`. Development and production output directories remain isolated; do not rebuild files underneath an active production preview.

### Evidence locations
Browser artifacts: `/tmp/altura-verified-all`, `/tmp/altura-public-verified`, `/tmp/altura-inventory-final`, `/tmp/altura-polish-verified`. Sanitized real-auth/service evidence: `/tmp/altura-final-real-auth`. These are temporary local artifacts, not deployment outputs or externally published data.

## Color selection motion — 8 October 2026
The shared product-card color underline now stays mounted and moves with a 240ms transform transition. Its position is measured again when the swatch row resizes; reduced-motion preferences disable the animation.

The updated production preview on port 3100 passed all five targeted browser tests: continuous movement at 390, 768 and 1440px, rapid color changes and resize alignment, reduced motion, and the homepage layout regression at five widths. Artifacts: `/tmp/altura-marker-final`. Production build and `npm run check:local` passed. Frontend and backend health returned HTTP 200, with commerce ready and the existing database connected.

## Product details and image viewer — 8 October 2026
Product details now share the customer Inter typography, white cards, rounded controls and spacing. The gallery uses two columns on desktop and horizontal scrolling on mobile. Recommendations and recently viewed cards have bounded widths and a responsive grid.

The previous fixed viewer inherited the animated route's transformed containing block, so its height followed the document and images could appear outside the viewport. A body portal now keeps the light-background viewer in the viewport, above the header. It includes 2× scrollable zoom, four image views, keyboard navigation, focus containment/restoration, and a retry state for failed images. The mobile purchase bar also lives outside the transformed route.

The final production preview passed five product tests covering 390/768/1440px, gallery proportions, compact recent cards, image visibility, actual zoom dimensions, image navigation, close/focus behavior, failed-image recovery and all four images for each of the nine active products. Existing cart controls, four color-marker checks and the homepage layout regression passed in the combined run; the new product tests needed selectors scoped to the visible page to exclude Next's hidden streamed templates, and all five then passed in their final rerun. Evidence: `/tmp/altura-product-detail-production-final`, `/tmp/altura-product-detail-production`. Browser runtime errors were empty in fresh mobile and desktop sessions. Independent code review found no important defects. Build, type checking, local asset checks and both service health checks passed; commerce remains ready and the database connected.

## Customer login and registration design — 8 October 2026
Login and Create account now use the customer white card, Inter typography, light canvas, subtle input borders and black primary button. A Back to shop link is available in the header. Loading states also use the same canvas and card.

All six existing responsive auth-form checks passed on the final production preview at 390, 768 and 1440px: fields, validation messages, keyboard order, centered cards, contained error messages, no horizontal overflow, and the customer card/button typography and colors. Build/type checks and the local asset check passed. Evidence: `/tmp/altura-auth-design-final`; empty-form visual captures: `/tmp/altura-auth-login-1440.png`, `/tmp/altura-auth-register-390.png`. Authentication logic was not changed. The user explicitly deferred Forgot password and email delivery; no recovery endpoint or inactive recovery button was added.

## Shared loading design — 8 October 2026
A shared LoadingState now provides the customer typography, light card, restrained spinner and decorative placeholders for the route boundary, account/admin session restoration, login/register fallbacks, wishlist, orders, confirmation, cart and checkout. Inline variants fit inside existing cards. Reduced-motion settings disable the spinner and shimmer; no artificial wait or progress percentage was introduced.

Five production loading tests passed: delayed wishlist loading at 390/768/1440px, reduced-motion session restoration followed by sign-in, and failed-request recovery with retry. Six auth-form regressions and checkout passed in the combined run. The cart persistence check initially clicked the auto-hidden navigation after reload restored the scroll position; its test now scrolls to the top before using the header and passed its targeted rerun. Evidence: `/tmp/altura-loading-final`, `/tmp/altura-loading-cart-verified`, and `/tmp/altura-loading-390.png`. Build/type checks, local assets and both health endpoints passed. Existing request/error handling and database data were preserved.

## 2026-10-08 — Password recovery and newsletter

- Added customer-style Forgot password and Reset password pages; login links to recovery. Recovery API uses a server-only Resend transport, 30-minute signed one-use links in URL fragments, atomic password changes, session revocation and request rate limits. Public request responses do not wait on account lookup/provider delivery.
- Protected login, refresh and authenticated password changes against concurrent recovery resets with conditional user updates and transaction lock ordering.
- Newsletter validates/normalizes email, protects pending submission, checks the API's confirmation and displays retryable failures. Existing database upsert remains idempotent, now with request rate limiting. No welcome message or marketing campaign is sent automatically.
- Backend: **18 suites / 110 tests passed**; backend build passed. Frontend typecheck and production build passed. Production browser verification: **12 tests passed** (7 recovery/newsletter plus 5 loading regressions), including 390/768/1440px recovery layouts and failure states.
- Real local integration passed using a temporary synthetic account and subscription: simultaneous resets yielded one 200 and one 400, replay rejected, old access/refresh tokens rejected, old password rejected and new password accepted; repeated newsletter subscribe stored one row. Synthetic records were cleaned up. Mail delivery was mocked; no email was sent.
- Visual review: `.hero-build/forgot-password-desktop.png`, `.hero-build/forgot-password-mobile.png`. Production frontend remains on port 3100; API on 4000.
- **Pending external configuration:** Resend API key and verified sending domain are not configured. Real email delivery/inbox receipt is unverified. Unconfigured requests return an explicit unavailable state. See `EMAIL_SETUP.md`. Background sending currently runs inside the API process, without a durable queue/retry worker.

## 2026-10-08 — Gmail SMTP without a domain

- Added `MAIL_PROVIDER=smtp` alongside existing Resend delivery using Nodemailer, with TLS on 465 or mandatory STARTTLS on 587. SMTP credentials are server-only in ignored `backend/.env`; it has owner-only file permissions. Provider errors are sanitized, debug logging is disabled and connections have bounded timeouts.
- Backend verification: **19 suites / 115 tests passed**, including 5 new SMTP transport tests; backend production build passed. Independent review found no critical/important SMTP issues.
- **Real Gmail SMTP authentication and TLS connectivity succeeded** using the user-authorized credentials. No actual message was sent during this verification; inbox delivery remains unverified.
- Local database/runtime were stopped when checked; restored existing PostgreSQL data, API on 4000 and production frontend on 3100 without migrations, reset or reseeding. Password recovery integration continues to use mocked mail delivery and temporary synthetic records.
- The previous pending Resend configuration no longer blocks local recovery: Gmail SMTP is now selected. Gmail sending limits apply. Password reset recipients must be active registered ALTURA accounts. Local reset links require access to the running local site.

### User-requested live email test

- Sent one clearly labelled ALTURA delivery-test email to the user-configured Gmail account after the user explicitly requested the test. Gmail SMTP accepted the recipient/message. Inbox receipt remains user-confirmed only; no mailbox access was attempted.
- Read-only lookup found the configured sender address is not an active ALTURA customer account, so no password reset was requested for that address and no customer account/password was changed.

## 2026-10-08 — Branded password reset email

- Password reset emails now include a responsive HTML template for SMTP and Resend, with ALTURA branding, customer-style light background/white rounded card, black action button, expiry explanation, copyable fallback URL and security footer. A plain text alternative remains available.
- Inline styles and presentation tables avoid dependence on JavaScript, external assets or remote fonts; Inter falls back to Arial/Helvetica when unavailable in the mail client. Dynamic links are HTML-escaped and must be HTTP(S), without URL credentials.
- Backend: **20 suites / 120 tests passed**, backend build passed. Email browser previews at 390/768/1440px show no horizontal overflow, including a long synthetic reset URL. Visual review passed. Artifacts: `.hero-build/password-reset-email.html` and `password-reset-email-{390,768,1440}.png`.
- API restarted with the styled template. Recovery integration passed with synthetic records and mocked delivery. This design update did not send an additional external message. Outlook/Gmail inbox rendering has not been directly inspected.

## 2026-10-08 — Complete live Forgot password verification

- Per the user's explicit request, verified real Gmail delivery through IMAP and the production browser flow. Prepared a temporary customer only after confirming the sender's primary Gmail had no existing customer account. Used server-only credentials, read-only mailbox selections and BODY.PEEK for only new reset messages matching the recipient/subject and temporary user ID. No tokens, passwords, cookies or message bodies were logged or saved.
- **PASS:** Forgot password submitted through the real UI; styled HTML/plaintext email received in **INBOX**; its real reset URL matched the temporary user; password changed through the UI; URL fragment cleared; old password rejected; new password accepted; old access and refresh sessions rejected; reused emailed link rejected through the UI. Test customer deleted; existing accounts/passwords untouched.
- Live testing found and fixed a real same-tab UI issue: revisiting a reset URL by fragment after success retained the success view. PasswordRecoveryForm now listens for hash changes and rereads the link, clearing previous form/success state. Regression failed before the fix and passed afterwards.
- Verification: **8 recovery/newsletter browser tests passed**, **18 targeted backend tests passed**, frontend production build passed; full live cycle passed on the updated production preview.
- Initial alias-based mail-reader attempts were inconclusive; Gmail's self-alias inbox behavior and test-reader parsing/UID handling were corrected. Final primary-address verification reached INBOX. New live tool: `node scripts/verify-password-recovery-live.cjs --send-live`. This explicitly sends an email and must only be run when live mail testing is authorized; it refuses to use an existing customer account. Earlier test messages may remain in the user's mailbox; their temporary accounts were deleted.


## 2026-10-08 — Confirmed newsletter and personal 10% reward

- Newsletter requests issue one private, email-bound `NL-` coupon: 10% of product subtotal, excluding shipping/tax, one redemption, 30 days from issuance, single checkout code. It is inactive until explicit email confirmation. Repeated/concurrent requests neither create extra coupons nor renew the original expiry. Existing checkout's serializable transaction records coupon usage with the order.
- Welcome HTML and plaintext match ALTURA styling and use the configured SMTP/Resend transport. Signed confirmation/unsubscribe links put tokens in URL fragments; pages perform state changes only on explicit POST, avoiding email scanner activation. Opt-out invalidates old confirmation links and suppresses retries while preserving already earned rewards. Explicit re-subscription uses the existing reward and new consent link.
- Added `/admin/newsletter`: counts, email search, status filters, pagination, welcome send status, constrained retry, coupon expiry/use and linked order numbers. ADMIN-only API guards reject anonymous/customer access. Stale in-process sending leases become retryable after two minutes; delivery uses an atomic lease to prevent duplicate concurrent sends. SMTP acceptance is labelled Sent, not inbox delivery.
- Applied additive migration `20261008010000_newsletter_rewards` to the existing local database, without reset/reseed.
- **Verification:** 21 backend suites / 143 tests passed; 10 newsletter browser tests and 8 existing recovery/newsletter browser tests passed; frontend production build and backend build passed. Responsive confirmation visually checked at 390/768/1440px. Independent review issues (empty status query, opt-out retry suppression, stale sending recovery) fixed.
- `node scripts/verify-newsletter-reward.cjs` passed against real PostgreSQL and live confirmation/admin APIs: concurrent subscription, confirmation requirement, 20 EGP discount on 200 EGP products with 12 EGP shipping unchanged, wrong email rejection, one-use recording, admin usage and permissions, opt-out, no renewal and expiry. Captured mail transport; **no outbound welcome email was sent in this run**. Synthetic subscribers/coupons/orders/admin/customer accounts were cleaned; no inventory modified. SMTP inbox delivery was already verified in the earlier password recovery live test; this new welcome template's inbox delivery has not been separately verified.
- Delivery remains in-process, with saved failure/status and admin retry rather than a durable queue. Local email links still require the running local website.


## 2026-10-08 — Configurable newsletter offers and admin/customer completion

Implemented the approved design and plan in `docs/superpowers`: versioned persisted newsletter settings, immutable issued reward snapshots, five offer modes, dynamic signup/confirmation/email copy and a sandboxed responsive email preview. Admin `/admin/newsletter` controls percentage, fixed amount, free shipping, BUY_X_GET_Y, or no incentive, with validity/use limits, eligibility and generated terms. Concurrent edits return 409 and preserve the browser draft. The original 10% offer remains selected after QA; settings versions increase when QA restores it. Previously issued coupons preserve their terms; already-delivered emails cannot change retrospectively.

Added customer `/account/rewards` for owned rewards, usage/expiry/disabled status and subscription preferences, and `/account/returns` plus detail pages for owned return history. Admin shipping now supports validated zones/methods and deactivation; `/admin/categories` and `/admin/collections` manage taxonomy; product editing supports assignments and image primary/order/metadata. Discount register has search, pagination and separate general/newsletter sources. Issued newsletter coupons accept active-state changes only.

BUY_X_GET_Y is calculated from real eligible item units using the cheapest units in complete sorted bundles. All units must be added to the cart. Saved per-unit allocations govern checkout/order display and refunds; partial discounted bundles are rejected and legacy orders retain their existing calculation. Gift inventory is committed like paid stock. One code per order remains enforced.

Review findings fixed with regression tests: clearing a generic gift discount minimum retained stale snapshot terms; nonpercentage newsletter caps could contradict displayed terms; active shipping zones could overlap country coverage; categories could form cycles; image saves could discard unrelated product/variant drafts or retain stale primary flags; taxonomy editor switching during a pending save could target a different record. Plain text no-incentive welcome email now includes the same offer description as HTML/public copy. Independent scoped re-review found no remaining critical/important findings. The old protected-page audit fixture was updated to supply the newly required category/collection reads; its initial three failures were missing synthetic endpoints, and the complete final rerun passed.

Fresh verification on the final code:
- Backend: **30 suites / 223 tests passed**, backend build passed. Frontend typecheck, production build (62 static pages) and local asset check passed (196 product JPGs).
- Final production browser run: **108 tests passed** across admin operations, configurable offer/customer UI, promotion breakdown, newsletter/recovery, protected-route audits and public-route inventory. The public inventory checked **67 routes including 9 live products at 390/768/1440px**, with typography, horizontal containment and runtime-error assertions. Browser mutations use intercepted synthetic API fixtures; real contracts are covered separately below.
- `node scripts/verify-configurable-offers.cjs` passed against the real selected local PostgreSQL/API: admin permissions/CAS conflicts, settings/public copy/email preview, captured welcome messages, all five offer modes, 300 EGP quote totals (20%=60, fixed=50, shipping=12, gift=100), cash gift order total212, stock20→17, one-use recording, immutable terms, own-account rewards/returns, partial-bundle rejection, complete-bundle return and admin return processing. Received gift-bundle cash refund due is **200 EGP**, excluding the unpaid gift and shipping; attempting to falsely mark cash repayment complete is rejected. Temporary users/products/stock/orders/subscribers/codes/zones/methods/returns/audit rows were cleaned and original offer settings restored.
- `node scripts/verify-password-recovery.cjs` passed: concurrent one-use reset, replay rejection, old access/refresh revocation and old/new password login on a temporary account. No outbound mail in either integration test.
- Visually inspected account rewards and offer editor mobile captures: `/tmp/altura-task4-account-390.png`, `/tmp/altura-task4-offer-390.png`. Additional desktop/tablet and promotion captures are emitted by the browser suites.
- Existing PostgreSQL data preserved; only additive configurable-offer migration applied. Final detached **production preview3100 / API4000** both returned HTTP200 health. Database5434 remains running. No reset/reseed or bulk send.

Practical limits: this completes the approved existing-store scope, not every possible ecommerce feature. New welcome-template Inbox rendering was not separately verified; captured mail and preview were checked, while Gmail delivery was verified previously for recovery. Newsletter sending remains in-process with saved status/admin retry, rather than a durable worker queue. Cash repayment is a manual external operation and is not falsely marked refunded by the UI. Payment/carrier credentials and public deployment remain external setup. Local email links require access to the running local website.

## 2026-10-08 — Expanded customer/admin workflow audit

Inventoried **12 customer routes and 17 admin routes** and audited their existing store workflows, permissions, loading/error states, forms, filters and responsive layouts. Detailed coverage and remaining operational boundaries: `docs/customer-admin-workflow-audit.md`.

Fixed seven demonstrated issues: inventory writes/retries discarding unrelated drafts, false save success after failed refresh, submitted inventory fields remaining editable during writes, clearing profile phone not persisting, concurrent address mutations creating multiple defaults, missing inactive-variant Reactivate action, and two admin session providers competing to rotate one refresh cookie. Added regression tests and resolved independent review findings about retry and variant draft preservation. Address mutations now lock their owning user inside the transaction before reading/changing default flags.

Fresh final verification:

- **223 backend tests in 30 suites passed**; backend build, frontend typecheck and production build passed (62 static pages). Local asset check passed with 196 product JPGs.
- **219 browser tests passed, one intentionally skipped** in the combined production run. The skipped scenario requires deliberately stopping the API; it was not executed against the running preview. Coverage includes 67 public routes with 9 active product pages, protected pages, admin operations, inventory regressions, order/cart/checkout controls, product fullscreen/zoom, loading and recovery/newsletter/offer screens at 390/768/1440px.
- **9 additional real-service registration tests passed**, bringing the successful browser total to **228**. Verified explicit registration, guest cart/wishlist merge, reload/session restoration, logout/login, duplicate-email rejection, existing-account login and ADMIN role injection rejection. The first full registration run exhausted its 60-second overall test budget during its second logout; assigned the multi-navigation test a 120-second budget without bypassing click checks. The complete rerun passed in 10.3 seconds. Temporary accounts and private credential file were deleted.
- `scripts/verify-account-admin.cjs` passed against actual local API/DB and production browser: profile/address persistence and ownership, real catalog/image/taxonomy changes, variant reactivation, inventory persistence, discount search, suspension/session invalidation, logout-all and authenticated navigation across **21 protected routes at all three widths**. Synthetic records cleaned afterwards.
- `scripts/verify-address-concurrency.cjs` passed real parallel address create/default-update/update-delete cases. Read-only consistency checks found no accounts with duplicate shipping/billing defaults and no remaining audit test users.
- Existing database and customer records preserved; no reset/reseed, bulk mail or new outbound email. Stopped only the separate QA development server on3101; production preview3100 and API4000 remain running.

This verifies the implemented store workflows, not every possible future feature or external service. Live payment/carrier setup, public hosting, manual cash repayment and durable email workers remain operational work. Newsletter email templates/transport captures were tested; their new Inbox rendering was not separately reverified in this audit.

## 2026-10-09 — SEO and generative search readiness

Implemented the approved SEO/GEO scope: shared page metadata, successful canonical destinations for information/legacy pages, one brand suffix, specific descriptions and OG/Twitter cards. Products use real product imagery and active backend variant SKUs/prices/availability in escaped JSON-LD, with breadcrumbs; no invented reviews, GTINs or merchant policy guarantees. Organization replaces an unsupported physical ClothingStore claim. Live product fetches are request-deduplicated; stale fallback product pages declare noindex and omit unverified offers.

Sitemap now generates dynamically, covers all active product pages through pagination, deduplicates canonical paths, supports actual new backend collections and excludes private/forms/demo content. Legacy catalog-wide campaign aliases canonicalize to Shop All unless backed by a real collection. Account and other private workflows carry noindex HTML/HTTP directives; robots allows page crawlers to observe those directives while `/api/` stays disallowed. Authentication remains the data-access control.

Admin product editing now exposes SEO title/description using existing backend limits and PATCH endpoints. Empty fields restore automatic product metadata; image saves retain unsaved SEO drafts. Accessible description labelling was fixed after the production test detected an exact-label lookup failure. SEO fields use the shared admin grid and design.

Verification and review:

- Four initial browser SEO regressions failed on the old preview for wrong canonicals, duplicate sitemap URLs, generic product image/offer data and missing noindex headers. All seven final SEO checks passed, including script escaping/invalid image URL handling, three-page catalog pagination/API failure and noindex not-found boundaries.
- Independent review identified malformed merchant URLs crashing metadata and inherited alias keys producing runtime errors; both fixed with focused checks. Re-review found no remaining important defects. Next root loading may stream HTTP200 before asynchronous notFound; the normal noindex not-found UI is verified, not a universal HTTP404 guarantee. A trial global metadata-blocking setting did not solve that streaming behavior and was removed.
- **91 production browser tests passed**: 7 SEO, 12 admin operations, 5 product detail, 63 protected-page and 4 public-page tests. Public inventory verified67 routes including9 live products at390/768/1440px. No runtime failures or horizontal overflow in audited layouts. A final shared-grid styling adjustment is verified separately below.
- `node scripts/verify-product-seo.cjs` passed using the actual API, DB and production browser: saved/cleared SEO overrides, variant price129 versus base100, stock state, newly created collection/canonical/sitemap, and archived-product sitemap exclusion. Temporary user/product/variant/image/collection/audit records cleaned. No outbound email. The first integration attempt expected HTTP200 for archive; the controller intentionally returns201. Test expectation corrected and the complete rerun passed.
- Production build and TypeScript passed (61 generated static pages; sitemap now dynamic). Local project/asset check passed:20 products,9 active,196 JPGs. Its initial static route-source check was updated to read the new shared collection route registry, rather than expecting alias strings in the page module.
- Local services were stopped when work resumed; remounted the existing read-only PostgreSQL runtime and started the preserved DB/API without reset, reseed or migrations. Production preview3100 is updated; only the temporary QA development server3101 was stopped.

Public search/AI visibility remains unverified while the site is localhost. Set the real HTTPS origin before the production build, publish it, verify Search Console and validate deployed rich results. No domain, Google account verification or ranking claim was fabricated. Details and launch requirements: `docs/seo-geo.md`.

Final deployment check after the shared-grid field styling: production build passed again; **19 targeted production tests passed** (all7 SEO + all12 admin operations), with explicit SEO field visibility/containment at390/768/1440px. Frontend/API health returned200/200; sitemap has31 URLs and31 unique canonicals; read-only DB checks found0 remaining synthetic SEO users/products/collections. The first preview restart was delayed by an automatic permission-review timeout; the single permitted retry succeeded. No operation remains blocked.

## 2026-10-09 — Checkout/profile sign out and marketing preferences

Verified both pictured Sign out controls. Fixed logout failures incorrectly clearing local authentication despite the backend session remaining active, checkout email clearing on failed logout, and competing profile/account-guard redirects. Failed requests now show an error and preserve the signed-in state for retry; successful checkout logout clears the email, and the account guard redirects protected pages to login. Confirmed password-change and logout-all revocation now clear authentication directly without a redundant logout request that could misreport successful revocation as failure.

Replaced the stale profile marketing demo placeholder with a customer-styled explanation and Manage email preferences link to the existing Rewards & newsletter controls. Consent remains explicitly chosen by the customer; no automatic subscription or email sent.

Verification: initial regression tests reproduced logout and password-revocation failures before their respective fixes. All **40 targeted production browser tests passed**, covering logout success/failure and responsive layout at390/768/1440px, marketing navigation, security revocation, account/admin regressions, cart, rewards and order screens. TypeScript and production build passed (61 generated static pages); independent follow-up review found no substantive regressions. `scripts/verify-signout.cjs` passed with actual local API/DB/browser: both buttons returned204, removed refresh cookies, rejected old refresh tokens and protected navigation, and checkout email cleared. Temporary customer/cart cleaned; no outbound email. Updated production preview3100 remains running; temporary dev3101 stopped.

## 2026-10-09 — Contact support conversations

Replaced Contact mailto preparation with persisted support tickets. Added customer Support list/details, secure guest conversation/recovery and admin inbox with search/status/unread filters, replies, status changes and failed-email retry. Shared Inter typography and customer/admin components fit390/768/1440px. Private routes and APIs use no-store/noindex/no-referrer. Branded email notifications point back to the conversation; direct email replies are not imported.

Independent reviews addressed guest creation replay extending access, blocked storage losing immediate access, expiry losing drafts, private header precedence, admin login ignoring requested Support path, and lost-response reload causing duplicate replies. Focused RED/GREEN tests cover each relevant frontend regression, including maximum escaped5000-character replies. Final narrow review approved.

Verification: backend286 tests/37suites passed; Prisma validation/generation and backend build passed. Frontend production build/type checking passed (63 static pages). Broader126 production browser checks passed across support/info, account/admin, SEO, protected screens, orders, cart and offer UI; after final submission persistence fix, all18 targeted production Support/info tests passed. Real local API/DB/browser verification passed: guest/customer submissions, admin reply/status, guest continuation/reopen, ownership isolation, expiry, idempotency/conflict, captured branded email link exchange and failed-delivery retry. No outbound test email. Screenshots reviewed for guest mobile/admin desktop, with overflow checks at390/768/1440px.

Only the additive support migration was deployed to the guarded existing local database, without reset/reseed. Synthetic users/tickets cleaned (counts0/0). Restored normal enabled mail worker and confirmed frontend/API200/200; production3100 and API4000 remain running, temporary dev3101 stopped. Operational details: docs/support-workflow.md. External recipient inbox delivery and public links require a deployed reachable origin; captured-mail tests do not assert real inbox delivery.

## 2026-10-09 — Start a return layout and flow

Fixed the unstyled Previous requests list: readable separated cards with order/status/items/reason/date/refund and links to account return details. Styled the Notes textarea and customer confirmation, with a saved request reference and guest Contact guidance. Successful submission replaces the form to prevent immediate repeat submission; failed requests preserve selections and notes. Auth initialization uses the shared loading state; double-submit guards and account-generation checks discard stale order/submission/history completions after session replacement. Mobile/tablet informational text now spans the full grid instead of an82px column.

Validation: focused RED tests reproduced unstyled history, missing reference/remaining form after save, late account order response and narrow mobile text; fixes passed. TypeScript and final production build passed (63 static pages). Return/backend validation, promotion return and mock refund suites passed19 tests/3suites. Final production browser checks cover8 return tests,3 information layout tests,15 support regressions, plus3 return error/account-detail checks. Independent scoped review approved after account-generation guards and corrected race-response waits. Screenshots reviewed at390px and layout measured at390/768/1440px.

Actual guarded API/DB/browser verifier scripts/verify-returns.cjs passed customer/guest submission, admin approval/transit/receipt/mock refund/closure, customer tracking, ownership/wrong-email/quantity/repeated-refund guards. Uses newly generated synthetic orders and MOCK captured payments only: no inventory or real customer orders altered, no actual refund gateway or outbound email. Script status assertions corrected for title-case labels; repeated synthetic attempts hit the existing rate limiter, resolved by restarting the owned local API without weakening limits. Synthetic fixtures cleaned and independently checked0users/0orders. Frontend/API health200/200, preview3100 remains active; temporary dev3101 stopped.

## Homepage films — 2026-10-09

- Preserved both original 1280 × 720 MP4 files and their quality. Removed the old hero poster asset and references.
- Added a shared film player with a 600 ms overlap crossfade, explicit play/pause controls, reduced-motion handling, offscreen/background pausing, lazy loading for the About film, and a readable loading-error/retry state.
- About playback loops at 8.6 seconds to avoid the red outro. Mobile hero height is constrained to keep the baked-in logo from becoming oversized. Original baked-in branding/content remains unchanged.
- Fixed media errors occurring before hydration by checking native video error state as well as React error events.
- Verification: production build/type checking passed; all 13 selected production browser checks passed (10 film checks and 3 navigation/layout checks). Independent code review reported no blocking findings.
- Inspected rendered production screenshots at 390, 768, and 1440 px. No horizontal overflow or page runtime errors. Screenshots: /tmp/altura-film-hero-{390,768,1440}.png and /tmp/altura-film-about-{390,768,1440}.png.
- Restored preserved local database/API without resetting data. Production remains on port 3100; the temporary development server on port 3101 was stopped after verification.

### Homepage film follow-up — user requested controls removed and red outro retained

- Removed both playback buttons and their styles; retained automatic playback, reduced-motion still frames, viewport/background pausing, and error fallback.
- Removed the 8.6-second About cutoff so it uses the full original duration, including the red ending, with the existing loop crossfade.
- Updated tests to match the approved behavior. Confirmed the previous version failed the no-controls/full-outro assertions, then the updated production version passed all 9 homepage film tests. Production build and type checks passed.
- Visually checked the red outro frame at 9.8 seconds on mobile: /tmp/altura-about-red-ending.png. Original encoded media remains unchanged. Production preview updated on port 3100.

## Full-stack audit — 2026-10-09

### Result and scope

No new application defect was reproduced in the audited flows. Verified the existing production implementation and added repeatable QA tools rather than changing working application behavior. The frontend and backend production builds/type checks, Prisma validation, and asset inventory passed (196 product JPG assets).

- Backend: all 37 Jest suites / 286 tests passed. HTTP tests initially hit sandbox port restrictions; rerunning with local-network permission passed. Launcher ownership/occupied-port test also passed.
- Browser: 300 distinct checks passed across the selected 304-check inventory. The initial broad run had 298 passes, 4 intentional skips, and 2 registration checks blocked by missing private database configuration; the 2 registration checks passed after supplying the selected local QA profile. The 4 skips concern a deliberate real-backend-outage case and legacy private-credential cases. Real synthetic customer/admin login and revocation were independently exercised instead.
- Route/design inventory: 67 public routes, including 9 live product pages, checked at 390, 768, and 1440 px. Protected fixture-backed audit passed all 63 checks (fonts, containment, editing focus, filters and pagination). Real synthetic accounts additionally navigated 21 customer/admin routes at all three widths.
- Captured 78 public/protected screenshots in `qa/full-stack/`; visually inspected representative product, contact, account profile, checkout, collection, dashboard and order screens. Captures wait for page content to finish loading; protected fixtures now match the actual commerce-readiness response shape. No root horizontal overflow or page runtime errors were found in those checks. Wide admin tables scroll inside their containers.

### Actual API/database/browser integration

The final `scripts/run-full-stack-live-qa.cjs` run completed successfully, restored normal API rate limits and mail-worker configuration, and covered:

- Registration/guest cart and wishlist merge, reload, duplicate email, and injected ADMIN-role rejection.
- Customer/admin sign-in; profile phone clearing; address create/edit/default/delete and concurrent default updates; product/taxonomy/variant/image/inventory/discount changes; suspension and session revocation.
- Both actual Sign out buttons; password reset single-use/concurrent consumption, revoked access/refresh tokens and old/new password login.
- Customer and guest returns, admin transitions, mock refund and closure, quantity/ownership restrictions, and responsive return history.
- Guest/customer Contact submissions, admin inbox/reply/status, guest secure continuation/reopening/expiry, ownership and idempotency, captured durable notification retry.
- All five configurable newsletter offer modes: percentage, fixed amount, free shipping, buy-X-get-Y, and no reward; email text/template snapshots, one-use coupons, existing reward immutability, actual quotes, COD gift order/stock, fulfillment and bundle-return accounting.
- Admin draft/publish/unpublish changes and updated product name/price/stock reaching fresh public API and rendered product reads without clearing cache. Existing open pages receive changes when they fetch again or reload; this is not a site-wide push-update claim.
- Actual guest browser cart -> address/quote -> mock card payment -> confirmation -> tracking, with inventory reduction verified in PostgreSQL.

All new temporary products/orders were removed. No current-run synthetic accounts remain. Two pre-existing registration fixtures dated October 7 were left untouched. Normal local application data was preserved; no reset, seed, or migration was applied.

### Database verification

Read-only audit: all 7 applied migrations match the 7 checked-in SQL checksums; Prisma database/schema diff reported no differences. Zero violations for inventory/reservation bounds, cart/order/return quantities, order totals and subtotal/item agreement, refund bounds, invalid indexes or unvalidated constraints. Both storefront readiness and backend health returned HTTP 200, with commerce ready and database connected.

### Reusable tools and limits

- `scripts/verify-database-integrity.cjs`: selected-local-database guard, read-only migration and accounting/inventory checks.
- `scripts/verify-catalog-sync.cjs`: synthetic admin-to-public synchronization and full guest mock-checkout flow, with bounded cleanup.
- `scripts/run-full-stack-live-qa.cjs`: consolidated local integration runner; temporarily captures support mail and raises QA attempt limits, then restores the normal API in `finally`. Run only on the intended local QA database when no other admin is editing offer settings.
- `scripts/capture-full-stack-public-qa.cjs` and `ALTURA_AUDIT_SCREENSHOTS=1` for the protected audit: reproducible visual evidence.

Browser/device coverage is Chromium at the stated viewport widths, not every physical phone/browser. Payment completion/refunds use the existing mock mode; outbound mail is captured during these integration checks, not externally delivered. These results establish the tested coverage and are not a guarantee against every possible future defect or production-service failure.

## Local demo login — October 9, 2026

- Added Customer demo / Admin demo to the existing login design, using existing shared local accounts and server-only credentials. No credential autofill or client password payload. Demo availability exposes only enabled roles; production backend, real payment mode, non-target database and unconfigured identities disable the feature.
- Ordinary authenticated sessions and HttpOnly refresh cookies are used. Customer requests for admin destinations fall back to the account area; Admin entry opens Studio or the requested admin page. Buttons prevent duplicate submissions and preserve normal form input after failure.
- Reproduced and fixed a pending session-restoration race by completing an existing refresh before creating a new login/registration session. Demo button surfaces now follow theme tokens. Independent final review found no further actionable issue.
- Final verification: frontend/backend builds and type checks passed; 38 backend suites / 300 tests passed. All 12 demo browser checks passed, including actual Customer/Admin login, refresh-cookie privacy, reload persistence and logout. Another 24 account/admin/theme/responsive checks passed (18 account/admin/theme + 6 login/register layout checks). Live registration was not repeated for this addition; its earlier full-stack coverage remains recorded above.
- Three captures in `qa/demo-login/` at 390, 768 and 1440 px; mobile and desktop inspected. Client bundle scan found neither configured demo password.
- A repeated live demo run reached the API refresh attempt limit; rerunning after a guarded local API restart passed. Default limits and database contents were preserved. This entry is restricted to the local shared demo; it is not a production public-admin login.

### Hosted demo login support

User requested the same demo buttons after deployment. Added explicit `DEMO_LOGIN_MODE=hosted`, allowing production backend login on a dedicated PostgreSQL database named `altura_demo`, with explicit enablement and mock payment configuration. Local mode remains the default. Added six regression cases, including production hosted login and rejected real-store/invalid/disabled profiles. All 38 backend suites / 306 tests passed; backend build and typecheck passed. Deployment requirements and existing production mock-payment limits are documented in `backend/docs/HOSTED_DEMO.md`. No hosted service has been deployed or connected in this task; actual HTTPS deployment remains untested until hosting is configured.

## Shared dropdown design — October 9, 2026

- Reproduced the Support status selector using the browser default arrow (`appearance:auto`) with insufficient right spacing. Unified single-value selects across storefront/customer/admin CSS: inset arrows, focus rings, project font/colors, and styled native pickers behind `@supports (appearance: base-select)`. Multiple/size listboxes are excluded. Unsupported engines retain functional native picker behavior and an inset SVG arrow. No custom JavaScript selection implementation or new dependency was added.
- Checkout/address fields retain their existing correctly positioned SVG arrows, with the additional picker icon suppressed. Localization controls reserve the measured text width plus 28px to prevent compact labels clipping. Menu rows are at least 44px; long menus scroll within a bounded height, with readable theme colors.
- Address-modal tests reproduced Escape closing the whole dialog while its picker was open. The modal now leaves Escape to an open select; a subsequent Escape closes the dialog and restores focus to its trigger.
- Final fresh verification: frontend build and TypeScript check passed. All 94 selected browser checks passed: 11 dropdown-specific checks, 63 protected route/interaction checks, 5 general functional checks and 15 support workflow checks. Dropdown checks cover customer/admin Support at 390/768/1440px, mouse choice, keyboard/Escape, filter submission, dark palette, compact footer gutter and address modal country choice/single arrow/focus restoration.
- Final captures at `qa/select-design/support-{390,768,1440}.png`; representative mobile and desktop inspected. Independent code review identified the compact gutter risk, fixed and tested; final review found no further actionable issue.
- Coverage uses Chromium at these viewport sizes. Customized native-picker availability follows browser support; fallback pickers retain the device's default menu presentation. Reference: [MDN customizable select](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Customizable_select).

## Automatic cloud demo package — October 9, 2026

- Added root `compose.yaml` and separate frontend/backend Dockerfiles. Initial startup generates persistent private credentials, initializes a dedicated PostgreSQL demo database, applies migrations, seeds an entirely empty database and enables both demo roles. Restart verification preserved existing catalog edits and record counts. The existing local database was not reset or reseeded.
- The same-origin API proxy preserves HttpOnly authentication cookies and rejects foreign-origin mutations. The frontend receives only a derived visitor signing key; database/JWT/demo passwords remain in a separate private volume. Signed visitor identities prevent different demo browsers sharing one internal proxy rate-limit bucket. Clearing visitor cookies starts a new demo bucket; real-store edge abuse controls remain deployment-specific.
- Four bootstrap/visitor unit checks passed. The isolated PostgreSQL integration runner passed fresh provisioning, actual Customer/Admin login, rate-limit separation and restart persistence, and removed its temporary cluster/API. Compose YAML structure checks passed, including private API/database ports and separate frontend key storage.
- The fresh production frontend build passed with `/api/v1` browser calls. The existing Inter font is now packaged locally with its OFL license, removing Google-font download dependence during builds. Thirty-three of 34 selected browser checks initially passed; the remaining page inventory check expected anonymous refresh responses only at the old API origin. Updated that narrow test helper and reran all five general functional checks successfully. Final coverage includes the three proxy checks, twelve demo checks (actual roles, reload and logout), eleven dropdown checks, three theme checks and five general page/cart/checkout checks.
- Independent final review found no further actionable findings. Local preview and API remain available at ports 3100 and 4000.
- Docker Engine is unavailable in this development environment: actual Linux image builds, Compose execution and a public HTTPS cloud deployment are **not verified**. The package requires Docker Compose support, persistent volumes and HTTPS from the chosen host. Static hosting cannot run the complete backend/database. No outbound mail service is configured by this demo package, and existing production mock-payment/refund safeguards remain in force.

### Google Cloud Compute Engine deployment

- Added Cloud Shell deployment and Debian VM setup scripts, source-only packaging and a Caddy HTTPS Compose override. Deployment provisions a dedicated network/VM/static IP, transfers through IAP, automatically initializes the existing demo stack and checks valid public HTTPS plus storefront readiness and both demo roles. The frontend canonical origin is supplied at Docker build time. No cloud resources were created in this workspace.
- Persistent boot disk deletion is disabled; Compose volume names stay stable across source releases. Updating an unrelated VM with the same name is rejected. An owned stopped VM is started before updating. The source packager excludes environment files, private/generated content and symlinks; the actual 660-file upload archive was inspected for expected build inputs and excluded local files, then removed.
- Verification passed: Python packaging regression, shell syntax, TypeScript check, HTTPS YAML structure check, and all five combined Node bootstrap/command-plan tests. The command-plan test uses a fake `gcloud` executable and covers initial deployment, restricted public ports/IAP, refusal of unrelated VM updates and restarting/updating an owned VM. This is **offline command coverage**, not verification against Google Cloud APIs.
- Independent code review found no actionable issue. Full Docker Compose merge/runtime execution, real Compute provisioning and public certificate issuance remain unverified. The no-purchased-domain demo URL depends on sslip.io DNS and certificate-authority availability. Billing/IAM prerequisites, resource costs, retained-disk recovery and the absence of automatic backup/high availability are documented in `deploy/google-cloud/README.md`.

## Workspace cleanup — October 9, 2026

- Removed approximately 619.7 MiB: production build cache (retaining the runnable build), generated development build, QA screenshots/traces/logs, obsolete preview fixtures, the old PostgreSQL installer, expired scratch token, unreferenced legacy editorial/logo assets and an obsolete screenshot helper with a fixed temporary output path. Screenshot/log paths mentioned in historical QA entries above describe prior evidence; those generated artifacts were removed during this cleanup.
- Preserved dependencies, compiled production entry points, Windows PostgreSQL tools/restore backup, product images and source assets needed by image-generation scripts. All 1,543 local PostgreSQL data files had identical SHA-256 hashes before/after cleanup. Project servers/database remain stopped.
- Updated the inventory check to require the actual homepage video rather than its removed unused legacy still image. Project check passed, including all 196 catalog JPG assets; TypeScript and all four bootstrap checks passed.
- Docker and Google Cloud upload packaging exclude image-generation masters and other local/generated content. These originals remain available locally for the existing image-generation workflow. Source-packaging regression verifies that exclusion.
