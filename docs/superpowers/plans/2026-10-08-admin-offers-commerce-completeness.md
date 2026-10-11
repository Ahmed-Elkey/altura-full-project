# Admin offers and commerce completion implementation plan

> **For agentic workers:** Use subagent-driven-development for independent tasks, with integration and final review by the coordinator.

**Goal:** Configurable versioned newsletter incentives and completed existing admin/customer workflows.
**Architecture:** PostgreSQL singleton NewsletterOffer with versioned JSON configuration; Discount.offerSnapshot freezes issued terms. Checkout calculates BUY_X_GET_Y from actual item units and saves discount allocation for safe returns. Existing APIs are extended using current authentication/validation/audit patterns.
**Tech stack:** NestJS, Prisma/PostgreSQL, Next.js/React, Jest/Playwright.
**Spec:** docs/superpowers/specs/2026-10-08-admin-offers-commerce-completeness-design.md

## Global constraints

Preserve local DB and legacy orders; additive migrations only. No outbound bulk email or printed secrets. Honor issued coupon terms. Customer sees own data only, admin-only mutations. Mobile/tablet/desktop ALTURA design. No unrequested external services. This checkout accepts one code per order.

## Interfaces fixed for independent work

OfferConfig JSON: {enabled:boolean,type:'PERCENTAGE'|'FIXED_AMOUNT'|'FREE_SHIPPING'|'BUY_X_GET_Y'|'NONE',value:number,currency:string,validityDays:number,usageLimit:number,minimumSubtotal:number|null,maximumDiscount:number|null,buyQuantity:number,giftQuantity:number,maxGiftUnits:number|null,eligibleProductIds:string[],eligibleCategoryIds:string[],title:string,welcomeText:string}.
Default: enabled true/PERCENTAGE10/EGP/30days/usage1/no minima/maxima/buy2gift1/no cap/all eligible/title 'Welcome to ALTURA'/welcomeText 'Move higher, together.'.
Offer presentation: {version:number,config:OfferConfig,headline:string,description:string,terms:string,updatedAt:string|null}. Public GET /newsletter/offer and ADMIN GET /admin/newsletter/offer; ADMIN PATCH same endpoint body {version:number,config:OfferConfig}; version conflict409. ADMIN POST /admin/newsletter/offer/preview same config body -> {subject,html,text,headline,description,terms}. Read public exposes offer configuration only, no subscriber information.
Reward response (confirm/admin/customer): existing code/type/value/expiresAt plus offer:OfferConfig|null and description/terms. NONE gives reward:null.
Authenticated GET /newsletter/me -> {status:string|null,confirmedAt:string|null,reward:Reward|null}; POST /newsletter/me/subscribe starts existing subscribe flow for auth user's email; POST /newsletter/me/unsubscribe updates own record/revokes old tokens without needing a link.
Discount fields added: offerSnapshot Json?; BUY_X_GET_Y enum. OrderItem: promotionAllocation Json? (ordered per-unit {discount:number,bundle:string|null} entries). Discount evaluation input adds optional items array {variantId,productId,categoryIds:string[],quantity:number,unitPrice:Prisma.Decimal}. Evaluation returns optional allocations keyed variantId. Gift bundles returned together, no refunds for free units alone.

## Task 1: Offer issuance and configuration (coordinator)
Files: prisma/schema.prisma,new additive migration, newsletter/offer-config.ts, newsletter-offer.service.ts, DTO config, newsletter controller/service/email,module; admin controller integration.
- [x] Write validation/presentation/version/issuance tests; observe expected RED.
- [x] Implement persisted default via upsert, guarded versioned admin saves/audit; bound numbers and recognized IDs; escaped structured email preview.
- [x] Issue immutable snapshots, dynamic welcome/confirm/list/me, NONE reward support, no repeated reward on changes.
- [x] Regenerate Prisma, deploy only additive migration to selected local DB, typecheck/tests/build.

## Task 2: Promotion and refund engine (isolated implementer)
Files: discounts.service.ts, checkout.service.ts, admin return refund calculation, discount DTOs, promotion tests.
- [x] Test quantities2/3/5/6,mixed prices,repeatedSKU,eligibility,caps,rounding,missingitems/invalidsnapshot.
- [x] Compute eligible sorted-unit groups, cheapest gifts per completed group; freeze unit allocations on order creation.
- [x] Reject partial discounted bundle returns before refund/repricing; retain legacy refund behavior and inventory workflows.
- [x] Support validated general buy/get discounts; run targeted tests/typecheck; deliver reviewer package.

## Task 3: Admin operational completeness (isolated implementer)
Files: new shipping admin controller/service/DTO/module registration, shipping page, category/collection pages, product assignment/image editing, nav and tests.
- [x] Add fail-first shipping validation/auth tests then CRUD/deactivate with audit and preserved historical records.
- [x] Add taxonomy management/assignment and existing image update capabilities; verify inputs/API failures and mobile controls.
- [x] Audit existing admin operational pages, fix concrete defects; test/build and deliver review package.

## Task 4: Offer and customer UI (isolated implementer)
Files: offer settings UI/adminnewsletter, dynamic NewsletterForm/LinkForm, personal rewards/preferences pages, return history/details/accountnav, discounts register UI and tests.
- [x] Test settings save/409/preview,type-specificfields and dynamic public text/confirmation.
- [x] Implement using exact interfaces above, preserve old coupon copy through offer snapshots, no raw dynamic HTML except deliberate isolated email preview.
- [x] Add authenticated rewards/preferences and return history/detail using existing APIs; paginated/searched discount register frontend with parent backend contract coordination.
- [x] Verify responsive layouts/ownership guards/stale results and deliver review package.

## Task 5: Integration and verification (coordinator)
- [x] Review task deliverables (requirements+quality), resolve findings, run full backend suites and frontend typecheck/build.
- [x] Synthetic local integration: every offer type/expiry/ownership, real quote/order totals and committed stock; stock release regression coverage, confirmation/duplicate/unsubscribe, admin changes/public copy, old snapshot stability, customer data isolation and return bundle rules; clean temporary data.
- [x] Browser test admin/customer workflows at390/768/1440; inspect screenshots; final independent review.
- [x] Run final production preview/API and health probes; update QA_REPORT with verified paths and external limitations.

Final evidence: QA_REPORT.md, 30 backend suites/223 tests, 108 production browser tests, both synthetic live integration scripts and HTTP200 health checks.
