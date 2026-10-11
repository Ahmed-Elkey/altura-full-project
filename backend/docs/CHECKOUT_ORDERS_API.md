# Checkout + Orders API — Phase 5

Base URL: `/api/v1`

Checkout endpoints use optional authentication. A valid JWT uses the customer's active cart; no JWT uses the persistent `altura_guest` session cookie.

## 1. Shipping methods

`POST /checkout/shipping-methods`

```json
{
  "countryCode": "CA"
}
```

The server reads the real cart subtotal and returns active shipping methods for the matching database shipping zone. Client-supplied prices are never accepted.

## 2. Checkout quote

`POST /checkout/quote`

```json
{
  "email": "customer@example.com",
  "shippingAddress": {
    "recipientName": "Customer Name",
    "line1": "1 Example Street",
    "city": "Toronto",
    "region": "ON",
    "postalCode": "M1M 1M1",
    "countryCode": "CA"
  },
  "shippingMethodId": "<database shipping method id>",
  "discountCode": "OPTIONAL"
}
```

For authenticated customers `email` may be omitted; the account email is used. Guest checkout requires an email.

The backend re-reads product status, variant status, SKU price, currency and available inventory from PostgreSQL and calculates:

- subtotal
- discount
- shipping
- tax
- grand total

`DEFAULT_TAX_RATE` is currently a server-side environment setting. It defaults to `0` until a real market-specific tax engine/rule set is configured.

## 3. Place order

`POST /checkout/place-order`

Required header:

`Idempotency-Key: <8-128 safe characters>`

Use one new key for one checkout submission and reuse the same key for retries caused by network/time-out uncertainty.

Body is the quote body plus optional:

```json
{
  "customerNote": "Leave at reception"
}
```

Order placement executes under a PostgreSQL serializable transaction. The transaction:

1. reloads the active cart
2. validates products and variants
3. recalculates prices and totals
4. validates shipping and discount rules
5. atomically reserves each exact SKU
6. creates immutable order-item snapshots
7. snapshots shipping/billing addresses
8. creates the pending shipment record
9. records discount usage when applicable
10. marks the source cart `CONVERTED`

If any SKU cannot be reserved, the entire transaction rolls back.

The order remains `PENDING` until Phase 6 payment processing confirms or rejects payment. Reserved stock has an expiry timestamp controlled by `CHECKOUT_RESERVATION_TTL` (default `30m`).

## 4. Authenticated order history

Requires JWT.

`GET /orders?page=1&limit=20`

`GET /orders/:orderNumber`

A customer can only read orders linked to their own user id.

## 5. Public order lookup / tracking foundation

`POST /orders/guest/lookup`

```json
{
  "orderNumber": "ALT-260915-ABC1234567",
  "email": "customer@example.com"
}
```

This works for guest or account orders when both the order number and order email match. Public endpoint rate limiting is scheduled for the security phase.

## 6. Release expired pending reservations

ADMIN only:

`POST /orders/maintenance/release-expired`

This safely cancels expired unpaid pending orders and returns their reserved SKU quantities to availability. It is intentionally explicit in Phase 5. A scheduled/background worker can call the same service automatically in a later phase.

## Development shipping seed

`npm run db:seed` ensures a local `ALTURA Default Market` for `DEFAULT_COUNTRY` with:

- Standard Shipping
- Express Shipping

Prices and free-shipping threshold come from `.env`.

## Security/integrity guarantees added in this phase

- client totals are ignored
- client inventory claims are ignored
- serializable order transaction
- conditional database-side SKU reservation
- idempotency-key protection against duplicate order creation
- request fingerprint prevents reusing the same idempotency key with different checkout data
- order item/address snapshots remain stable after later catalog/profile edits
- discount usage limits are checked on the server
- converted cart remains separate from future active carts
