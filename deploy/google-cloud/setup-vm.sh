#!/usr/bin/env bash
# Runs on the dedicated Debian VM, never on the developer's machine.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run through the deployment script as root.' >&2; exit 1; }
cd "${1:?Missing project directory}"
[[ -f compose.yaml && -f deploy/google-cloud/Caddyfile ]] || exit 1
if ! docker compose version >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian %s stable\n' "$(dpkg --print-architecture)" "$VERSION_CODENAME" > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
ip=$(curl --retry 5 -fsS -H 'Metadata-Flavor: Google' http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip)
[[ $ip =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || exit 1
# Public DNS without buying a domain; this is an external DNS dependency.
domain="altura-${ip//./-}.sslip.io"
printf 'ALTURA_DOMAIN=%s\nNEXT_PUBLIC_SITE_URL=https://%s\n' "$domain" "$domain" > .cloud.env
docker compose --env-file .cloud.env -f compose.yaml -f deploy/google-cloud/compose.https.yaml config --quiet
docker compose --env-file .cloud.env -f compose.yaml -f deploy/google-cloud/compose.https.yaml up --build -d
ready=false
for ((attempt=0; attempt<120; attempt++)); do
  if curl -fsS "https://$domain/api/health" | python3 -c 'import sys,json; v=json.load(sys.stdin); sys.exit(0 if v.get("commerceReady") is True else 1)' && \
     curl -fsS "https://$domain/api/v1/auth/demo" | python3 -c 'import sys,json; v=json.load(sys.stdin); sys.exit(0 if set(v.get("roles",[])) == {"CUSTOMER","ADMIN"} else 1)'; then
    ready=true
    break
  fi
  sleep 5
done
[[ $ready == true ]] || { echo 'HTTPS/readiness did not pass. Inspect Docker service logs; deployment is not confirmed.' >&2; exit 1; }
printf '\nALTURA ready: https://%s/account/login\n' "$domain"
