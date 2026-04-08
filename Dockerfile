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
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY src/db/migrations ./dist/db/migrations

# Copy src for tsx-based MCP entrypoint
COPY src/ ./src/

ENV NODE_ENV=production
ENV PORT=3000
ENV TRACKER_MCP_PORT=3001

EXPOSE 3000 3001

# Default: REST API. Override command for MCP server.
CMD ["node", "dist/index.js"]
