#!/usr/bin/env bash

###############################################################################
# MCP Gateway Start Script (Production Mode with Docker)
#
# Starts the gateway using Docker Compose for production deployment
###############################################################################

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Check if .env exists
if [ ! -f "$PROJECT_DIR/.env" ]; then
  echo "Error: .env file not found. Run ./scripts/setup.sh first"
  exit 1
fi

# Check if registry.json exists
if [ ! -f "$PROJECT_DIR/registry.json" ]; then
  echo "Error: registry.json not found. Run ./scripts/setup.sh first"
  exit 1
fi

# Check if Docker is available
if ! command -v docker &> /dev/null; then
  echo "Error: Docker not found. Please install Docker first."
  exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null 2>&1; then
  echo "Error: Docker Compose not found. Please install Docker Compose first."
  exit 1
fi

info "Starting MCP Gateway in production mode with Docker..."
echo ""

# Determine which docker-compose command to use
if command -v docker-compose &> /dev/null; then
  COMPOSE_CMD="docker-compose"
else
  COMPOSE_CMD="docker compose"
fi

# Use production compose file if it exists
if [ -f "$PROJECT_DIR/docker-compose.prod.yml" ]; then
  info "Using docker-compose.prod.yml"
  cd "$PROJECT_DIR"
  $COMPOSE_CMD -f docker-compose.prod.yml up -d
else
  info "Using docker-compose.yml"
  cd "$PROJECT_DIR"
  $COMPOSE_CMD up -d
fi

echo ""
success "Gateway started successfully!"
echo ""
info "Access points:"
echo "  - Gateway API: http://localhost:3000"
echo "  - Health check: http://localhost:3000/health"
echo "  - SSE endpoint: http://localhost:3000/sse"
echo ""
info "View logs:"
echo "  $COMPOSE_CMD logs -f gateway"
echo ""
info "Stop gateway:"
echo "  $COMPOSE_CMD down"
