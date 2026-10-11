#!/usr/bin/env bash
# Execute in Google Cloud Shell from the uploaded project directory.
set -euo pipefail
project="${1:?Usage: bash deploy/google-cloud/deploy.sh YOUR_PROJECT_ID}"
[[ $project =~ ^[a-z][a-z0-9-]{4,61}[a-z0-9]$ ]] || { echo 'Invalid Google Cloud project ID.' >&2; exit 1; }
command -v gcloud >/dev/null
command -v python3 >/dev/null
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
zone=us-central1-a
region=us-central1
instance=altura-demo
network=altura-demo-network
address=altura-demo-ip
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
python3 "$root/deploy/google-cloud/package.py" "$root" "$tmp/source.tar.gz"
# The selected project's billing and IAM permissions must already be enabled.
gcloud services enable compute.googleapis.com iap.googleapis.com --project="$project" --quiet
if ! gcloud compute networks describe "$network" --project="$project" >/dev/null 2>&1; then
  gcloud compute networks create "$network" --subnet-mode=auto --project="$project" --quiet
fi
if ! gcloud compute firewall-rules describe altura-demo-web --project="$project" >/dev/null 2>&1; then
  gcloud compute firewall-rules create altura-demo-web --network="$network" --allow=tcp:80,tcp:443 --source-ranges=0.0.0.0/0 --target-tags=altura-demo --project="$project" --quiet
fi
if ! gcloud compute firewall-rules describe altura-demo-iap --project="$project" >/dev/null 2>&1; then
  gcloud compute firewall-rules create altura-demo-iap --network="$network" --allow=tcp:22 --source-ranges=35.235.240.0/20 --target-tags=altura-demo --project="$project" --quiet
fi
if ! gcloud compute addresses describe "$address" --region="$region" --project="$project" >/dev/null 2>&1; then
  gcloud compute addresses create "$address" --region="$region" --project="$project" --quiet
fi
ip=$(gcloud compute addresses describe "$address" --region="$region" --project="$project" --format='value(address)')
if ! gcloud compute instances describe "$instance" --zone="$zone" --project="$project" >/dev/null 2>&1; then
  gcloud compute instances create "$instance" --zone="$zone" --machine-type=e2-standard-2 \
    --image-family=debian-12 --image-project=debian-cloud --boot-disk-size=50GB \
    --no-boot-disk-auto-delete --no-service-account --network="$network" --address="$ip" \
    --tags=altura-demo --labels=app=altura,mode=demo --project="$project" --quiet
else
  actual=$(gcloud compute instances describe "$instance" --zone="$zone" --project="$project" --format='value(labels.app)')
  [[ $actual == altura ]] || { echo 'Refusing to update an unrelated VM named altura-demo.' >&2; exit 1; }
  actual_ip=$(gcloud compute instances describe "$instance" --zone="$zone" --project="$project" --format='value(networkInterfaces[0].accessConfigs[0].natIP)')
  [[ $actual_ip == "$ip" ]] || { echo 'Existing VM does not use the reserved demo IP; no update applied.' >&2; exit 1; }
  status=$(gcloud compute instances describe "$instance" --zone="$zone" --project="$project" --format='value(status)')
  if [[ $status == TERMINATED ]]; then
    gcloud compute instances start "$instance" --zone="$zone" --project="$project" --quiet
  fi
fi
connected=false
for ((attempt=0; attempt<30; attempt++)); do
  if gcloud compute ssh "$instance" --zone="$zone" --project="$project" --tunnel-through-iap --quiet --command='true'; then connected=true; break; fi
  sleep 5
done
[[ $connected == true ]] || { echo 'VM connection failed. Check IAP/SSH IAM permissions.' >&2; exit 1; }
gcloud compute scp "$tmp/source.tar.gz" "$instance:altura-upload.tar.gz" --zone="$zone" --project="$project" --tunnel-through-iap --quiet
release=$(python3 -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest()[:20])' "$tmp/source.tar.gz")
# Release directory changes; Compose's explicit project name preserves database/secrets/TLS volumes.
gcloud compute ssh "$instance" --zone="$zone" --project="$project" --tunnel-through-iap --quiet \
  --command="sudo mkdir -p /opt/altura/releases/$release && sudo tar -xzf \"\$HOME/altura-upload.tar.gz\" -C /opt/altura/releases/$release && sudo bash /opt/altura/releases/$release/deploy/google-cloud/setup-vm.sh /opt/altura/releases/$release && rm -f \"\$HOME/altura-upload.tar.gz\""
