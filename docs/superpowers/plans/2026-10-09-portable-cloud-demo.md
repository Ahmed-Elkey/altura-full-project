# Portable cloud demo implementation plan

Goal: a Docker Compose deployment initializes an isolated demo database, private credentials and both demo accounts during startup, without post-deployment activation. Does not promise support on static hosting or a cloud service that cannot run Compose/persistent volumes.

1. Test secret creation, persistence and fail-closed startup profiles with Node tests; implement deployment helpers only after RED.
2. Add private-volume secret initializer and API startup orchestration: require altura_demo, migrate, seed a fresh empty DB once, verify existing demo accounts, then start API. Never seed/reset the current local DB.
3. Add same-origin Next API proxy with origin validation and private internal API URL; preserve HttpOnly cookies. Keep local default URL unchanged.
4. Add Docker images, Compose dependencies/health checks/volumes and strict build-context exclusion of private files. Only frontend port exposed; database/backend private.
5. Test helper/proxy behavior, frontend/backend builds and existing demo flows. Docker is unavailable on this machine, so image/Compose runtime verification must be reported separately. No deployment or production certification claim.
6. Document one deployment command and cloud runtime requirements; independent review, fix findings, record evidence.
