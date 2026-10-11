# ALTURA Commerce Backend Architecture

## Stack

- Node.js + TypeScript
- NestJS
- Prisma ORM
- PostgreSQL
- Swagger/OpenAPI

## API base

`http://localhost:4000/api/v1`

Swagger:

`http://localhost:4000/api/v1/docs`

Health endpoint:

`GET /api/v1/health`

## Module boundaries

The backend is intentionally split by commerce domain rather than by CRUD table:

- `auth`
- `users`
- `catalog`
- `inventory`
- `carts`
- `wishlist`
- `commerce-session`
- `checkout`
- `orders`
- `payments`
- `discounts`
- `shipping`
- `returns`

Authentication is implemented in Phase 2 with access JWTs, rotating refresh sessions, guards, roles, and account-version invalidation. Phase 4 adds optional-auth commerce endpoints: no token means guest, while a supplied invalid token is rejected rather than silently downgraded.

## Rules for later phases

- Controllers own HTTP concerns only.
- Services own business rules and transaction boundaries.
- Prisma access should remain inside domain services/repositories rather than React/Next code.
- Any operation that changes order + inventory + payment state must be transaction-safe and idempotent where applicable.
- Client totals are never trusted. The backend recalculates price, discount, shipping and final totals.
- Never trust a frontend `inStock` boolean. Checkout validates the exact SKU inventory in PostgreSQL.


## Phase 4 browser commerce identity

Guest cart and wishlist use one opaque `altura_guest` HttpOnly cookie. The browser holds the raw high-entropy token; PostgreSQL stores only its SHA-256 digest as the anonymous `sessionId`. Authenticated requests resolve by `userId`.

After register/login, the frontend calls `POST /commerce-session/merge` while both the JWT and guest cookie are present. The merge is server-side and transactional.

Cart state does not reserve inventory. Checkout must perform a fresh validation and then atomically reserve the exact SKU quantities.


## Phase 5 checkout transaction

Checkout never trusts prices, totals, stock, discounts, or shipping costs sent by the browser. The backend reloads the active cart and commerce configuration from PostgreSQL.

`POST /checkout/place-order` runs at PostgreSQL `SERIALIZABLE` isolation. Exact SKU quantities are conditionally added to `Inventory.reservedQuantity`; if any line cannot reserve, the full transaction rolls back. Order items and addresses are snapshots, so later catalog/profile edits do not rewrite purchase history.

Each checkout submission requires an idempotency key and stores a request fingerprint. Safe retries return the existing order; using the same key for different checkout data is rejected.

Unpaid orders are `PENDING` and carry `reservationExpiresAt`. Expired reservations can be safely released by the ADMIN maintenance endpoint. `inventoryReleasedAt` records a completed release so expiry, cancellation and refund paths cannot release the same reservation twice.

## Phase 6 payment boundary

Payment attempts are separate rows from orders. An order can have more than one attempt over time, but `activeAttemptKey` allows only one active attempt for an order at once. A short `providerInitStartedAt` lease serializes remote-session creation. Only a verified provider success may convert reserved inventory into a physical sale.

`POST /payments/initialize` is idempotent and derives the provider amount from `Order.grandTotal`. The provider is selected by server configuration (`PAYMENT_MODE`), not by arbitrary browser input.

Stripe and Paymob callbacks are normalized to one internal payment event shape. Every external event is first stored in `PaymentWebhookEvent` under a provider/event unique key. This makes webhook redelivery safe.

A paid callback enters a serializable PostgreSQL transaction. All SKU reservations are committed, `PURCHASE` movements are written, Payment becomes `PAID`, and Order becomes `CONFIRMED`. Any amount/currency mismatch, duplicate successful charge, late paid callback, or inventory commit mismatch routes the order to `PAYMENT_REVIEW` instead of pretending fulfillment is safe.

Refund callbacks update commercial payment/order state but do not automatically restock merchandise. Restocking belongs to the returns inspection workflow.
