# ALTURA Database Schema — Phase 4

The database is PostgreSQL and is accessed through Prisma. SQL remains the query language underneath Prisma.

## Main domains

### Identity
- `User`: customer/admin identity.
- `Address`: saved customer delivery/billing addresses.
- `RefreshToken`: hashed, rotating refresh-token sessions with optional IP/user-agent audit metadata.

Identity notes:

- `User.authVersion` invalidates all previously-issued access tokens after password changes or logout-all.
- Raw refresh tokens are never stored; the database keeps only an HMAC hash.

### Catalog
- `Product`: catalog-level information and merchandising copy.
- `ProductVariant`: actual sellable SKU, defined by color + size.
- `ProductImage`: product or variant image references.
- `Category` / `Collection`: browsing and merchandising groups.
- `ProductCategory` / `ProductCollection`: ordered many-to-many relationships.

### Inventory
- `Inventory`: current stock and reserved stock per variant.
- `InventoryMovement`: immutable stock audit trail.

Stock is intentionally stored at variant level. Example:

- Meridian / Black / S → quantity 8
- Meridian / Black / M → quantity 12
- Meridian / Black / L → quantity 0

`reservedQuantity` exists so checkout can later reserve stock without pretending it has already been sold.

### Cart and wishlist
- `Cart`: supports authenticated carts (`userId`) and guest carts (`sessionId`).
- `CartItem`: one variant per cart line.
- `Wishlist` / `WishlistItem`: supports both customer ownership (`userId`) and guest ownership (`sessionId`) until authentication merge.

### Orders
- `Order`: commercial transaction header and totals.
- `OrderItem`: immutable product/SKU/price snapshots.
- `OrderAddress`: shipping/billing snapshot; saved addresses are never relied on after purchase.

### Payments and fulfillment
- `Payment`: payment attempts and refund state.
- `PaymentWebhookEvent`: idempotency/audit store for Stripe/Paymob webhooks.
- `Shipment`: shipment/tracking state.

### Promotions / shipping / returns
- `Discount` and `DiscountUsage`: coupon rules and usage audit.
- `ShippingZone` / `ShippingMethod`: country-based delivery options.
- `ReturnRequest` / `ReturnItem`: return/refund workflow.

### Operations
- `NewsletterSubscriber`: newsletter state.
- `AuditLog`: admin audit trail.

## Important integrity decisions

1. **Order lines snapshot data.** Product names, prices, SKU, selected size/color and image URL are copied to `OrderItem`. Historical orders remain correct even if the product later changes.
2. **Inventory is per SKU, not per product.** The storefront can correctly sell out one size while other sizes remain available.
3. **Stock reservation is distinct from stock quantity.** This is required later to avoid overselling during concurrent checkout sessions.
4. **Webhook events are unique per provider/event ID.** Payment callbacks can be retried safely without charging/processing an order twice.
5. **Draft and archived products remain first-class states.** Admin can prepare products without exposing them publicly.
6. **Money uses PostgreSQL decimal columns.** Never store money in floating point.
7. **Addresses are snapshotted into orders.** A customer editing an address later cannot mutate an old invoice/order.

## Phase 3 catalog notes

The catalog uses three distinct levels intentionally:

1. **Product** — merchandising/content entity (`Meridian T-Shirt`).
2. **Colorway** — derived API grouping of variants with the same `colorName`; this preserves the current storefront card model without duplicating database entities.
3. **ProductVariant / SKU** — sellable unit (`Meridian T-Shirt / Bone / M`) with its own Inventory row.

Product images are tagged with `colorName`, allowing one four-image gallery to be shared by every size SKU of the same color. This avoids incorrectly attaching identical color imagery to one arbitrary size variant.

Inventory invariants enforced by the service layer:

- physical quantity cannot be negative
- physical quantity cannot be set below reserved quantity
- available quantity is physical minus reserved
- reservation and commit operations use conditional database updates to prevent overselling under concurrency


## Phase 4 cart/wishlist notes

- `Cart.userId` identifies authenticated customer carts.
- `Cart.sessionId` stores a SHA-256 hash of the guest browser token, never the raw cookie.
- `Wishlist.userId` is optional and unique for a customer wishlist.
- `Wishlist.sessionId` is optional and unique for guest persistence.
- guest cart/wishlist records carry expiry metadata.
- `CartItem` remains unique by `(cartId, variantId)`, preventing duplicate lines for the same SKU.
- `WishlistItem` remains unique by `(wishlistId, productId)`.
- carts intentionally do not reserve stock. Inventory is validated when a line changes and must be validated/reserved again at checkout.


## Phase 5 order reservation fields

`Order` now stores an idempotency key/fingerprint, source cart id, inventory reservation expiry, inventory commit timestamp, and reservation release timestamp. `OrderItem` and `OrderAddress` remain immutable commerce snapshots. Inventory is reserved at order placement and is not physically decremented until payment confirmation in the payment phase.

## Phase 6 payment fields

`Payment` now stores:

- its own idempotency key/fingerprint
- unique active-attempt key while the attempt can still be paid
- provider initialization lease timestamp for concurrent-request/crash recovery
- provider payment/intention identifier
- provider order identifier where applicable
- provider transaction identifier
- checkout/client secret used by the frontend payment experience
- paid/refunded timestamps
- refunded amount
- last verified webhook timestamp

`PaymentWebhookEvent` stores provider, external event id, event type, optional Payment/Order correlation, raw JSON payload, processing result/error, and processed timestamp.

`OrderStatus.PAYMENT_REVIEW` is an explicit operational safety state for money received when automatic fulfillment cannot be proven safe.

`Order.inventoryReleasedAt` records that reserved checkout stock has already been released, preventing double-release across expiry, cancellation and refund handling.
