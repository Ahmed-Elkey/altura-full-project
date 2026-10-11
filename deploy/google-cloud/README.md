# Google Cloud deployment: Compute Engine demo

This deployment uses one dedicated Compute Engine Debian VM, the existing Docker Compose demo, PostgreSQL on persistent storage, and Caddy for HTTPS. It does **not** deploy to Cloud Run. Cloud Run would need a separate database/service deployment; uploading `compose.yaml` to Cloud Run is not this workflow.

## Deploy once

Upload the project folder to Google Cloud Shell, open its directory, and run:

```sh
bash deploy/google-cloud/deploy.sh YOUR_PROJECT_ID
```

`YOUR_PROJECT_ID` is the selected Google Cloud project ID, not its display name. Before running, that project needs billing enabled and your signed-in account needs permissions to enable APIs, create/manage Compute resources and connect through IAP/SSH. No account keys or passwords should be pasted into this script. Running it creates billable resources; this repository has not created any cloud resources.

The script automatically:

1. Packages only application/build inputs. Local `.env`, credentials documents, local database, node_modules, runtime fixtures and backups are excluded.
2. Enables Compute/IAP APIs; creates a dedicated network, restricted IAP SSH rule, public HTTP/HTTPS rule and reserved public IP.
3. Creates `altura-demo` in `us-central1-a`, using `e2-standard-2` and a 50 GB persistent boot disk. The VM has no Google service account. These are fixed demo defaults, not a sizing guarantee for production traffic.
4. Transfers the package through IAP, installs Docker/Compose and starts the application. PostgreSQL, migrations, catalog and Customer/Admin demo accounts initialize automatically without manual activation or seed steps.
5. Adds HTTPS and automatically builds the site's canonical URL into the frontend. The browser accesses one hostname; API/database ports are not published.
6. Waits for a **valid HTTPS** response, `commerceReady: true`, and both demo roles before printing the login link. TLS validation is never bypassed.

Because no domain is currently available, the default URL is `https://altura-IP-WITH-DASHES.sslip.io`. The hostname resolves to the reserved VM IP using the external sslip.io DNS service. Caddy requests/renews a certificate automatically. DNS availability and certificate-authority limits are external dependencies; the script reports failure if HTTPS does not become ready. A branded domain is preferable for a long-lived store.

## Restart and update

Docker is enabled at boot; services restart automatically after a VM reboot. Rerun the same deployment command to upload a new release. The Compose project name and persistent database, private credentials, visitor signing key and TLS volumes remain stable. Existing catalog/account data is not reseeded on update.

Do not delete Docker volumes or the VM disk during an update. The boot disk is retained when deleting the VM; this prevents automatic data deletion but a replacement VM does **not** automatically attach that retained disk. Recovery requires attaching/restoring it. Old source releases remain under `/opt/altura/releases`; clean unused releases only after a successful upgrade. Back up database and private secrets together before changing infrastructure.

The VM, retained disk and reserved IP incur costs. Failed provisioning can leave those resources behind; inspect them in the selected Google Cloud project. This deployment command does not automatically delete infrastructure or application data. It does not configure automatic backups, high availability, monitoring alerts, outbound email or real payment credentials. Existing production mock-payment safeguards still apply.

## Verified limits

Local source-packaging tests, shell syntax checks and offline command-plan tests are available. The underlying provisioning/database and same-origin authentication checks are recorded in `QA_REPORT.md`. Docker is unavailable in this development environment, and no Google Cloud project is connected: **container execution, real Google Cloud provisioning and public certificate issuance remain unverified**.

References: [Google containers on VMs](https://docs.cloud.google.com/compute/docs/containers/deploying-containers), [IAP TCP forwarding](https://docs.cloud.google.com/iap/docs/using-tcp-forwarding), [Docker on Debian](https://docs.docker.com/engine/install/debian/), [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https), [sslip.io DNS/TLS](https://sslip.io/).
