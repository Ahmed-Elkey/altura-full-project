# ALTURA Payments API — Phase 6

Phase 6 turns the Phase 5 pending-order reservation into a payment-aware order lifecycle.

## Design principles

- The order total stored by ALTURA is the amount source of truth.
- The browser never decides the charged amount.
- A payment attempt has its own idempotency key.
- Only one active payment attempt per order may exist at a time.
- Remote provider initialization is protected by a short recoverable initialization lease.
- Provider callbacks are the source of truth for final payment state.
- Every provider callback is authenticated before it can mutate an order.
- Webhook events are stored with a provider/external-event unique key before processing.
- Inventory is committed only after a verified successful payment.
- Inventory commit and order confirmation happen in one serializable PostgreSQL transaction.
- Duplicate successful payments do not decrement inventory twice; the order is moved to `PAYMENT_REVIEW`.
- Amount/currency mismatches do not fulfill an order; the payment is recorded and the order is moved to `PAYMENT_REVIEW`.

## Configured provider

`PAYMENT_MODE` selects the local provider adapter:

- `mock`
- `stripe`
- `paymob`

The API intentionally does not let the browser choose an arbitrary provider that differs from server configuration.

## Initialize payment

`POST /api/v1/payments/initialize`

Header:

```text
Idempotency-Key: unique-payment-attempt-key
```

Authenticated order body:

```json
{
  "orderNumber": "ALT-260915-ABCDEF1234"
}
```

Guest order body:

```json
{
  "orderNumber": "ALT-260915-ABCDEF1234",
  "email": "customer@example.com"
}
```

The endpoint validates order ownership, order state, reservation expiry, amount and currency. A repeated idempotency key returns the same payment attempt instead of creating another provider payment. A unique active-attempt key plus a short provider-initialization lease also protects against concurrent requests using different idempotency keys.

If the order reservation has expired or already been released, even an old idempotency key cannot reopen checkout and expose a stale checkout secret.

Example shape:

```json
{
  "idempotentReplay": false,
  "payment": {
    "id": "...",
    "orderId": "...",
    "provider": "STRIPE",
    "status": "REQUIRES_ACTION",
    "amount": 144,
    "currency": "CAD"
  },
  "checkout": {
    "mode": "stripe_client_secret",
    "clientSecret": "...",
    "publicKey": "..."
  }
}
```

Provider-specific modes:

- Mock: `mock`
- Stripe: `stripe_client_secret`
- Paymob: `paymob_intention`

## Mock payment flow

Mock payment is for local development only and is rejected in production.

Initialize the payment, then:

`POST /api/v1/payments/mock/:paymentId/complete`

```json
{ "outcome": "paid" }
```

Allowed values:

- `paid`
- `failed`
- `cancelled`

A mock `paid` event uses the exact same settlement code path as a verified real-provider webhook.

## Stripe

Required when `PAYMENT_MODE=stripe`:

```env
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
```

Initialization creates a Stripe PaymentIntent on the server using the ALTURA grand total in the currency's smallest unit. The request includes a provider idempotency key derived from the ALTURA Payment row.

Webhook:

`POST /api/v1/payments/webhooks/stripe`

The endpoint requires the `Stripe-Signature` header and the exact raw request body. The signature uses the Stripe timestamped HMAC-SHA256 format and a 5-minute timestamp tolerance.

Handled lifecycle events include:

- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.canceled`
- `charge.refunded`

## Paymob

Phase 6 uses Paymob's current Intention API flow rather than the older auth-token/order/payment-key sequence.

Required when `PAYMENT_MODE=paymob`:

```env
PAYMOB_BASE_URL=https://accept.paymob.com
PAYMOB_SECRET_KEY=
PAYMOB_PUBLIC_KEY=
PAYMOB_HMAC_SECRET=
PAYMOB_PAYMENT_METHOD_IDS=123456
PAYMOB_NOTIFICATION_URL=https://your-public-host/api/v1/payments/webhooks/paymob
PAYMOB_REDIRECTION_URL=https://your-frontend/payment-result
```

Initialization calls:

`POST /v1/intention/`

ALTURA sends the server-calculated amount, currency, billing data, configured payment method IDs, a stable special reference, callback URL and redirect URL. Product-line details remain in ALTURA's signed order snapshot; the provider charge total always comes from `Order.grandTotal`.

Webhook:

`POST /api/v1/payments/webhooks/paymob?hmac=...`

The callback HMAC is recomputed with SHA-512 using the documented Paymob transaction callback field order. A callback with an invalid HMAC is rejected before database mutation.

Paymob's intention order ID is stored separately from its transaction ID so transaction callbacks can be correlated safely.

## Successful payment transaction

A verified success attempts the following in a serializable transaction:

1. Reload payment and order.
2. Validate provider currency and amount against the Payment row.
3. Detect a different already-paid attempt for the same order.
4. Atomically reduce physical `quantity` and `reservedQuantity` for every order SKU.
5. Add `PURCHASE` inventory movements.
6. Mark Payment `PAID`.
7. Mark Order `CONFIRMED`.
8. Set `inventoryCommittedAt`.
9. Clear `reservationExpiresAt`.
10. Mark the webhook event processed.

Any inventory commit failure rolls the transaction back. The payment is then recorded as paid but the order is placed in `PAYMENT_REVIEW`; this avoids pretending a paid-but-unfulfillable order is safely confirmed.

## Failed and cancelled payments

`FAILED` does not immediately destroy the order reservation. The customer may make another payment attempt while the Phase 5 reservation TTL remains active.

A definitive `CANCELLED` attempt releases inventory and cancels the order only when no other active payment attempt exists. Expired checkout reservations also mark local pending/action-required payment attempts cancelled and clear their active-attempt locks.

A stale cancellation event is not allowed to downgrade a payment that is already paid/refunded.

## Refund callbacks

Provider refund state updates Payment and Order state:

- `PARTIALLY_REFUNDED`
- `REFUNDED`

If a **full refund arrives before inventory commit**, ALTURA releases the checkout reservation and marks the order refunded. A partial pre-commit refund is routed to `PAYMENT_REVIEW`.

If inventory was already committed, a financial refund does **not** automatically restock physical merchandise. Physical returns/restocking belongs to the Returns workflow so refunded goods are not assumed to be sellable again.

`inventoryReleasedAt` makes the release operation idempotent across expiry, cancellation and refund paths.

## Webhook idempotency

`PaymentWebhookEvent` uses:

```text
(provider, externalEventId)
```

as a unique key. Re-delivery of the same provider event is safe and returns `already_processed` after the first successful processing.

## Payment review state

`OrderStatus.PAYMENT_REVIEW` is a safety state for cases that require administrator intervention, including:

- provider amount mismatch
- provider currency mismatch
- duplicate successful payments
- successful payment after an order has already been cancelled or moved out of pending state
- successful payment whose reserved inventory cannot be atomically committed

The system intentionally prefers a visible review state over silently losing money or overselling stock.
