# Newsletter reward implementation plan

> For agentic workers: use subagent-driven-development for isolated frontend and discount-validation tasks; the coordinator owns subscription/backend persistence and integration.

**Goal:** Branded welcome email, verified subscription and opt-out, private 10% one-use product reward valid 30 days, and admin visibility.

**Architecture:** Add subscription confirmation/delivery metadata and a unique optional link to the existing Discount model. Email confirmation activates the subscriber and their reward; unsubscribe disables future newsletter eligibility and safely requires a POST confirmation rather than changing state on an email scanner GET. Codes are random, bound to the subscriber email, limited once globally, and never renewed by repeated subscription. Existing serializable checkout consumes the discount usage and records its code on the order. Delivery is background, status visible to admins with retry for failed delivery only.

**Tech stack:** NestJS/Prisma/PostgreSQL, Nodemailer/Resend, Next.js/React, Jest/Playwright.

- [ ] Add additive schema/migration without reset/reseed and regenerate Prisma.
- [ ] Backend subscription, signed confirm/opt-out tokens, email template and delivery state/retry with tests.
- [ ] Checkout validation for subscriber coupon ownership/confirmation with tests.
- [ ] Customer welcome/confirm/unsubscribe UI and admin list/count/search/filter/pagination/delivery retry.
- [ ] Verify typechecks/builds, real checkout totals/one-use/incorrect email, opt-out/duplicates, live email receipt and admin permissions. Clean synthetic records.

API contract:
POST /newsletter/subscribe {email} -> {subscribed:true} (generic request-received response; confirmation email unlocks reward).
POST /newsletter/confirm {token} -> {confirmed:true, reward:{code,type:'PERCENTAGE',value:10,expiresAt:string}}.
POST /newsletter/unsubscribe {token} -> {unsubscribed:true}.
GET /admin/newsletter?page=1&limit=25&q=&status= -> {items:[{id,email,status,subscribedAt,confirmedAt,unsubscribedAt,welcomeStatus,welcomeSentAt,reward:{code,value,type,expiresAt,active,usageCount,orderNumbers:string[]}|null}],total,page,limit,counts:{total,pending,subscribed,unsubscribed,deliveryFailed}}.
POST /admin/newsletter/:id/retry -> {queued:true}. Only FAILED/PENDING eligible, no automatic rebroadcast after success.
Email links: /newsletter/confirm#token=... and /newsletter/unsubscribe#token=..., fragment avoids server/referrer leakage. Confirm form POST click explicit, no automatic GET state change.
Schema: newsletter rewardDiscountId String? unique relation, confirmedAt DateTime?, welcomeStatus String default PENDING, welcomeSentAt DateTime?, welcomeAttemptedAt DateTime?, tokenVersion Int default0; NewsletterStatus adds PENDING. Discount reverse newsletterSubscriber relation.
