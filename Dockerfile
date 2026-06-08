# syntax=docker/dockerfile:1.7
# Multi-stage build for MCP Gateway Platform.

# =====================================
# Stage 1: build server (TypeScript -> JavaScript)
FROM node:20-alpine AS server-builder
WORKDIR /app

# Copy type definitions needed by server
COPY types/ ./types/

WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --no-audit --no-fund

COPY server/ ./
RUN npm run build

# Install production dependencies only
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# =====================================
# Stage 2: build the UI bundle
FROM node:20-alpine AS ui-builder
WORKDIR /app/ui

COPY ui/package*.json ./
RUN npm ci --no-audit --no-fund

COPY ui/ ./
RUN npm run build

# =====================================
# Stage 3: production runtime
FROM node:20-alpine
WORKDIR /app

# Runtime deps:
#   git        — `source: "git"` clones
#   docker-cli — `source: "container"` (talks to host daemon over the mounted/proxied socket)
#   python3+uv — `source: "pkg"` with uvx / pipx commands
#   bash       — for `source: "local"` shell-script wrappers
#   curl       — HEALTHCHECK
RUN apk add --no-cache git docker-cli python3 py3-pip curl bash && \
    pip3 install --no-cache-dir --break-system-packages uv

# Copy compiled server code and runtime dependencies
COPY --from=server-builder /app/server/dist          ./server/dist
COPY --from=server-builder /app/server/node_modules  ./server/node_modules
COPY --from=server-builder /app/server/package*.json ./server/

# Copy built UI assets
COPY --from=ui-builder /app/ui/dist ./ui/dist

# Copy the JSON Schema and type definitions
COPY schema/ ./schema/
COPY types/ ./types/

# Default registry — overridden by a host bind mount in real deployments.
COPY registry.example.json ./registry.json
COPY .env.example ./.env.example

# Storage dirs (bind-mount these from the host in compose).
RUN mkdir -p /root/.mcp/repos /root/.mcp/cache /root/.mcp/logs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -fsS http://localhost:3000/health || exit 1

ENV NODE_ENV=production

# OCI labels (also applied by the release workflow, kept here for local builds).
LABEL org.opencontainers.image.source="https://github.com/ismail-kattakath/mcp-gateway"
LABEL org.opencontainers.image.description="MCP Gateway — universal aggregator for Model Context Protocol servers"
LABEL org.opencontainers.image.licenses="MIT"

CMD ["node", "server/dist/index.js"]
