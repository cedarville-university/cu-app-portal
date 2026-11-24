FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS build
WORKDIR /workspace
RUN apt-get update && apt-get install -y --no-install-recommends apt libapt-pkg6.0 openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsup.publish.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate && npm run build:publish-worker
WORKDIR /runtime
COPY workers/publish/package.json workers/publish/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS scanner
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git python3-venv && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/cu-security/venv && /opt/cu-security/venv/bin/pip install --no-cache-dir semgrep==1.186.0
COPY workers/publish/security/*.py /opt/cu-security/
RUN git init -q /tmp/rules \
    && git -C /tmp/rules fetch -q --depth=1 https://github.com/semgrep/semgrep-rules.git a5ad1714f00c9f7fde980cab0ea1d6dc6d414fd2 \
    && python3 /opt/cu-security/install-rules.py /tmp/rules /opt/cu-security/rules \
    && /opt/cu-security/venv/bin/semgrep --version

FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6
# Refresh APT, PCRE2, and Perl with Debian security fixes (APT >= 2.6.2).
RUN apt-get update && apt-get install -y --no-install-recommends apt libapt-pkg6.0 openssl ca-certificates libpcre2-8-0 perl-base git python3 && rm -rf /var/lib/apt/lists/* && rm -rf /usr/local/lib/node_modules/npm && rm -f /usr/local/bin/npm /usr/local/bin/npx
WORKDIR /app
COPY --from=scanner /opt/cu-security /opt/cu-security
COPY --from=build /runtime/node_modules ./node_modules
COPY --from=build /workspace/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /workspace/workers/publish/dist ./dist
ENV NODE_ENV=production
USER node
ENTRYPOINT ["node", "dist/main.js"]
