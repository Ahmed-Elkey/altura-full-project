# Full-stack verification plan — 2026-10-09

1. Inventory current routes and existing tests; use the preserved local 3100/4000/5434 stack. Do not reset/seed the database or use real customer accounts.
2. Run frontend asset/type/build checks, backend unit/type/build/schema checks, and browser route/interaction suites against production. Record failures before changing code.
3. Audit public and protected page layouts at 390, 768, and 1440 px. Cover navigation, filters, forms, galleries, carts, checkout quotes, customer/admin actions, support, returns, rewards, error states, and SEO.
4. Validate local database migration status and integrity with read-only queries. Exercise bounded synthetic API-to-database workflows using existing cleanup-aware scripts; capture mail without external delivery.
5. Investigate each reproducible failure at its source, add/update a meaningful regression assertion, and fix only confirmed issues. Rerun affected tests and relevant regressions.
6. Rebuild changed services, refresh the owned local preview, verify readiness, and document counts, failures/skips, synthetic versus live coverage, and remaining external-service limitations in QA_REPORT.md.
