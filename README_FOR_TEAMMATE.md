# ALTURA — private teammate development package

This archive contains the current ALTURA Next.js storefront, NestJS commerce API, Prisma schema and migration history, application tests, local media, and a privacy-sanitized logical clone of the current development database. It also contains a portable PostgreSQL 17.11 Windows runtime.

## Start here

Requirements:

- Windows x64.
- Node.js 22 or newer with npm. Node.js 24 is also supported by this tested copy.
- Microsoft Visual C++ 2015–2022 x64 Redistributable. Most Windows development machines already have it.
- Internet access during first setup so `npm ci` can install the exact locked dependencies.
- Ports 3100, 4000, and 5434 must be free.

From PowerShell in the extracted folder:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\SETUP_ALTURA.ps1
.\START_ALTURA.ps1
```

Open <http://127.0.0.1:3100>. Admin login is at <http://127.0.0.1:3100/admin/login>. The package-only customer and admin credentials are in `TEAMMATE_LOCAL_CREDENTIALS.md`.

Stop only the processes owned by this extracted copy:

```powershell
.\STOP_ALTURA.ps1
```

## What setup does

`SETUP_ALTURA.ps1` installs frontend and backend dependencies using both existing lockfiles, initializes a package-relative PostgreSQL cluster, binds it only to `127.0.0.1:5434` with SCRAM authentication, creates the dedicated non-superuser `altura_friend_app` role and `altura_friend` database, restores `database/altura_friend.backup`, generates Prisma Client, and builds the backend and frontend.

Setup is guarded to the exact package database target. It refuses inherited conflicting `DATABASE_URL` values, unexpected nonempty databases, changed backup bytes, unknown cluster paths, and occupied ports. Re-running setup preserves the restored database and rebuilds the applications. It does not reset or seed data.

`START_ALTURA.ps1` starts the existing database and builds. It never restores, migrates, seeds, or installs dependencies. `STOP_ALTURA.ps1` verifies recorded executable paths, arguments, and process creation times before stopping application processes. It verifies the package cluster path before stopping PostgreSQL. Port conflicts are reported; unrelated applications are never terminated.

## Local configuration

- Frontend: `http://127.0.0.1:3100`
- Backend: `http://127.0.0.1:4000/api/v1`
- PostgreSQL: `127.0.0.1:5434/altura_friend`
- Market: Egypt / EGP
- Payment provider: development-only Mock card flow plus implemented Cash on Delivery
- Storage: local assets
- Authentication: JWT access tokens plus HttpOnly refresh and guest cookies

The public `NEXT_PUBLIC_*` origins are embedded during setup's clean Next.js production build. The backend binds to loopback and CORS allows the canonical frontend origin.

The package has fresh local JWT, database, customer, and admin credentials. They do not come from the original developer's environment. Keep `TEAMMATE_LOCAL_CREDENTIALS.json`, `TEAMMATE_LOCAL_CREDENTIALS.md`, and `backend/.env.demo` private. They are intentionally ignored by Git and are suitable only for this local handoff.

## Database contents and privacy differences

The logical backup preserves the current products, variants, images, collections and categories, inventory, shipping methods, discounts and usage counts, order item price snapshots, order/payment/fulfillment states, returns, and admin audit actions.

Before packaging, customer names, emails, phones, saved addresses, order delivery identities, newsletter addresses, shipment tracking identifiers, freeform customer/internal notes, and return notes were replaced or cleared in the clone. Refresh tokens, cart/wishlist guest-session identifiers, payment checkout secrets, active payment attempt keys, failure details, and raw webhook payloads were cleared. Record identities and commerce relationships remain intact. Existing user roles remain, while only the documented package customer and admin passwords are known.

This package does not contain the developer's `.env` files, PostgreSQL password, local cluster, recovery helpers, reusable browser sessions, or external payment/email credentials.

## Development and verification

Useful checks after setup:

```powershell
npm run lint
Push-Location backend
npm run typecheck
npm test -- --runInBand
Pop-Location
```

With ALTURA running, run Playwright against the package with:

```powershell
$env:ALTURA_BASE_URL = 'http://127.0.0.1:3100'
npx playwright test tests/homepage-layout.spec.ts
```

Some historical integration tests reference developer-private credential files or original-database assumptions. They remain included as current source evidence, but use the package credentials and cloned database for new tests. Never configure real Stripe or Paymob keys in the local Mock profile.

## Source layout

- `app`, `components`, `lib`, `data`, `public`: storefront, account, checkout, admin, shared UI/state, fallback catalog, and runtime media.
- `backend/src`: NestJS auth, users, catalog, inventory, carts, wishlists, shipping, checkout, orders, payments/COD, returns, newsletter, and admin APIs.
- `backend/prisma`: complete Prisma schema, migration history, seed source, and catalog fixture source.
- `tests`: application and browser regression source.
- `database/altura_friend.backup`: logical PostgreSQL backup restored only by setup.
- `tools/postgresql`: portable PostgreSQL runtime and redistribution notices.
- `runtime`: generated cluster, logs, build/restore markers, and owned-process state after setup.

PostgreSQL license notices are in `tools/postgresql/server_license.txt` and `tools/postgresql/commandlinetools_3rd_party_licenses.txt`.
