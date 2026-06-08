# Multi-stage build for MCP Gateway Platform
# Stage 1: Server dependencies
FROM node:20-alpine AS server-builder

WORKDIR /app/server

# Copy server package files
COPY server/package*.json ./

# Install dependencies (production only for final image)
RUN npm ci --only=production && \
    npm cache clean --force

# Copy server source
COPY server/ ./

# =====================================
# Stage 2: Build UI
FROM node:20-alpine AS ui-builder

WORKDIR /app/ui

# Copy UI package files
COPY ui/package*.json ./

# Install dependencies
RUN npm ci

# Copy UI source
COPY ui/ ./

# Build UI with Vite
RUN npm run build

# =====================================
# Stage 3: Production Runtime
FROM node:20-alpine

WORKDIR /app

# Install runtime dependencies
# - git: for git-* backend types (clone repos)
# - docker-cli: for docker backend type (manage containers)
# - python3 & py3-pip: for Python-based backends
# - curl: for health checks
RUN apk add --no-cache \
    git \
    docker-cli \
    python3 \
    py3-pip \
    curl \
    bash

# Install uv for Python package management (used by uvx/pipx backends)
RUN pip3 install --no-cache-dir uv

# Copy server artifacts (no build step needed - uses plain JS)
COPY --from=server-builder /app/server/src ./server/src
COPY --from=server-builder /app/server/node_modules ./server/node_modules
COPY --from=server-builder /app/server/package*.json ./server/

# Copy built UI artifacts
COPY --from=ui-builder /app/ui/dist ./ui/dist

# Copy configuration files
COPY registry.example.json ./registry.json
COPY .env.example ./

# Create MCP storage directories
# These will be mounted as volumes in production
RUN mkdir -p /root/.mcp/repos \
    /root/.mcp/cache \
    /root/.mcp/logs \
    /root/.mcp/tokens

# Expose gateway port
EXPOSE 3000

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Set environment
ENV NODE_ENV=production

# Start the gateway server
CMD ["node", "server/src/index.js"]
