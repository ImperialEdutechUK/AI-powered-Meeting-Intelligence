#!/usr/bin/env bash
#
# Build and deploy ActionBrief to AWS:
#   backend  → container image in ECR → Lambda (function URL, streaming)
#   frontend → static export → S3, served by CloudFront
#   infra    → infra/template.yaml (CloudFormation)
#
# Requirements: AWS CLI v2 (credentials for the target account), Docker with
# buildx running, Node 22+, openssl. Safe to re-run; every step is idempotent.
#
# Usage:  infra/deploy.sh              full deploy
#         infra/deploy.sh --frontend   rebuild + upload the frontend only

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="$ROOT/infra/deploy.env"
FRONTEND_ONLY=false
[[ "${1:-}" == "--frontend" ]] && FRONTEND_ONLY=true

log() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[[ -f "$CONFIG" ]] || die "Missing infra/deploy.env — copy infra/deploy.env.example and fill it in."
set -a; source "$CONFIG"; set +a

: "${AWS_REGION:?set AWS_REGION in deploy.env}"
: "${STACK_NAME:?}" "${DOMAIN_NAME:?}" "${HOSTED_ZONE_ID:?}" "${CERTIFICATE_ARN:?}"
export AWS_REGION AWS_DEFAULT_REGION="$AWS_REGION"

stack_output() {
  aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

# ─── Secrets ─────────────────────────────────────────────────────────────────
#
# Stored ONLY in SSM Parameter Store as KMS-encrypted SecureStrings under
# /$STACK_NAME/. They are never written to deploy.env, never passed on a
# command line (where `ps` could see them), and never Lambda environment
# variables. Values travel through 0600 temp files deleted on exit.
#
# To set or rotate one, provide it in the environment for a single run:
#   OPENROUTER_API_KEY=... infra/deploy.sh
#   APP_PASSCODE=...       infra/deploy.sh
# (or `read -rs OPENROUTER_API_KEY; export OPENROUTER_API_KEY` first, to keep
# it out of shell history).

umask 077
SECRET_TMP="$(mktemp -d)"
trap 'rm -rf "$SECRET_TMP"' EXIT

ssm_name() { echo "/$STACK_NAME/$1"; }

ssm_exists() {
  aws ssm get-parameter --name "$(ssm_name "$1")" --query Parameter.Name --output text >/dev/null 2>&1
}

ssm_put() { # name, value — printf is a shell builtin, so the value never hits argv
  printf '%s' "$2" | python3 -c 'import json,sys; json.dump({"Name":sys.argv[1],"Type":"SecureString","Overwrite":True,"Value":sys.stdin.read()}, open(sys.argv[2],"w"))' \
    "$(ssm_name "$1")" "$SECRET_TMP/put.json"
  aws ssm put-parameter --cli-input-json "file://$SECRET_TMP/put.json" >/dev/null
  rm -f "$SECRET_TMP/put.json"
}

ssm_get() {
  aws ssm get-parameter --name "$(ssm_name "$1")" --with-decryption \
    --query Parameter.Value --output text
}

ensure_secret() { # name, provided value, generator command (optional)
  local name="$1" provided="$2" generator="${3:-}"
  if [[ -n "$provided" ]]; then
    ssm_put "$name" "$provided"
    echo "  $name: stored in SSM"
  elif ssm_exists "$name"; then
    echo "  $name: already in SSM"
  elif [[ -n "$generator" ]]; then
    ssm_put "$name" "$($generator)"
    echo "  $name: generated and stored in SSM"
  else
    die "$name is not in SSM yet. Run once with it set: $name=... infra/deploy.sh"
  fi
}

if ! $FRONTEND_ONLY; then
  docker info >/dev/null 2>&1 || die "Docker is not running. Start Docker Desktop and re-run."

  if [[ -n "${APP_PASSCODE:-}" && ${#APP_PASSCODE} -lt 6 ]]; then
    die "APP_PASSCODE must be at least 6 characters."
  fi

  log "Secrets (SSM Parameter Store, /$STACK_NAME/)"
  ensure_secret OPENROUTER_API_KEY "${OPENROUTER_API_KEY:-}"
  ensure_secret APP_PASSCODE "${APP_PASSCODE:-}"
  # Generated once; re-deploys keep everyone signed in. Delete the parameter
  # and redeploy to sign everyone out.
  ensure_secret SESSION_SECRET "${SESSION_SECRET:-}" "openssl rand -hex 32"
  ensure_secret ORIGIN_VERIFY_SECRET "${ORIGIN_VERIFY_SECRET:-}" "openssl rand -hex 24"
  unset OPENROUTER_API_KEY APP_PASSCODE SESSION_SECRET

  ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
  REGISTRY="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
  REPO="$STACK_NAME-api"

  log "ECR repository $REPO"
  if ! aws ecr describe-repositories --repository-names "$REPO" >/dev/null 2>&1; then
    aws ecr create-repository --repository-name "$REPO" \
      --image-tag-mutability IMMUTABLE >/dev/null
  fi
  # Keep only the 2 newest images (current + one rollback): ECR storage is $0.10/GB-month.
  aws ecr put-lifecycle-policy --repository-name "$REPO" --lifecycle-policy-text '{
    "rules": [{
      "rulePriority": 1,
      "description": "keep last 2 images",
      "selection": { "tagStatus": "any", "countType": "imageCountMoreThan", "countNumber": 2 },
      "action": { "type": "expire" }
    }]
  }' >/dev/null

  log "Building backend image (linux/arm64)"
  TAG="$(date -u +%Y%m%d%H%M%S)"
  IMAGE_URI="$REGISTRY/$REPO:$TAG"
  aws ecr get-login-password | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null
  # Lambda rejects OCI image indexes, so no provenance/SBOM attestations.
  docker buildx build --platform linux/arm64 --provenance=false --sbom=false \
    -t "$IMAGE_URI" --push "$ROOT/backend"

  log "Deploying CloudFormation stack $STACK_NAME (first run takes ~5 minutes)"
  # CloudFront needs the origin secret as a (NoEcho) stack parameter; pass it
  # via a 0600 file rather than argv.
  ORIGIN_VERIFY_SECRET="$(ssm_get ORIGIN_VERIFY_SECRET)" python3 - "$SECRET_TMP/params.json" <<PY
import json, os, sys
json.dump([
  "DomainName=$DOMAIN_NAME",
  "HostedZoneId=$HOSTED_ZONE_ID",
  "CertificateArn=$CERTIFICATE_ARN",
  "ImageUri=$IMAGE_URI",
  "OriginVerifySecret=" + os.environ["ORIGIN_VERIFY_SECRET"],
  "OrgName=${ORG_NAME:-Imperial Edutech}",
  "OrgShort=${ORG_SHORT:-IL}",
  "MaxUploadMb=${MAX_UPLOAD_MB:-4}",
  "RateLimitPerHour=${RATE_LIMIT_PER_HOUR:-40}",
  "LambdaMemoryMb=${LAMBDA_MEMORY_MB:-2048}",
  "PriceClass=${PRICE_CLASS:-PriceClass_200}",
], open(sys.argv[1], "w"))
PY
  aws cloudformation deploy \
    --stack-name "$STACK_NAME" \
    --template-file "$ROOT/infra/template.yaml" \
    --capabilities CAPABILITY_IAM \
    --no-fail-on-empty-changeset \
    --parameter-overrides "file://$SECRET_TMP/params.json"
  rm -f "$SECRET_TMP/params.json"
fi

BUCKET="$(stack_output SiteBucketName)"
DISTRIBUTION_ID="$(stack_output DistributionId)"
[[ -n "$BUCKET" && "$BUCKET" != "None" ]] || die "Stack $STACK_NAME has no outputs — run a full deploy first."

log "Building frontend (static export)"
(
  cd "$ROOT/frontend"
  npm ci --no-audit --no-fund
  NEXT_PUBLIC_ORG_NAME="${ORG_NAME:-Imperial Edutech}" \
  NEXT_PUBLIC_ORG_SHORT="${ORG_SHORT:-IL}" \
  NEXT_PUBLIC_MAX_UPLOAD_MB="${MAX_UPLOAD_MB:-4}" \
    npm run build
)

log "Uploading to s3://$BUCKET"
# Hashed build assets never change: cache for a year. Old ones are kept so a
# tab opened before the deploy can still load its chunks.
aws s3 sync "$ROOT/frontend/out/_next" "s3://$BUCKET/_next" \
  --cache-control "public,max-age=31536000,immutable"
# Pages must always revalidate so a deploy shows up immediately.
aws s3 sync "$ROOT/frontend/out" "s3://$BUCKET" --delete --exclude "_next/*" \
  --cache-control "public,max-age=0,must-revalidate"

log "Invalidating CloudFront cache"
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths "/*" \
  --query 'Invalidation.Id' --output text >/dev/null

log "Done → https://$DOMAIN_NAME/"
echo "  Health: curl -s https://$DOMAIN_NAME/api/health"
