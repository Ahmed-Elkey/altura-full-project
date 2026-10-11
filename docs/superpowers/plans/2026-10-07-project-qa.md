# Full project design and interaction verification plan

> **For agentic workers:** Use executing-plans for the verification checklist; requesting-code-review for repaired components.

**Goal:** Audit and repair every implemented page family at desktop, tablet and mobile widths against the approved customer design.
**Architecture:** Keep route-specific content and API authorization. Normalize shared UI tokens/typography and fix concrete interaction defects. Use existing Jest and Playwright tests plus a route inventory and responsive browser sweep.
**Tech Stack:** Next 15, React 19, NestJS, Prisma, Playwright, Jest.
**Spec:** User's approved Inter/customer card design and request to verify all primary and nested routes.

## Global constraints
- Do not stop the development frontend for production builds: .next-dev and .next remain separate.
- Preserve existing database, user credentials and order records; no reset, seed or migration.
- Use synthetic browser fixtures for mutation coverage. Live catalog and health checks may read current records.
- Test 1440x900, 768x1024 and 390x900; compare typography, overflow, images, runtime errors and navigation.
- Record unverified provider integrations or unavailable credentials honestly.

## Tasks
- [x] Inventory static routes, aliases and representative dynamic records from live catalog.
- [x] Run existing frontend functionality, API/error, account, order, cart and admin suites; record failures before changes.
- [x] Run backend unit suites without altering the live database.
- [x] Sweep every route family at three viewport widths with authenticated fixtures where required.
- [x] Normalize remaining page/form/table typography and card styles to customer design, checking screenshots.
- [x] Reproduce and repair actual buttons, filters, navigation or layout failures, with targeted regression checks.
- [x] Verify repaired suites, TypeScript and production build while local server remains live.
- [x] Publish coverage, changes, outcomes and concrete limitations in QA report.
