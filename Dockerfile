# syntax=docker/dockerfile:1.7
# Multi-stage build for MCP Gateway Platform.

# =====================================
# Stage 1: build server (TypeScript -> JavaScript)
FROM node:22-alpine AS server-builder
WORKDIR /app

# Install build tools for native dependencies:
#  - better-sqlite3: python3, make, g++
#  - kerberos: krb5-dev (gssapi headers)
RUN apk add --no-cache python3 make g++ krb5-dev

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
FROM node:22-alpine AS ui-builder
WORKDIR /app/ui

COPY ui/package*.json ./
RUN npm ci --no-audit --no-fund

COPY ui/ ./
RUN npm run build

# =====================================
# Stage 3: production runtime (security hardened)
FROM node:22-alpine

# Create non-root user and group. node:20-alpine ships with a `node` user at
# UID/GID 1000 — remove it so we can reuse those IDs for `gateway`.
RUN (deluser --remove-home node 2>/dev/null || true) && \
    (delgroup node 2>/dev/null || true) && \
    addgroup -g 1000 gateway && \
    adduser -D -u 1000 -G gateway gateway

WORKDIR /app

# Runtime deps:
#   git        — `source: "git"` clones
#   docker-cli — `source: "container"` (talks to host daemon over the mounted/proxied socket)
#   python3+uv — `source: "pkg"` with uvx / pipx commands
#   bash       — for `source: "local"` shell-script wrappers
#   curl       — HEALTHCHECK
RUN apk add --no-cache git docker-cli python3 py3-pip curl bash krb5-libs libsecret && \
    pip3 install --no-cache-dir --break-system-packages uv

# Copy compiled server code and runtime dependencies with correct ownership
COPY --from=server-builder --chown=gateway:gateway /app/server/dist          ./server/dist
COPY --from=server-builder --chown=gateway:gateway /app/server/node_modules  ./server/node_modules
COPY --from=server-builder --chown=gateway:gateway /app/server/package*.json ./server/

# Copy built UI assets
COPY --from=ui-builder --chown=gateway:gateway /app/ui/dist ./ui/dist

# Copy the JSON Schema and type definitions
COPY --chown=gateway:gateway schema/ ./schema/
COPY --chown=gateway:gateway types/ ./types/

# Default registry — overridden by a host bind mount in real deployments.
COPY --chown=gateway:gateway registry.example.json ./registry.json

# Storage dirs (bind-mount these from the host in compose).
RUN mkdir -p /home/gateway/.mcp/repos /home/gateway/.mcp/cache /home/gateway/.mcp/logs && \
    chown -R gateway:gateway /home/gateway/.mcp

# Create writable tmp directory for tmpfs mount
RUN mkdir -p /tmp && chown gateway:gateway /tmp

# Switch to non-root user
USER gateway

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -fsS http://localhost:3000/health || exit 1

ENV NODE_ENV=production

# OCI Image Spec - Build args and labels
ARG OCI_IMAGE_VERSION=dev
ARG OCI_IMAGE_REVISION=unknown
ARG OCI_IMAGE_CREATED
ARG OCI_IMAGE_SOURCE=https://github.com/ismail-kattakath/mcp-gateway
ARG OCI_IMAGE_TITLE=mcp-gateway
ARG OCI_IMAGE_DESCRIPTION=Universal aggregator for Model Context Protocol servers
ARG OCI_IMAGE_LICENSES=MIT

# Expose OCI metadata as environment variables for runtime access
ENV OCI_IMAGE_VERSION=${OCI_IMAGE_VERSION} \
    OCI_IMAGE_REVISION=${OCI_IMAGE_REVISION} \
    OCI_IMAGE_CREATED=${OCI_IMAGE_CREATED} \
    OCI_IMAGE_SOURCE=${OCI_IMAGE_SOURCE} \
    OCI_IMAGE_TITLE=${OCI_IMAGE_TITLE} \
    OCI_IMAGE_DESCRIPTION=${OCI_IMAGE_DESCRIPTION} \
    OCI_IMAGE_LICENSES=${OCI_IMAGE_LICENSES}

# OCI labels (also applied by the release workflow, kept here for local builds)
LABEL org.opencontainers.image.version="${OCI_IMAGE_VERSION}"
LABEL org.opencontainers.image.revision="${OCI_IMAGE_REVISION}"
LABEL org.opencontainers.image.created="${OCI_IMAGE_CREATED}"
LABEL org.opencontainers.image.source="${OCI_IMAGE_SOURCE}"
LABEL org.opencontainers.image.title="${OCI_IMAGE_TITLE}"
LABEL org.opencontainers.image.description="${OCI_IMAGE_DESCRIPTION}"
LABEL org.opencontainers.image.licenses="${OCI_IMAGE_LICENSES}"

CMD ["node", "server/dist/index.js"]
