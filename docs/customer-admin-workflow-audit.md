# Customer and admin workflow audit — 8 October 2026

Scope: the implemented ALTURA store workflows and the previously approved configurable-offer/admin/customer design. This audit checks accessible pages, existing controls, backend permissions, persistence, errors and responsive layout. It does not claim that every possible ecommerce feature or third-party integration exists.

## Page inventory

Customer routes (12):

- `/account`
- `/account/forgot-password`
- `/account/login`
- `/account/orders`
- `/account/orders/[orderNumber]`
- `/account/profile`
- `/account/register`
- `/account/reset-password`
- `/account/returns`
- `/account/returns/[id]`
- `/account/rewards`
- `/account/security`

Admin routes (17):

- `/admin`
- `/admin/audit`
- `/admin/categories`
- `/admin/collections`
- `/admin/customers`
- `/admin/customers/[userId]`
- `/admin/discounts`
- `/admin/inventory`
- `/admin/login`
- `/admin/newsletter`
- `/admin/orders`
- `/admin/orders/[orderNumber]`
- `/admin/payments`
- `/admin/products`
- `/admin/products/[productId]`
- `/admin/returns`
- `/admin/shipping`

`/admin/login` redirects to the unified `/account/login` entry. Dynamic order/return routes require owned records; admin catalog/customer records require ADMIN. Cart, checkout, wishlist, product details, order confirmation, tracking and return creation supplement account pages.

## Workflow coverage

| Workflow | Verification |
|---|---|
| Login, registration, redirects, guest cart/wishlist merge, duplicate email, forbidden role injection | Real registration browser suite; synthetic account/admin live script; auth/security backend suites |
| Profile and addresses | Real phone-clear persistence, create/edit/default/delete, existing foreign-customer denial; live concurrent create/default-update/update-delete test |
| Password recovery and sessions | Previous full real recovery integration plus recovery browser regression; current single admin refresh regression and real logout-all/session revocation |
| Orders, confirmation, tracking, return initiation/history/detail | Order-page controls and safe tracking URL tests; real configurable-offer quote/order/stock/return integration; owned return UI tests |
| Cart/checkout/product viewer | Stock/removal/error/loading checks, CARD/COD mocked completion and API contract assertions, real checkout engine tests; all active product viewer images and responsive zoom/focus controls |
| Personal rewards/newsletter | Own-account state, confirm/unsubscribe, dynamic copy and immutable reward rules; all five offer modes and real coupon usage/ownership |
| Dashboard and access control | Metrics/links/error/empty states; customer403 and suspension invalidates old access; real admin page inventory |
| Product/SKU/images/taxonomy | Real create/update/assign/deactivate/reactivate/image CRUD, inventory save; draft-preservation and validation/error/pending-save regressions |
| Inventory/discounts/shipping | Real quantity persistence and discount search; backend reserved-stock safety/promotion validation; shipping CRUD and overlap validation, browser forms/filters/pagination |
| Payments/returns/audit | Existing COD collection/refund and mock-payment backend tests; browser payment errors and safe sensitive-field display; bundle paid-value returns and audit ownership |
| Desktop/tablet/mobile | Production route inventories and interaction tests at390/768/1440; genuine logged-in navigation across21 protected routes at all3 widths |

## Defects corrected in this audit

1. Saving one inventory row reset drafts in other rows. Refresh now preserves unrelated drafts and the applied search.
2. Failed refresh after an inventory write showed success, and Retry discarded other drafts. Success waits for verified refreshed data; Retry keeps the mutation's refresh scope.
3. The submitted inventory row remained editable while its write was pending. Submitted fields are locked until the result is known.
4. Clearing profile phone omitted the field, leaving the previous number. Empty phone is sent explicitly and persisted as null.
5. Concurrent address mutations could create multiple defaults. Every create/update/delete transaction locks the owning user before reading/changing defaults and performs ownership checks inside that transaction.
6. Inactive variants lacked a Reactivate control. It uses existing protected PATCH active:true, preserving both product and same-variant metadata drafts; deactivate preserves metadata drafts too.
7. Admin mounted two independent session providers, both rotating the same one-use refresh cookie. Removed the unused customer provider from admin layout; the admin provider alone restores its session. Test failed with2 refresh requests before the fix and passed with1 afterwards.

Independent read-only review findings were resolved with regressions. Existing synthetic fixtures were updated for the new paginated discounts/category reads and shared loading accessible label. Initial real-test invocation without explicit DATABASE_URL failed its environment guard before mutation; the dedicated local runner supplies validated private settings and cleans temporary accounts/credentials. One product-viewer run coincided with an API restart and saw the expected degraded catalog; final browser verification runs with services left running.

## Boundaries

Real gateway/carrier connections, public deployment, cash repayment and a durable mail delivery worker require separate operational setup. The current admin reports cash refund due rather than falsely claiming money was paid. Local email links require access to the running local server. See QA_REPORT.md for final test results and EMAIL_SETUP.md for delivery configuration.
