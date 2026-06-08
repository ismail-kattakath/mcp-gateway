#!/usr/bin/env bash

###############################################################################
# MCP Gateway Setup Script
#
# This script performs initial setup for the MCP Gateway:
# - Creates required directories
# - Copies configuration files
# - Generates encryption keys
# - Installs dependencies
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

info "MCP Gateway Setup"
info "Project directory: $PROJECT_DIR"
echo ""

# Step 1: Create required directories
info "Step 1: Creating required directories..."
mkdir -p "$HOME/.mcp/repos"
mkdir -p "$HOME/.mcp/cache"
mkdir -p "$HOME/.mcp/logs"
mkdir -p "$HOME/.mcp/tokens"
success "Directories created in $HOME/.mcp/"

# Step 2: Copy registry.json if it doesn't exist
info "Step 2: Setting up registry.json..."
if [ ! -f "$PROJECT_DIR/registry.json" ]; then
  info "Copying registry.example.json to registry.json..."
  cp "$PROJECT_DIR/registry.example.json" "$PROJECT_DIR/registry.json"
  success "registry.json created"
else
  warning "registry.json already exists, skipping"
fi

# Step 3: Set up .env file
info "Step 3: Setting up .env file..."
if [ ! -f "$PROJECT_DIR/.env" ]; then
  info "Copying .env.example to .env..."
  cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"

  # Generate TOKEN_ENCRYPTION_KEY if openssl is available
  if command -v openssl &> /dev/null; then
    info "Generating TOKEN_ENCRYPTION_KEY..."
    ENCRYPTION_KEY=$(openssl rand -hex 32)
    if [[ "$OSTYPE" == "darwin"* ]]; then
      # macOS
      sed -i '' "s/TOKEN_ENCRYPTION_KEY=.*/TOKEN_ENCRYPTION_KEY=$ENCRYPTION_KEY/" "$PROJECT_DIR/.env"
    else
      # Linux
      sed -i "s/TOKEN_ENCRYPTION_KEY=.*/TOKEN_ENCRYPTION_KEY=$ENCRYPTION_KEY/" "$PROJECT_DIR/.env"
    fi
    success "TOKEN_ENCRYPTION_KEY generated"
  else
    warning "openssl not found, TOKEN_ENCRYPTION_KEY not generated"
  fi

  # Generate GATEWAY_API_KEY
  if command -v openssl &> /dev/null; then
    info "Generating GATEWAY_API_KEY..."
    API_KEY=$(openssl rand -hex 32)
    if [[ "$OSTYPE" == "darwin"* ]]; then
      # macOS
      sed -i '' "s/GATEWAY_API_KEY=.*/GATEWAY_API_KEY=$API_KEY/" "$PROJECT_DIR/.env"
    else
      # Linux
      sed -i "s/GATEWAY_API_KEY=.*/GATEWAY_API_KEY=$API_KEY/" "$PROJECT_DIR/.env"
    fi
    success "GATEWAY_API_KEY generated"
  fi

  success ".env file created and configured"
else
  warning ".env already exists, skipping"
fi

# Step 4: Install server dependencies
info "Step 4: Installing server dependencies..."
cd "$PROJECT_DIR/server"
if command -v npm &> /dev/null; then
  npm install
  success "Server dependencies installed"
else
  error "npm not found. Please install Node.js and npm first."
  exit 1
fi

# Step 5: Install UI dependencies (optional)
info "Step 5: Installing UI dependencies..."
if [ -d "$PROJECT_DIR/ui" ]; then
  cd "$PROJECT_DIR/ui"
  npm install
  success "UI dependencies installed"
else
  warning "UI directory not found, skipping"
fi

# Step 6: Validate registry
info "Step 6: Validating registry..."
cd "$PROJECT_DIR/server"
if npm run validate 2>/dev/null; then
  success "Registry validation passed"
else
  warning "Registry validation failed or validator not available"
fi

echo ""
success "========================================="
success "Setup complete!"
success "========================================="
echo ""
info "Next steps:"
echo "  1. Edit .env file with your secrets (OBS password, OAuth credentials, etc.)"
echo "  2. Edit registry.json to enable/disable backends"
echo "  3. Start the gateway:"
echo "     - Development: ./scripts/start.sh"
echo "     - Production:  ./scripts/start-prod.sh"
echo "  4. Configure your AI tools to use: http://localhost:3000/sse"
echo ""
info "For more information, see README.md and DEPLOYMENT.md"
