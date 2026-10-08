#!/usr/bin/env bash
# Run through SSM with ARTIFACT_BUCKET and PUBLIC_ORIGIN set by the deployer.
set -euo pipefail
: "${ARTIFACT_BUCKET:?Private release bucket required}"
: "${PUBLIC_ORIGIN:?Public HTTPS origin required}"
cloud-init status --wait
command -v aws >/dev/null || dnf install -y awscli2
mkdir -p /opt/farmaenlace/convex/data /opt/farmaenlace/web
aws s3 cp "s3://${ARTIFACT_BUCKET}/release.tar.gz" /opt/farmaenlace/release.tar.gz --region us-east-1 --only-show-errors
tar -xzf /opt/farmaenlace/release.tar.gz -C /opt/farmaenlace
cd /opt/farmaenlace
if [ ! -f .env ]; then
  umask 077
  printf 'INSTANCE_NAME=farmaenlace-demo\nINSTANCE_SECRET=%s\nPUBLIC_ORIGIN=%s\n' "$(openssl rand -hex 32)" "$PUBLIC_ORIGIN" > .env
fi
docker compose config --quiet
docker compose up -d --wait --wait-timeout 240
docker compose ps
curl -fsS http://127.0.0.1/health
