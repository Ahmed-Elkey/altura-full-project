# ALTURA Cart + Wishlist API — Phase 4

Base URL: `/api/v1`

Cart and wishlist endpoints accept an access JWT when the visitor is signed in, but also work for guests.
Guest persistence uses an opaque `altura_guest` HttpOnly cookie. The raw cookie token is never written to PostgreSQL; only its SHA-256 hash is stored in `Cart.sessionId` / `Wishlist.sessionId`.

The browser must send requests with credentials enabled when the Next.js frontend is connected later.

## Guest/session behavior

- The first guest cart/wishlist request creates a 90-day `altura_guest` cookie.
- Guest cart and wishlist records use the same anonymous browser session.
- Signed-in requests use the customer's database cart/wishlist instead of the guest records.
- After successful login/register, the frontend should call `POST /commerce-session/merge` once with the access token. This merges the guest cart + wishlist into the customer account and clears the guest cookie.
- Cart merge never reserves inventory. It caps only the *additional* merged quantity to current sellable stock and the per-line limit.
- Actual inventory reservation remains a checkout responsibility.

## Cart

### `GET /cart`
Returns the current guest/customer cart, current product/variant data, totals, available stock, and validation issues.

Auth: optional.

### `POST /cart/items`
Body:

```json
{
  "variantId": "variant-id",
  "quantity": 1
}
```

Rules:

- product must be `ACTIVE`
- variant must be active
- quantity must be `1..20`
- requested line quantity cannot exceed currently available inventory
- cart does **not** reserve inventory

### `PATCH /cart/items/:itemId`

```json
{
  "quantity": 2
}
```

Revalidates current SKU inventory before updating.

### `DELETE /cart/items/:itemId`
Removes one line owned by the current cart.

### `DELETE /cart`
Clears all cart lines while keeping the persistent cart record.

### `POST /cart/validate`
Rechecks every cart line against current product/variant/stock state.

Possible issue codes:

- `PRODUCT_UNAVAILABLE`
- `VARIANT_UNAVAILABLE`
- `OUT_OF_STOCK`
- `QUANTITY_REDUCED`

A cart with issues must not be accepted by checkout later.

## Wishlist

### `GET /wishlist`
Returns the persistent guest/customer wishlist.

Auth: optional.

### `POST /wishlist/items`

```json
{
  "productId": "product-id"
}
```

Adding an existing product is idempotent.
Only active products can be newly added.

### `DELETE /wishlist/items/:productId`
Removes the product from the current wishlist.

## Guest-to-account merge

### `POST /commerce-session/merge`
Auth: **required** (`Bearer <access token>`).

Call this immediately after successful register/login while the `altura_guest` cookie still exists.

Behavior:

- gets/creates the customer's active cart
- merges unique guest SKU lines
- adds as much guest quantity as current stock safely permits
- never reduces an existing customer cart quantity merely because stock changed
- skips inactive/draft/out-of-stock guest lines
- merges active wishlist products without duplicates
- abandons the consumed guest cart
- deletes the consumed guest wishlist
- clears the browser guest cookie after success

The response reports merged, adjusted, and skipped line counts so the frontend can display a useful notice later.

## Important checkout boundary

A cart is a shopping intent, not a reservation. Stock may change while a product sits in a cart. Checkout must therefore validate and reserve every SKU again inside a transaction before creating a payable order.
