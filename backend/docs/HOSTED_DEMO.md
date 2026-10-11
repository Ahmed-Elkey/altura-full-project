# Hosted demo login

For automatic full-stack cloud setup, use the root `compose.yaml` and [cloud demo guide](../../deploy/README.md). It generates/persists private credentials, runs migrations and provisions a completely fresh dedicated demo database during startup. The following manual instructions apply only to separately managed frontend/API/database deployments.

The Customer demo and Admin demo login buttons can run on a hosted deployment with `NODE_ENV=production`. Configure the following **backend-only** variables in the hosting service:

```dotenv
DEMO_LOGIN_ENABLED=true
DEMO_LOGIN_MODE=hosted
PAYMENT_MODE=mock
ADMIN_SEED_EMAIL=admin@altura.friend.local
CUSTOMER_SEED_EMAIL=customer@altura.friend.local
```

Set `DATABASE_URL` to a separate PostgreSQL database whose database name is exactly `altura_demo`. Supply strong private `ADMIN_SEED_PASSWORD` and `CUSTOMER_SEED_PASSWORD` values matching those two accounts. These are never `NEXT_PUBLIC_` values. The service fails closed for other database names, real payment modes, disabled flags, mismatching roles or inactive accounts. A database name is a configuration guard, not proof of isolation: create a separate database containing synthetic demo records only.

Provision the new database deliberately: apply the checked-in migrations, and create/import the demo catalog and both demo accounts. The existing seed can provision a fresh demo database in a one-time development provisioning process; it intentionally refuses production mode. Do not run it on an existing live store. It preserves existing passwords, so configured seed passwords must match imported accounts. No migrations or seeding happen automatically at application startup.

Use unique production JWT secrets, HTTPS, and the deployed storefront URL in `FRONTEND_ORIGIN`. Build the frontend with `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_API_URL` pointing to the hosted URLs. Keep frontend and API on the same HTTPS site (for example shop.example.com and api.example.com), or proxy `/api/v1` to the API at the hosting layer; HttpOnly refresh cookies use SameSite=Lax and Secure in production. Hosting URLs on unrelated sites require a separate cookie/auth deployment design.

After starting the API, `GET /api/v1/auth/demo` should return `CUSTOMER` and `ADMIN` roles. Test both buttons, reload and sign-out over the actual deployed HTTPS URLs. Changing backend mode requires restarting the API; changing public frontend URLs requires a new build.

Both accounts are shared and admin operations write to the demo database. This login change does not change production payment protections: mock card completion and automatic mock refunds remain blocked in production. COD and other existing demo features retain their current behavior. A full hosted payment simulation would need a separate scoped change.
