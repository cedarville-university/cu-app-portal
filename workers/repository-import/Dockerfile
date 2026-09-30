FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS build

WORKDIR /workspace
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsup.repository-import.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate && npm run build:repository-import-worker

WORKDIR /runtime
COPY workers/repository-import/package.json workers/repository-import/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx
WORKDIR /app
COPY --from=build /runtime/node_modules ./node_modules
COPY --from=build /workspace/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /workspace/workers/repository-import/dist ./dist
RUN mkdir -p /tmp/repository-import && chown node:node /tmp/repository-import

ENV NODE_ENV=production
ENV TMPDIR=/tmp/repository-import
USER node
ENTRYPOINT ["node", "dist/main.js"]
