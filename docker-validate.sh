#!/bin/bash
# Docker Infrastructure Validation Script

set -e

echo "==================================="
echo "MCP Gateway Docker Validation"
echo "==================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check functions
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} Found: $1"
        return 0
    else
        echo -e "${RED}✗${NC} Missing: $1"
        return 1
    fi
}

check_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} Found directory: $1"
        return 0
    else
        echo -e "${YELLOW}⚠${NC} Missing directory: $1 (will be created during build)"
        return 0
    fi
}

check_command() {
    if command -v "$1" &> /dev/null; then
        version=$($1 --version 2>&1 | head -n 1)
        echo -e "${GREEN}✓${NC} $1 installed: $version"
        return 0
    else
        echo -e "${RED}✗${NC} $1 not installed"
        return 1
    fi
}

# Validation counters
errors=0

# 1. Check Docker files
echo "1. Checking Docker files..."
check_file "Dockerfile" || ((errors++))
check_file "docker-compose.yml" || ((errors++))
check_file "docker-compose.prod.yml" || ((errors++))
check_file ".dockerignore" || ((errors++))
echo ""

# 2. Check configuration files
echo "2. Checking configuration files..."
check_file ".env.example" || ((errors++))
check_file "registry.example.json" || ((errors++))

if [ -f ".env" ]; then
    echo -e "${GREEN}✓${NC} Found: .env (good for deployment)"
else
    echo -e "${YELLOW}⚠${NC} Missing: .env (copy from .env.example before running)"
fi

if [ -f "registry.json" ]; then
    echo -e "${GREEN}✓${NC} Found: registry.json (good for deployment)"
else
    echo -e "${YELLOW}⚠${NC} Missing: registry.json (copy from registry.example.json before running)"
fi
echo ""

# 3. Check source directories
echo "3. Checking source directories..."
check_dir "server"
check_dir "ui"
check_dir "server/src"
check_dir "ui/src"
echo ""

# 4. Check required commands
echo "4. Checking required commands..."
check_command "docker" || ((errors++))
check_command "docker-compose" || check_command "docker compose" || ((errors++))
echo ""

# 5. Check Docker daemon
echo "5. Checking Docker daemon..."
if docker info &> /dev/null; then
    echo -e "${GREEN}✓${NC} Docker daemon is running"
else
    echo -e "${RED}✗${NC} Docker daemon is not running"
    ((errors++))
fi
echo ""

# 6. Validate Dockerfile syntax
echo "6. Validating Dockerfile..."
if docker build --dry-run . &> /dev/null 2>&1 || true; then
    # Docker doesn't have --dry-run, so we just check if file exists and is readable
    if [ -r "Dockerfile" ]; then
        echo -e "${GREEN}✓${NC} Dockerfile is readable"
    fi
else
    echo -e "${YELLOW}⚠${NC} Could not validate Dockerfile (requires server/ui dirs)"
fi
echo ""

# 7. Check MCP directories
echo "7. Checking MCP storage directories..."
MCP_HOME="$HOME/.mcp"
if [ -d "$MCP_HOME" ]; then
    echo -e "${GREEN}✓${NC} Found: $MCP_HOME"
    check_dir "$MCP_HOME/repos"
    check_dir "$MCP_HOME/cache"
    check_dir "$MCP_HOME/logs"
    check_dir "$MCP_HOME/tokens"
else
    echo -e "${YELLOW}⚠${NC} $MCP_HOME not found (will be created automatically)"
    echo "   You can create it manually with:"
    echo "   mkdir -p $MCP_HOME/{repos,cache,logs,tokens}"
fi
echo ""

# 8. Summary
echo "==================================="
echo "Validation Summary"
echo "==================================="
if [ $errors -eq 0 ]; then
    echo -e "${GREEN}✓ All critical checks passed!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Create server/ and ui/ directories with package.json and source code"
    echo "  2. Copy .env.example to .env and fill in secrets"
    echo "  3. Copy registry.example.json to registry.json"
    echo "  4. Run: docker-compose up"
else
    echo -e "${RED}✗ Found $errors error(s)${NC}"
    echo ""
    echo "Please fix the errors above before proceeding."
    exit 1
fi

echo ""
echo "Documentation:"
echo "  - DOCKER.md - Comprehensive deployment guide"
echo "  - CLAUDE.md - Project architecture and details"
echo ""
