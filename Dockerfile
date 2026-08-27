# ── Build stage ──────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ── Production stage ────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app
RUN apk upgrade --no-cache \
  && apk add --no-cache su-exec
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force \
  && rm -rf \
    /usr/local/lib/node_modules/npm \
    /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/bin/corepack \
    /usr/local/bin/yarn \
    /usr/local/bin/yarnpkg \
    /opt/yarn-v1.22.22

COPY --from=build /app/dist ./dist
COPY src/db/migrations ./dist/db/migrations

RUN mkdir -p /data && chown node:node /data
COPY --chmod=755 docker-entrypoint.slab.sh /usr/local/bin/docker-entrypoint.slab.sh

ENV NODE_ENV=production
ENV PORT=6970
ENV TRACKER_MCP_PORT=6969
ENV TRACKER_DB_PATH=/data/slab.db

EXPOSE 6969 6970

ENTRYPOINT ["docker-entrypoint.slab.sh"]
CMD ["node", "dist/index.js"]
