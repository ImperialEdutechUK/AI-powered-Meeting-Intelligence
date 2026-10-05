# Deploying ActionBrief to AWS (S3 + CloudFront + Lambda)

Target: **https://meeting-notes.imperial.imet.lk/** · Idle cost: **~5–10 ¢/month**

```
                        meeting-notes.imperial.imet.lk  (Route 53 alias)
                                       │
                                 CloudFront  (*.imperial.imet.lk cert, us-east-1)
                 ┌─────────────────────┼──────────────────────────┐
           default, /_next/static/*    │                     /api/*
                 │                     │                          │
        S3 (private, OAC)              │        Lambda function URL (streaming)
        static Next.js export          │        Next.js backend in a container image:
        /login.html, /new.html …       │        Lambda Web Adapter + Chromium (PDF)
                                       │                          │
                                       │                 DynamoDB (rate limits, TTL)
```

- **Frontend**: `next build` with `output: 'export'`, so it's plain HTML/JS on S3.
  A CloudFront Function maps `/login` → `/login.html`.
- **Backend**: the existing `backend/Dockerfile` image, plus the
  [AWS Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter),
  runs unmodified on Lambda. It scales to zero and you pay only per request.
- **Same origin**: `/api/*` is a CloudFront behaviour, so the httpOnly session
  cookie stays first-party and there's no CORS.
- **No database server**: briefs are never persisted. Postgres was only used for
  rate limiting, which now uses an on-demand DynamoDB table.

## Deploy

1. Start Docker Desktop.
2. `cp infra/deploy.env.example infra/deploy.env`, then fill in `HOSTED_ZONE_ID` and
   `CERTIFICATE_ARN` (the file shows the commands that look them up).
3. `infra/deploy.sh`. The first run only needs the two secrets, typed hidden:
   `read -rs OPENROUTER_API_KEY && read -rs APP_PASSCODE && export OPENROUTER_API_KEY APP_PASSCODE && infra/deploy.sh`
4. `curl -s https://meeting-notes.imperial.imet.lk/api/health`

The first run creates the stack (~5 min; CloudFront is the slow part). Later runs
take ~3 min and need no secrets.

**Where the secrets live:** only in SSM Parameter Store, as KMS-encrypted
SecureStrings under `/actionbrief/` (`OPENROUTER_API_KEY`, `APP_PASSCODE`,
`SESSION_SECRET`, `ORIGIN_VERIFY_SECRET`). The Lambda decrypts them into memory at
start-up (`backend/src/instrumentation.ts`). They are not in Lambda environment
variables, CloudFormation parameters (except the origin secret, which CloudFront
needs and which is NoEcho), `deploy.env`, git, or the frontend bundle. The
Lambda's IAM role can read only `/actionbrief/*`.

To push UI-only changes without rebuilding the backend: `infra/deploy.sh --frontend`.

## What it costs

At about 200 briefs/month and a handful of staff:

| Service | Usage | Monthly |
| --- | --- | --- |
| ECR | 2 backend images kept (lifecycle rule), ~0.4–0.6 GB each | ~5–10 ¢ |
| S3 | < 10 MB site, a few thousand GETs from CloudFront | < 1 ¢ |
| CloudFront + Functions | well inside the always-free 1 TB / 10 M requests / 2 M function calls | 0 |
| Lambda | ~200 × 60 s × 2 GB ≈ 25 k GB-s, inside the always-free 400 k GB-s | 0 |
| DynamoDB (on-demand) | a few hundred writes | < 1 ¢ |
| CloudWatch Logs | a few MB, 14-day retention | < 1 ¢ |
| ACM certificate, Route 53 alias queries | existing wildcard cert; alias queries to CloudFront are free | 0 |

The `imperial.imet.lk` hosted zone ($0.50/month) already exists and is not added
by this stack. OpenRouter is billed separately, at about $0.004 per brief.

Choices made to keep the bill this low:

- Secrets live in Lambda environment variables (encrypted at rest), not Secrets
  Manager ($0.40 per secret per month).
- The Lambda function URL replaces API Gateway, and DynamoDB on-demand replaces RDS.
- No NAT gateway and no VPC: the Lambda calls OpenRouter directly.
- Images run on arm64 (Graviton), which is about 20% cheaper per GB-second.

## Design notes and limits

- **Long generations vs CloudFront's 60 s origin timeout.** `POST /api/briefs`
  streams a space every 10 s while the model works, then sends the JSON. Leading
  whitespace is valid JSON, so the client code is unchanged. Errors that happen
  after streaming starts arrive as `200` with `{ ok: false, error }`, which is
  what the UI already checks.
- **Upload cap is 4 MB** (`MAX_UPLOAD_MB`). Lambda function URLs reject request
  bodies over 6 MB. A 60-minute Teams `.vtt` is about 150 KB.
- **Origin lock.** The function URL is public so CloudFront can reach it.
  CloudFront adds an `x-origin-verify` secret header to every request, and
  `backend/src/proxy.ts` refuses anything without it.
- **Rate limits** use a fixed one-hour window per IP in DynamoDB. The client IP
  comes from `CloudFront-Viewer-Address`, which a client can't spoof.
- **Cold starts.** The first request after a quiet period takes a few extra
  seconds while Lambda starts the container. Lambda loads image files lazily,
  so `scripts/start.mjs` pre-reads Chromium in the background. A PDF export on
  a fresh instance takes about 6 s instead of timing out.

## Operations

- **Logs**: CloudWatch log group `/aws/lambda/actionbrief-api`.
- **Rotate the passcode or API key**: `read -rs APP_PASSCODE && export APP_PASSCODE && infra/deploy.sh`
  (likewise `OPENROUTER_API_KEY`). The deploy writes the new value to SSM and the
  new Lambda version picks it up.
- **Sign everyone out**: `aws ssm delete-parameter --name /actionbrief/SESSION_SECRET --region eu-north-1`,
  then `infra/deploy.sh`. A new secret is generated.
- **Roll back the backend**: re-run the stack with the previous image tag
  (ECR keeps two):
  `aws cloudformation deploy --stack-name actionbrief --template-file infra/template.yaml --capabilities CAPABILITY_IAM --parameter-overrides ImageUri=<previous-uri> --region eu-north-1`
  (CloudFormation reuses the other parameters' previous values).
- **Tear down**: empty the S3 bucket, then
  `aws cloudformation delete-stack --stack-name actionbrief`, then delete the
  `actionbrief-api` ECR repository.
