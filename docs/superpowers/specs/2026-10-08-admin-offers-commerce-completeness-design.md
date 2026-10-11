# Configurable newsletter offers and commerce administration

Status: approved by the user and implemented; final verification recorded in QA_REPORT.md.

## User request

Let administrators configure newsletter incentives, including changing percentage, free shipping, and buy two/get one free. Subscription copy and welcome email must reflect the configured offer. Review admin and customer workflows and complete concrete missing functionality while retaining the existing ALTURA design and responsive behavior.

## Findings from the existing source

- Newsletter issuance, email template, customer form, confirmation page and admin subscriber register assume a fixed 10% percentage offer. Editing an individual Discount record does not configure future newsletter rewards or update copy.
- The existing discount engine and admin discount form support percentage, fixed amount and free shipping. Buy/get offers are missing. Checkout currently supplies subtotal/shipping/email to discount evaluation, without item-level eligibility information.
- Admin already has dashboard, order workflow/tracking/cancellation, COD collection, payment review, returns/refund workflow, customer access control, product/variant/image editing, inventory, discount rules, subscribers and audit views. Presence in source is not a claim of complete runtime verification.
- `/admin/shipping` explicitly exposes read-only rules. Shipping rule creation/editing/toggling has no corresponding admin mutation flow.
- Category and collection CRUD exists in the catalog API but there are no dedicated admin pages. Product categories/collections are displayed rather than editable in the current product editor. Image update exists in API, but primary/order/metadata editing is not fully exposed in that editor.
- Customer profile/address/password/order/track/return-request/wishlist flows exist. Authenticated return list/detail API exists, but the account has no return history/detail pages or personal newsletter reward/preference panel.
- Discount listing currently combines generic codes and individual newsletter codes in a single unpaginated register; this needs search/pagination and rule-type separation as subscribers grow.

## Recommended design

### One persisted, versioned newsletter offer configuration

Create an ADMIN-only settings editor within Newsletter, with a public read-only offer-description endpoint for storefront display. Persist settings in PostgreSQL; do not use process memory or public environment variables. Offer versioning preserves previously issued reward terms.

Supported kinds:

1. Percentage: administrator chooses 1–100%, optional minimum eligible subtotal and maximum discount.
2. Fixed amount: amount and currency, optional minimum subtotal, capped at eligible product subtotal.
3. Free shipping: remove the selected checkout shipping method's charge, retaining its availability/country/currency constraints; optional minimum product subtotal.
4. Buy X/get Y: configurable paid/gift quantities, with buy 2/get 1 as the initial preset. Optionally scope eligible products/categories; otherwise all products are eligible.
5. No incentive: keep confirmed newsletter subscriptions available without issuing a reward; display signup copy without promising a coupon.

Common settings: enabled state, validity days (initially 30), per-subscriber redemption limit (initially 1), campaign title and short welcome text. Structured terms are generated from authoritative server rules, rather than unrestricted HTML. Provide admin preview of signup copy, confirmation page and responsive email before Save. Record updates in the audit log with actor and changed fields; use version checks to prevent overwriting concurrent edits.

When saved, storefront subscription wording and newly sent emails use the new offer. Already sent emails cannot be edited in recipients' inboxes. Issued coupons retain their original version, discount, expiry and usage limits; repeat signup does not generate a second reward. An administrator can explicitly disable a particular coupon using the existing discount controls. Public responses remain generic and never expose subscriber existence/codes.

### Buy/get calculation proposal for approval

The customer adds all desired items to the cart. For buy 2/get 1, three eligible units activate one free unit. Within each completed group, the cheapest eligible unit is discounted; six eligible units can activate two free units. Permit an admin cap on gift units per order. A partial group gets no gift. Show the eligibility requirement, qualifying units, free units and actual savings in cart/checkout/order details. No automatic addition of an unspecified product or size.

Compute on the backend using item prices, quantities, product/category IDs and current availability, with decimal money and bounded quantities. Recompute inside the existing serializable order transaction; do not trust browser prices or gift counts. Use one code per order to preserve current no-stacking behavior.

Persist the offer version and per-item/per-unit discount allocation with the order. Gift stock is reserved/committed like purchased stock. Refunds and partial returns must follow the saved payable allocation and the bundle-return rule, never grant a refund for a zero-paid gift or calculate using a newer campaign. Existing legacy order amounts remain unchanged. Approved and implemented rule: qualifying discounted bundles must be returned together; refunds use saved paid value, never the original price of a free gift.

### Admin completion scope

- Implement offer settings, preview, audit and subscriber reward display for every supported offer type.
- Add shipping zone/method CRUD, active state, countries, price/currency, free-above and delivery estimate validation; archive/deactivate rules referenced by orders rather than destroying historical records.
- Add category and collection management pages, product assignment controls, image primary/order/metadata editing using existing catalog APIs where possible.
- Add searched/paginated general-discount register and separate subscriber codes, with buy/get configuration and eligibility controls.
- Review existing order, payment, return, customer, inventory and audit paths for broken controls, validation/race/stale-response issues and missing links; fix evidenced defects. Payment-provider credentials or carrier integrations are external dependencies, not features to pretend are live.

### Customer completion scope

- Dynamic newsletter terms and email/confirmation UI based on the issued offer version.
- Personal rewards and subscription preference panel for the signed-in account's own email; no access to another subscriber's codes. Confirmation still proves email ownership.
- Return history and detail pages exposing only the user's own records, with order links and refund/request status.
- Clear cart/checkout/order offer breakdown and buy/get eligibility guidance; keep responsive ALTURA customer styling.
- Review profile/address/security/login/registration/password recovery/wishlist/order tracking/checkout controls against existing APIs, fixing evidenced failures.

This defines completion for the existing store workflows. An unlimited promise that every possible ecommerce feature exists is not an actionable acceptance criterion. Separate capabilities such as marketplace sellers, loyalty tiers, gift cards, chat support, accounting integrations and bulk marketing campaign builders are not silently added.

## Alternatives considered

- Edit individual newsletter discount records: smaller change, but does not govern future issuance/copy and risks inconsistencies. Not recommended.
- Use one mutable global offer for all old/new coupons: updates copy simply, but changes previously promised benefits and historical refunds. Not recommended.
- Versioned settings with immutable issued terms: recommended; more persistence/checkout work but consistent copy, order calculation and customer promises.

## Verification and acceptance

- Unit and real local database tests for every offer type, currency/minimum/maximum/expiry/one-use/ownership, code duplicates and no stacking.
- Buy/get tests for 2/3/5/6 eligible units, mixed prices, repeated SKU quantities, excluded products, out-of-stock units, capped gifts, rounding and concurrent one-use checkout.
- Tests for offer setting validation, concurrent admin saves, persisted restart behavior, audit records, public-only settings access and customer data isolation.
- Regression checks of refund allocation, gift/bundle partial returns, cancellation/stock release, and legacy orders.
- Browser flows for admin settings changing storefront text and newly generated email preview, subscriber confirmations, rewards, shipping/category/collection editing and customer return history.
- Desktop/mobile/tablet verification, frontend/backend typechecks, full relevant tests, production builds and local health checks. Use synthetic records and captured mail by default; do not reset/reseed existing DB or send unsolicited bulk email.
- Report which flows were verified and external setup still required, rather than claim the whole project is free of all possible defects.

## Decisions presented to the user

Approve the versioned offer behavior and cheapest eligible gift-unit rule. Existing reward terms stay intact; updates govern new rewards/copy/emails. Approve the concrete admin/customer completion scope above. Then write the implementation plan and execute it against the preserved local database.
