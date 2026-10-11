# ALTURA Admin API — Phase 7

The Phase 7 admin API exposes operational commerce data to the custom ALTURA Studio interface. It is intentionally separate from customer-facing endpoints and is protected by JWT authentication plus role checks.

Base URL in local development:

`http://localhost:4000/api/v1/admin`

## Authorization

All routes in `AdminController` require:

- a valid access JWT;
- an account with the `ADMIN` role;
- an `ACTIVE` user status as enforced by the existing authentication layer.

Changing another user's role is more sensitive and requires `ADMIN` specifically.

The browser admin client keeps the access token only in memory. The long-lived refresh token remains in the backend-issued HttpOnly cookie and is sent with `credentials: include`.

## Dashboard

### `GET /admin/dashboard`

Returns an operations overview including:

- customer count;
- active product count;
- orders created today;
- orders currently in `PAYMENT_REVIEW`;
- 30-day gross, refunded, and net payment amounts;
- available/physical/reserved inventory totals;
- low-stock SKU count;
- order counts grouped by status;
- recent orders.

Revenue here is an operational payment summary, not accounting or tax reporting.

## Orders

### `GET /admin/orders`

Query parameters:

- `q` — order number, email, or phone search;
- `status` — optional `OrderStatus` filter;
- `page`;
- `limit`.

### `GET /admin/orders/:orderNumber`

Returns the complete operational order view, including order snapshots, customer summary, payments, shipments, return requests, internal note, and recent payment webhook events.

### `PATCH /admin/orders/:orderNumber/workflow`

Only safe physical-fulfilment transitions are accepted:

- `CONFIRMED -> PROCESSING`;
- `PROCESSING -> SHIPPED`;
- `SHIPPED -> DELIVERED`.

Additional safety rules:

- inventory must already be committed;
- `SHIPPED` requires shipment tracking;
- `DELIVERED` requires a delivered shipment record;
- payment, refund, cancellation, and other financial transitions are deliberately rejected by this generic endpoint.

Those financial states must be driven by their dedicated provider/payment/refund workflows rather than an arbitrary admin button.

### `PATCH /admin/orders/:orderNumber/note`

Updates the internal operations note and writes an audit log record.

## Customers

### `GET /admin/customers`

Supports text search plus role/status filters and pagination. Each row includes order count and lifetime-value summary from qualifying orders.

### `GET /admin/customers/:userId`

Returns profile details, saved addresses, recent orders, order count, and lifetime value.

### `PATCH /admin/customers/:userId/status`

Only `ADMIN` may update user status.

Safety behavior:

- an operator cannot suspend/disable their own active account;
- making an account non-active increments `authVersion` and revokes active refresh tokens;
- the mutation is recorded in `AuditLog`.

### `PATCH /admin/customers/:userId/role`

`ADMIN` only.

Safety behavior:

- an administrator cannot remove their own `ADMIN` role through this endpoint;
- role changes invalidate existing sessions by incrementing `authVersion` and revoking refresh tokens;
- the mutation is audited.

## Discounts

### `GET /admin/discounts`

Returns all discounts with normalized numeric monetary fields and usage counts.

### `POST /admin/discounts`

Creates a discount. Supported types:

- `PERCENTAGE`;
- `FIXED_AMOUNT`;
- `FREE_SHIPPING`.

Validation includes:

- percentage cannot exceed 100;
- free-shipping value must be zero;
- maximum discount cannot be negative;
- code uniqueness is enforced by PostgreSQL/Prisma.

### `PATCH /admin/discounts/:discountId`

Updates selected discount properties without recreating the record. Changes are audited.

## Payment Review

### `GET /admin/payments/review`

Returns:

- orders explicitly placed in `PAYMENT_REVIEW`;
- recent payment webhook events with processing errors.

This endpoint is deliberately evidence/read-only. Phase 7 does **not** provide a generic `Mark as Paid` override.

Examples of cases that belong in the queue:

- amount/currency mismatch;
- duplicate successful payments;
- payment success after reservation expiry;
- provider success when inventory can no longer be committed safely;
- ambiguous refund/payment state.

The intended operator action is to inspect provider evidence and use a dedicated reconciliation/refund workflow in a later phase rather than forcing a financial state manually.

## Audit

### `GET /admin/audit?limit=50`

Returns recent audit records together with the actor's basic identity/role. Limit is clamped to 1–100.

Phase 7 currently writes audit records for sensitive admin mutations such as order workflow/note changes, user status/role changes, and discount create/update operations.

## Product and inventory operations

The custom Admin UI reuses the existing Phase 3 catalog/inventory admin endpoints for product and SKU operations instead of duplicating those APIs under the Phase 7 controller.

This keeps one canonical write path for:

- products;
- variants/SKUs;
- product status;
- images;
- inventory quantity adjustments.

## Current boundary

Phase 7 is local-only. It does not deploy, publish, connect a production payment account, or make an external storefront change.
