#!/usr/bin/env bash

###############################################################################
# MCP Gateway Setup Verification Script
#
# Verifies that all components are correctly set up and ready for deployment
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Track results
CHECKS_PASSED=0
CHECKS_FAILED=0
WARNINGS=0

info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
  echo -e "${GREEN}[✓]${NC} $1"
  CHECKS_PASSED=$((CHECKS_PASSED + 1))
}

error() {
  echo -e "${RED}[✗]${NC} $1"
  CHECKS_FAILED=$((CHECKS_FAILED + 1))
}

warning() {
  echo -e "${YELLOW}[!]${NC} $1"
  WARNINGS=$((WARNINGS + 1))
}

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo ""
info "========================================="
info "MCP Gateway Setup Verification"
info "========================================="
echo ""

# Check 1: Node.js version
info "Checking Node.js version..."
if command -v node &> /dev/null; then
  NODE_VERSION=$(node --version)
  MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
  if [ "$MAJOR_VERSION" -ge 18 ]; then
    success "Node.js version: $NODE_VERSION (>= 18.0.0)"
  else
    error "Node.js version: $NODE_VERSION (need >= 18.0.0)"
  fi
else
  error "Node.js not found"
fi

# Check 2: Registry file exists
info "Checking registry.json..."
if [ -f "$PROJECT_DIR/registry.json" ]; then
  success "registry.json exists"
else
  error "registry.json not found"
fi

# Check 3: .env file exists
info "Checking .env file..."
if [ -f "$PROJECT_DIR/.env" ]; then
  success ".env file exists"
else
  error ".env file not found"
fi

# Check 4: Encryption keys
info "Checking encryption keys..."
if [ -f "$PROJECT_DIR/.env" ]; then
  if grep -q "TOKEN_ENCRYPTION_KEY=[a-f0-9]\{64\}" "$PROJECT_DIR/.env"; then
    success "TOKEN_ENCRYPTION_KEY is set (64 hex chars)"
  else
    error "TOKEN_ENCRYPTION_KEY missing or invalid"
  fi

  if grep -q "GATEWAY_API_KEY=[a-f0-9]\{64\}" "$PROJECT_DIR/.env"; then
    success "GATEWAY_API_KEY is set (64 hex chars)"
  else
    warning "GATEWAY_API_KEY missing or invalid (optional for local dev)"
  fi
fi

# Check 5: OBS password
info "Checking OBS WebSocket password..."
if [ -f "$PROJECT_DIR/.env" ]; then
  OBS_PASS=$(grep "OBS_WEBSOCKET_PASSWORD=" "$PROJECT_DIR/.env" | cut -d'=' -f2)
  if [ "$OBS_PASS" = "your-obs-password-here" ] || [ -z "$OBS_PASS" ]; then
    warning "OBS_WEBSOCKET_PASSWORD is set to placeholder (update if using OBS)"
  else
    success "OBS_WEBSOCKET_PASSWORD is configured"
  fi
fi

# Check 6: Enabled backends
info "Checking enabled backends..."
if [ -f "$PROJECT_DIR/registry.json" ]; then
  if command -v jq &> /dev/null; then
    OBS_ENABLED=$(jq -r '.backends.obs.enabled' "$PROJECT_DIR/registry.json")
    KAPTURE_ENABLED=$(jq -r '.backends.kapture.enabled' "$PROJECT_DIR/registry.json")

    if [ "$OBS_ENABLED" = "true" ]; then
      success "obs backend is enabled"
    else
      warning "obs backend is disabled"
    fi

    if [ "$KAPTURE_ENABLED" = "true" ]; then
      success "kapture backend is enabled"
    else
      warning "kapture backend is disabled"
    fi
  else
    warning "jq not found, skipping backend check"
  fi
fi

# Check 7: Required directories
info "Checking required directories..."
if [ -d "$HOME/.mcp/repos" ]; then
  success "~/.mcp/repos directory exists"
else
  warning "~/.mcp/repos directory missing (will be created on first run)"
fi

if [ -d "$HOME/.mcp/cache" ]; then
  success "~/.mcp/cache directory exists"
else
  warning "~/.mcp/cache directory missing (will be created on first run)"
fi

if [ -d "$HOME/.mcp/logs" ]; then
  success "~/.mcp/logs directory exists"
else
  warning "~/.mcp/logs directory missing (will be created on first run)"
fi

# Check 8: Server dependencies
info "Checking server dependencies..."
if [ -d "$PROJECT_DIR/server/node_modules" ]; then
  success "Server dependencies installed"
else
  error "Server dependencies not installed (run: cd server && npm install)"
fi

# Check 9: Scripts are executable
info "Checking deployment scripts..."
for script in setup.sh start.sh start-prod.sh test.sh e2e-test.sh; do
  if [ -x "$SCRIPT_DIR/$script" ]; then
    success "scripts/$script is executable"
  else
    error "scripts/$script is not executable"
  fi
done

# Check 10: Test files exist
info "Checking test files..."
for test in integration.test.js backend-manager.test.js backends.test.js oauth.test.js validation.test.js; do
  if [ -f "$PROJECT_DIR/server/tests/$test" ]; then
    success "server/tests/$test exists"
  else
    error "server/tests/$test missing"
  fi
done

# Check 11: Docker (optional)
info "Checking Docker (optional)..."
if command -v docker &> /dev/null; then
  success "Docker is installed"
else
  warning "Docker not found (optional, needed for Docker backends)"
fi

# Check 12: Python (optional)
info "Checking Python (optional)..."
if command -v python3 &> /dev/null; then
  PYTHON_VERSION=$(python3 --version)
  success "Python installed: $PYTHON_VERSION"
else
  warning "Python not found (optional, needed for Python backends)"
fi

# Summary
echo ""
info "========================================="
info "Verification Summary"
info "========================================="
success "Checks passed: $CHECKS_PASSED"
if [ $WARNINGS -gt 0 ]; then
  warning "Warnings: $WARNINGS"
fi
if [ $CHECKS_FAILED -gt 0 ]; then
  error "Checks failed: $CHECKS_FAILED"
fi
echo ""

if [ $CHECKS_FAILED -gt 0 ]; then
  error "Setup verification failed. Please fix the errors above."
  echo ""
  info "To fix common issues:"
  echo "  - Run: ./scripts/setup.sh"
  echo "  - Install dependencies: cd server && npm install"
  echo "  - Check Node.js version: node --version (need >= 18.0.0)"
  exit 1
else
  success "========================================="
  success "Setup verification PASSED!"
  success "========================================="
  echo ""
  info "Your MCP Gateway is ready for deployment!"
  echo ""
  info "Next steps:"
  echo "  1. Update .env with your OBS password (if using OBS backend)"
  echo "  2. Run tests: ./scripts/test.sh"
  echo "  3. Start gateway: ./scripts/start.sh (dev) or ./scripts/start-prod.sh (prod)"
  echo "  4. Configure your AI tools to use: http://localhost:3000/sse"
  echo ""
  info "For more information, see:"
  echo "  - DEPLOYMENT_READY.md - Quick deployment checklist"
  echo "  - README.md - User guide"
  echo "  - DEPLOYMENT.md - Complete deployment guide"
  exit 0
fi
