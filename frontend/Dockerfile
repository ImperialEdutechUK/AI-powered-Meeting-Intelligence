# syntax=docker/dockerfile:1

###############################################################################
# ActionBrief frontend — production image for Railway
#
# Two stages: no Chromium, no Postgres client, no headless-browser toolchain —
# those all stayed in the backend image. This is a plain Next.js standalone
# server that proxies /api/* to BACKEND_URL.
###############################################################################

########################  Stage 1 — dependencies  #############################
FROM node:22-bookworm-slim AS deps

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

##########################  Stage 2 — build  ##################################
FROM node:22-bookworm-slim AS build

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# `next build` runs type checking and linting, so a broken build never ships.
RUN npm run build

#########################  Stage 3 — runtime  #################################
FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs --create-home appuser

COPY --from=build --chown=appuser:nodejs /app/.next/standalone ./
COPY --from=build --chown=appuser:nodejs /app/.next/static ./.next/static

USER appuser

EXPOSE 3000

CMD ["node", "server.js"]
