# ALTURA Commerce — local portfolio demo

ALTURA is a local-only premium running/apparel commerce project. The approved storefront is built with Next.js, React, and TypeScript; the commerce backend now lives in `backend/` and uses NestJS, Prisma, and PostgreSQL. Phase 7 also adds the custom ALTURA Studio operations interface under `/admin`. Balmoral Running was used solely as a clean-room layout and interaction reference; ALTURA code, copy, branding, and production imagery are independent.

## Run locally

For frontend development on this Mac, with the API and existing PostgreSQL cluster already running, use `npm run local:start` and open `http://127.0.0.1:3100`. The frontend stays running after the invoking terminal closes. Repeating the command checks the existing ALTURA server instead of starting a duplicate. `npm run dev:local` runs the same frontend in the foreground. Development uses `.next-dev`; `npm run build` uses `.next`, so rebuilding does not overwrite assets being served by the development server. Frontend startup logs are in `.hero-build/dev.log`. These frontend commands do not start or alter the database or API.

Follow [LOCAL_PORTFOLIO.md](LOCAL_PORTFOLIO.md) for prerequisites and the private local database profile. Keep existing credentials private. Start the dedicated PostgreSQL cluster separately.

From a terminal:

```bash
npm run portfolio:check
npm run portfolio:prisma-status
npm run portfolio:build
npm run portfolio:start
```

Then open `http://127.0.0.1:3100`. The API binds to `127.0.0.1:4000` and the isolated database target is `127.0.0.1:5433/altura_dev`. These commands never install, migrate, seed or reset. Legacy BAT scripts are retained but may perform those operations; they are not the portfolio start workflow.

## Full local QA

With the local stack and synthetic test credentials configured, run sequentially:

```bash
npm run check:local
npm run portfolio:build
npm run qa:functional
npx --no-install playwright test tests/phase2b-market.spec.ts
npx --no-install playwright test tests/phase2e.spec.ts
npx --no-install playwright test tests/phase2f-cart-currency.spec.ts
npx --no-install playwright test tests/phase2g.spec.ts
npm run qa:visual
```

The Playwright commands use Chromium and the local production frontend build on port 3100. Set `ALTURA_BASE_URL=http://127.0.0.1:3100` to reuse the running stack. Database checks and private synthetic credentials are required for the integration suites. Tests consume local fixture stock; missing prerequisites are BLOCKED. The QA workflow never deploys or pushes anything. Visual diffs are informational, with no ratio acceptance threshold; unexpected browser errors and overflow fail the harness.

## Storefront

- Home, Shop All, category, PDP, info, checkout, API health/products, and custom 404 routes.
- Canonical `/collections/t-shirts`, retained `/collections/t-shirts-longsleeves` alias, and `/collections/fall-26`.
- Nine active products expanded into 21 visible colorway cards.
- 196 verified local product JPGs across 20 product definitions; 11 draft products remain excluded from the storefront.
- Full-screen menu and search, 482px desktop cart drawer, collection filters/sorting, image-swap cards, sticky PDP purchase panel, lightbox, recently viewed, recommendations, and mobile sticky add-to-cart. A measurement-based size guide is future scope.
- Backend-backed guest/customer cart with quantity controls, removal, inventory validation, HttpOnly guest-session persistence, and account-cart merge after sign-in.
- Commerce API checkout with server-calculated shipping methods, quote, discounts, idempotent order placement, and local Mock payment completion.

## Design and responsive behavior

Customer order details (`/account/orders/[orderNumber]`) and order confirmations (`/order-confirmation/[orderNumber]`) share the account Profile typography, cards, and navigation. Open a saved order from Account → Orders, then choose **View order confirmation**; checkout also opens confirmation automatically. Guest confirmations require the checkout email and expose only the public order summary. **Track this order** carries the order number and supplied email into the lookup form. Shipments with a valid carrier URL open that URL; local shipments without one expand their recorded status and shipment dates.

The unified token layer in `app/globals.css` defines the ALTURA palette, EB Garamond editorial type, Inter functional type, disciplined layout rhythm, responsive header heights, quiet hairline borders, square controls, and restrained UI motion. Home and collection headers overlay hero media before resolving to a solid off-white state on scroll. Layouts are explicitly tested at 390, 768, 1024, and 1440px.

Exact measured targets and intentional deviations are documented in:

- `REFERENCE_AUDIT.md`
- `DESIGN_AUDIT.md`
- `QA_REPORT.md`
- `ART_DIRECTION_REPORT.md`

## Visual artifacts

- `qa/reference/`: raw current Balmoral screenshots, ignored and local-only.
- `qa/current/`: raw ALTURA screenshots.
- `qa/diff/`: masked/image-neutral layout diffs, ignored and local-only.
- `reference/balmoral/`: a small private analysis archive of publicly delivered reference files, ignored and never imported into production.

The visual comparison evaluates geometry, gutters, spacing, card scale, type hierarchy, borders, drawer dimensions, and responsive rhythm. Different photography and branding do not cause failure.

## Local commerce backend and Studio

The `backend/` directory contains the Phase 1–7 NestJS commerce API: auth, database-backed catalog/inventory, cart/wishlist, checkout/orders, payment-provider architecture, and the protected admin operations API. The new `/admin` routes consume those local APIs while preserving the approved storefront chrome for customer routes. See `backend/README.md` and `backend/docs/PHASE7_REPORT.md`.

The storefront reads the backend catalog and uses database-backed carts, wishlists and checkout. Static presentation assets and explicit fallback previews remain. `/api/health` checks commerce readiness; `?probe=liveness` checks the frontend process alone.

## Boundaries

Egypt/EGP is the current local market. Historical CAD records are preserved and excluded from the EGP dashboard revenue. Local fulfillment records tracking and delivered status without contacting a carrier. Customer returns use the existing development-only mock refund workflow. Checkout supports local mock payments; Shop Pay, PayPal and gift cards are not implemented. Marketing preferences are explicitly unavailable. No real provider transactions or emails are sent. This is a local portfolio demo, not production certification; deployment, production queues, backups, least-privilege credentials and real provider integration remain separate work.

### Stable local preview and development

After `npm run build`, use `npm run local:preview` for the detached production preview at **http://127.0.0.1:3100**. This avoids on-demand development compilation while browsing. It refuses an unrelated occupied port and reuses a healthy running ALTURA server; it never silently stops another process. Logs and PID are stored under `.hero-build/production.*`.

Use `npm run local:start` for detached development with automatic updates, or `npm run dev:local` for foreground development. A healthy server already on 3100 is reused, so stop that known process before deliberately changing modes. Development uses `.next-dev`; production uses `.next`. Stop a running production preview before rebuilding its files, then relaunch it. A development server may stay up during a production build.

See [QA_REPORT.md](QA_REPORT.md) for the responsive route inventory, verified interaction coverage and external integration limits.

### One-click demo accounts

The login page offers **Customer demo** and **Admin demo** when the local API enables `DEMO_LOGIN_ENABLED=true`. These use the existing shared demo accounts through ordinary authentication and HttpOnly refresh cookies; passwords remain server-side. Customer entry opens the account area; Admin entry opens Studio or a requested admin route. Changes are shared with other demo visitors.

Local mode restricts this feature to the explicit `altura_friend` database on port 5434 and non-production backend mode. Hosted mode (`DEMO_LOGIN_MODE=hosted`) supports production builds on a dedicated database named `altura_demo`. Both modes require explicit activation, mock payment configuration and the two configured demo identities. It is disabled by default. See `backend/docs/HOSTED_DEMO.md` for deployment settings. Availability exposes roles only. Existing normal sign-in and registration remain available.

### Automatic cloud demo package

For Google Cloud, use the automated [Compute Engine deployment](deploy/google-cloud/README.md) from Cloud Shell. It provisions the VM, transfers only build inputs, adds HTTPS and verifies the storefront/demo readiness.

Use the root `compose.yaml` on a Docker Compose capable host with HTTPS and persistent volumes. The deployment automatically initializes the isolated database/catalog and both demo accounts, persists private credentials, and proxies API requests through the site's own URL. No post-start account creation or demo activation is required. See `deploy/README.md` for the deployment command, requirements and tested limits. Static hosting cannot run this full stack. Docker container execution has not been verified on this machine because Docker is unavailable.
