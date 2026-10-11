# ALTURA Commerce API

NestJS commerce backend for the ALTURA storefront.

Current local portfolio behavior and safety boundaries: see [../LOCAL_PORTFOLIO.md](../LOCAL_PORTFOLIO.md) and the Phase 2G release report.

## Stack

- Node.js 22+ (verified on 24.14.0)
- TypeScript
- NestJS
- Prisma ORM
- PostgreSQL
- Swagger/OpenAPI

## Local requirements

- Node.js 22+
- npm
- PostgreSQL 17 on `127.0.0.1:5433/altura_dev`, with an existing migrated schema and bounded synthetic fixtures.

## Safe portfolio startup

```powershell
# Run from the frontend/project root, after configuring a private local profile:
npm run portfolio:check
npm run portfolio:prisma-status
npm run portfolio:build
npm run portfolio:start
```

This workflow keeps private `backend/.env` unchanged, uses EG/EGP and development-only mock payments, and starts both applications on loopback. It does not install packages, apply migrations or seed/reset a database. PostgreSQL startup and first-time provisioning are separate deliberate operations. See the local profile guide for environment precedence and missing prerequisites.

Legacy `SETUP_BACKEND.bat` and `START_BACKEND.bat` are retained. They can install, migrate or seed automatically; they are not the safe portfolio launcher.

Useful URLs:

- Health: `http://127.0.0.1:4000/api/v1/health`
- Swagger: `http://127.0.0.1:4000/api/v1/docs`
- Public catalog: `http://127.0.0.1:4000/api/v1/catalog/products`

## Implemented so far

### Phase 1

- NestJS foundation
- environment validation
- CORS / Helmet / global DTO validation
- Swagger
- Prisma + PostgreSQL schema
- health endpoint

### Phase 2

- Register/login/refresh/logout/logout-all
- JWT access tokens
- rotating hashed refresh tokens
- scrypt password hashing
- CUSTOMER / ADMIN authorization infrastructure
- profile
- password change/session invalidation
- address CRUD/default shipping/default billing

See `docs/AUTH_API.md`.

### Phase 3

- database-backed public catalog API
- category and collection API
- search/filter/sort/pagination
- colorway-aware public response model
- admin product CRUD/update flow
- SKU variants
- color-specific image metadata
- per-SKU inventory
- stock movement history
- low-stock detection
- concurrency-safe stock reservation primitives
- deterministic seed of the current ALTURA catalog

Seed snapshot:

- 20 products
- 9 ACTIVE products
- 11 DRAFT products
- 21 public colorways
- 192 size/color variants
- 196 product images

See `docs/CATALOG_API.md` and `docs/PHASE3_REPORT.md`.

### Phase 4

- persistent guest cart using an HttpOnly anonymous session cookie
- persistent authenticated customer cart
- stock-aware add/update/remove/clear/validate cart API
- cart validation issue reporting
- persistent guest + customer wishlist
- transactional guest cart/wishlist merge after authentication
- guest session token hashing before database storage
- optional JWT guard that never downgrades invalid supplied credentials to guest traffic

See `docs/CART_WISHLIST_API.md` and `docs/PHASE4_REPORT.md`.

### Phase 5

- guest + authenticated checkout quoting
- shipping-zone/method resolution from PostgreSQL
- percentage / fixed / free-shipping discount evaluation
- server-side subtotal/shipping/discount/tax/grand-total calculation
- serializable, all-or-nothing SKU reservation at order placement
- idempotent order creation with request fingerprints
- order item + address snapshots
- reservation expiry timestamps and safe release maintenance
- authenticated order history/detail
- order-number + email tracking lookup foundation
- local Standard/Express shipping seed

See `docs/CHECKOUT_ORDERS_API.md` and `docs/PHASE5_REPORT.md`.

### Phase 6

- idempotent payment attempts tied to pending orders
- single active payment attempt per order + recoverable provider-initialization lease
- local Mock payment provider for safe end-to-end development
- Stripe PaymentIntent initialization + raw-body signature verification
- Paymob Intention API initialization + SHA-512 transaction HMAC verification
- durable webhook event idempotency
- provider amount/currency verification
- atomic conversion of reserved stock into a paid sale
- duplicate-payment and paid-but-unfulfillable `PAYMENT_REVIEW` safety state
- failed/cancelled payment handling + reservation-release tracking
- partial/full refund state ingestion with safe pre-commit reservation release and no unsafe post-sale automatic restocking

See `docs/PAYMENTS_API.md` and `docs/PHASE6_REPORT.md`.

### Phase 7

- protected ADMIN operations API
- dashboard metrics and low-stock/payment-review visibility
- order ledger/detail with safe fulfilment-only status transitions
- customer operations with session revocation on status/role changes
- ADMIN-only role management
- discount operations
- payment-review evidence queue with no blind financial override
- audit-log visibility
- custom branded Next.js ALTURA Studio pages for dashboard, orders, products, inventory, customers, discounts, and payment review
- access JWT held in browser memory while refresh remains HttpOnly

See `docs/ADMIN_API.md` and `docs/PHASE7_REPORT.md`.

## First-time provisioning is separate

The safe launcher requires installed lockfile dependencies, a generated Prisma client, a deliberately migrated isolated database and bounded local fixtures. It does not create an admin account. Review the existing migration and complete seed write scope before provisioning a new database. Supply development credentials privately; do not copy over an existing `.env` or commit passwords.

Historical phase checks and BAT setup scripts remain available, but some perform writes, migrations or fixture replacement. They are not the portfolio startup workflow. Follow `../LOCAL_PORTFOLIO.md` for the current profile and run strategy.

## Important notes

- The customer storefront uses the commerce API for catalog, cart, wishlist and checkout. Static presentation assets and explicitly labelled catalog fallback previews remain.
- Product image records point at the existing Next.js `/public/products/...` URLs.
- Replace JWT secrets before any real deployment.
- Automatic background scheduling of reservation cleanup is still future work.
- Real Stripe/Paymob sandbox calls require your own provider credentials; `.env.example` contains no secrets.
- No deployment is performed by this project.
