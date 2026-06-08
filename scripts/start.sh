#!/usr/bin/env bash

###############################################################################
# MCP Gateway Start Script (Development Mode)
#
# Starts the gateway server in development mode with hot-reload
###############################################################################

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
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

info "Starting MCP Gateway in development mode..."
info "Server will reload automatically on file changes"
echo ""

# Start the server
cd "$PROJECT_DIR/server"
npm run dev
