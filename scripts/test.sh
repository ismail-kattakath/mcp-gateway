#!/usr/bin/env bash

###############################################################################
# MCP Gateway Test Script
#
# Runs all tests (unit, integration, validation)
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
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

error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

info "Running MCP Gateway Tests"
echo ""

# Track test results
TESTS_PASSED=0
TESTS_FAILED=0

# Run unit tests
info "========================================="
info "Running Unit Tests"
info "========================================="
cd "$PROJECT_DIR/server"
if npm test; then
  success "Unit tests passed"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  error "Unit tests failed"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi
echo ""

# Run registry validation
info "========================================="
info "Running Registry Validation"
info "========================================="
if [ -f "$PROJECT_DIR/registry.json" ]; then
  if npm run validate; then
    success "Registry validation passed"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    error "Registry validation failed"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
else
  warning "registry.json not found, skipping validation"
fi
echo ""

# Run integration tests if available
info "========================================="
info "Running Integration Tests"
info "========================================="
if [ -f "$PROJECT_DIR/server/tests/integration.test.js" ]; then
  if node --test "$PROJECT_DIR/server/tests/integration.test.js"; then
    success "Integration tests passed"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    error "Integration tests failed"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
else
  warning "Integration tests not found, skipping"
fi
echo ""

# Run E2E tests if available
info "========================================="
info "Running E2E Tests"
info "========================================="
if [ -f "$SCRIPT_DIR/e2e-test.sh" ]; then
  if bash "$SCRIPT_DIR/e2e-test.sh"; then
    success "E2E tests passed"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    error "E2E tests failed"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
else
  warning "E2E tests not found, skipping"
fi
echo ""

# Summary
info "========================================="
info "Test Summary"
info "========================================="
success "Tests passed: $TESTS_PASSED"
if [ $TESTS_FAILED -gt 0 ]; then
  error "Tests failed: $TESTS_FAILED"
  exit 1
else
  success "All tests passed!"
  exit 0
fi
