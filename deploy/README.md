# ALTURA cloud demo

This package runs the complete demo on a **Docker Compose capable cloud host** with persistent volumes and an HTTPS ingress. It does not work by uploading only frontend files to static hosting. No manual database migration, account creation, passwords, or demo activation are needed after this package starts.

For the selected Google Cloud host, use the automated [Compute Engine deployment](google-cloud/README.md). It packages/transfers source, installs Docker, adds HTTPS and checks readiness; it does not require manual demo-account setup.

Deploy `compose.yaml` from the project root. On a compatible server the deployment command is:

```sh
npm run cloud:demo
```

This runs `docker compose up --build -d`. Publish the frontend port (3000, or the `PORT` value selected before deployment) through the host's HTTPS ingress. The host must provide Docker/Compose, sufficient disk/memory for building both applications, persistent storage, and HTTPS. Those are hosting prerequisites, not steps this repository can create on an arbitrary service.

Startup order:

1. Generate strong private database/JWT/demo credentials once; persist them in a private volume. Persist a separate derived signing key for anonymous demo visitor rate-limit identities.
2. PostgreSQL initializes the dedicated `altura_demo` database; only its private network is used.
3. API applies checked-in migrations. A completely empty database receives the catalog and both demo accounts. Existing records are never reset/reseeded on restart. Incompatible accounts/configuration stop startup with a generic error.
4. Once the API is healthy, the frontend starts and the Customer demo / Admin demo buttons are available. Its `/api/v1` proxy keeps login/refresh/logout cookies on the same HTTPS site, without needing to configure a separate API domain.

Only the frontend port is exposed. The API trusts its one internal proxy hop, whose controlled forwarding identity is generated from a signed HttpOnly visitor cookie; browser-supplied forwarding headers are removed. This prevents all demo visitors sharing the container IP's attempt bucket. A visitor who deletes cookies receives a new bucket, so this is a shared-demo convenience boundary; a real store still needs deployment-specific edge abuse controls. Ordinary authentication/authorization still applies.

Keep all three named volumes during upgrades/restarts; deleting them removes the demo database or its matching private credentials. Back up the database and secrets together. The Docker build context excludes private `.env` files, the existing local database/backups, credentials documents, logs and build artifacts.

The existing real-payment safeguards remain: this is a shared demonstration with mock payment configuration, COD, and no configured outbound mail. Production mock card completion/automatic mock refunds remain blocked. Real mail/payment integrations are separate from demo-account provisioning. A hostname may optionally be supplied via `NEXT_PUBLIC_SITE_URL` at build time for production SEO; demo entry itself uses the current same-origin URL.

Verification: `node --test deploy/demo-bootstrap.test.cjs`, `npm run qa:cloud-bootstrap` (requires a local PostgreSQL binary; set `ALTURA_QA_PG_BIN` if needed), and `tests/cloud-demo-proxy.spec.ts`. The QA bootstrap creates a fresh disposable cluster on port 5440/API 4501, then removes it; it does not connect to the current project database. Docker Engine is not installed in this development environment, so full image builds and Compose runtime startup still require verification on a Docker host before declaring a deployment successful.

[Docker startup dependencies](https://docs.docker.com/compose/how-tos/startup-order/) explain the readiness conditions used here.
