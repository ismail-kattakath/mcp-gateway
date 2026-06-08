#!/usr/bin/env bash
# Quality gate reminder for MCP Gateway
# Runs on Stop event to remind about validation before pushing

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Before pushing changes, consider running:"
echo "   /validate-all"
echo ""
echo "This will validate:"
echo "  ✓ Test suite (124+ tests, 77%+ coverage)"
echo "  ✓ Docker build and runtime"
echo "  ✓ Pre-commit hooks"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
