# syntax=docker/dockerfile:1

###############################################################################
# ActionBrief backend — production image for Railway
#
# Three stages so the runtime image carries no build toolchain and no dev
# dependencies. Chromium comes from Debian's repository rather than Puppeteer's
# downloader: it is the same engine, it is patched by the distro, and it avoids a
# ~300 MB download on every build.
###############################################################################

########################  Stage 1 — dependencies  #############################
FROM node:22-bookworm-slim AS deps

WORKDIR /app

# Puppeteer must not fetch its own browser; the runtime stage installs Chromium.
ENV PUPPETEER_SKIP_DOWNLOAD=1 \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1 \
    NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

##########################  Stage 2 — build  ##################################
FROM node:22-bookworm-slim AS build

WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=1 \
    NEXT_TELEMETRY_DISABLED=1 \
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
    PORT=3001 \
    HOSTNAME=0.0.0.0 \
    CHROMIUM_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_DOWNLOAD=1

# Chromium plus the font and library set it needs to rasterise text and PNGs.
# `--no-install-recommends` keeps the layer lean; the font packages are required
# for correct glyph coverage in the PDF.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium \
      ca-certificates \
      fonts-liberation \
      fontconfig \
      libnss3 \
      libatk1.0-0 \
      libatk-bridge2.0-0 \
      libcups2 \
      libdrm2 \
      libgbm1 \
      libpango-1.0-0 \
      libcairo2 \
      libasound2 \
      libxcomposite1 \
      libxdamage1 \
      libxfixes3 \
      libxrandr2 \
      libxkbcommon0 \
      libx11-6 \
      libxcb1 \
      libxext6 \
      libexpat1 \
      tini \
 && fc-cache -f \
 && rm -rf /var/lib/apt/lists/*

# Run as an unprivileged user. Chromium is launched with --no-sandbox because a
# container already provides the isolation boundary, and the renderer only ever
# loads this application's own print route — never third-party content.
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs --create-home appuser

# The standalone output bundles the server plus every traced dependency,
# including `pg`. Everything lands inside it so Node's resolver finds those
# modules from the scripts as well — no hand-maintained copy list to drift.
COPY --from=build --chown=appuser:nodejs /app/.next/standalone ./
COPY --from=build --chown=appuser:nodejs /app/.next/static ./.next/static

# Migrations and the entrypoint, alongside the server they wrap.
COPY --from=build --chown=appuser:nodejs /app/db ./db
COPY --from=build --chown=appuser:nodejs /app/scripts ./scripts

USER appuser

EXPOSE 3001

# tini reaps the Chromium processes Puppeteer leaves behind on a hard failure.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "scripts/start.mjs"]
