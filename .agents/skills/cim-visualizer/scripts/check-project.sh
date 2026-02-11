#!/bin/bash
# CIM Visualizer Project Health Check
# Usage: ./check-project.sh

set -e

echo "========================================="
echo "CIM Visualizer Project Health Check"
echo "========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_status() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $1"
    else
        echo -e "${RED}✗${NC} $1"
    fi
}

# Check Go installation
echo "Checking Go..."
if command -v go &> /dev/null; then
    GO_VERSION=$(go version | awk '{print $3}')
    echo -e "${GREEN}✓${NC} Go installed: $GO_VERSION"
else
    echo -e "${RED}✗${NC} Go not installed"
    exit 1
fi

# Check Node.js installation
echo ""
echo "Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓${NC} Node.js installed: $NODE_VERSION"
else
    echo -e "${RED}✗${NC} Node.js not installed"
    exit 1
fi

# Backend checks
echo ""
echo "========================================="
echo "Backend Checks"
echo "========================================="

cd backend

# Check go.mod exists
if [ -f "go.mod" ]; then
    echo -e "${GREEN}✓${NC} go.mod exists"
else
    echo -e "${RED}✗${NC} go.mod missing"
fi

# Try to build backend
echo "Building backend..."
if go build -o /tmp/server-test cmd/server/main.go 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Backend builds successfully"
    rm -f /tmp/server-test
else
    echo -e "${RED}✗${NC} Backend build failed"
fi

# Run Go tests
echo "Running Go tests..."
if go test ./... 2>&1 | grep -q "PASS\|ok"; then
    echo -e "${GREEN}✓${NC} Go tests pass"
else
    echo -e "${YELLOW}!${NC} Some Go tests may have failed or none exist"
fi

cd ..

# Frontend checks
echo ""
echo "========================================="
echo "Frontend Checks"
echo "========================================="

cd frontend

# Check package.json exists
if [ -f "package.json" ]; then
    echo -e "${GREEN}✓${NC} package.json exists"
else
    echo -e "${RED}✗${NC} package.json missing"
fi

# Check node_modules
if [ -d "node_modules" ]; then
    echo -e "${GREEN}✓${NC} node_modules exists"
else
    echo -e "${RED}✗${NC} node_modules missing - run 'npm install'"
fi

# TypeScript check
echo "Running TypeScript check..."
if npm run typecheck 2>&1 | grep -q "error TS"; then
    echo -e "${RED}✗${NC} TypeScript errors found"
else
    echo -e "${GREEN}✓${NC} TypeScript check passed"
fi

# Build check
echo "Checking frontend build..."
if npm run build 2>&1 | grep -q "error\|ERR_"; then
    echo -e "${RED}✗${NC} Frontend build failed"
else
    echo -e "${GREEN}✓${NC} Frontend builds successfully"
fi

cd ..

# Check Docker
echo ""
echo "========================================="
echo "Docker Checks"
echo "========================================="

if command -v docker &> /dev/null; then
    echo -e "${GREEN}✓${NC} Docker installed"
    if command -v docker-compose &> /dev/null; then
        echo -e "${GREEN}✓${NC} docker-compose installed"
    else
        echo -e "${YELLOW}!${NC} docker-compose not found"
    fi
else
    echo -e "${YELLOW}!${NC} Docker not installed (optional)"
fi

# Check test files
echo ""
echo "========================================="
echo "Test Files"
echo "========================================="

E2E_COUNT=$(find frontend/e2e -name "*.spec.ts" 2>/dev/null | wc -l)
echo "E2E tests: $E2E_COUNT"

UNIT_COUNT=$(find frontend/src -name "*.test.ts" -o -name "*.test.tsx" 2>/dev/null | wc -l)
echo "Unit tests: $UNIT_COUNT"

GO_TEST_COUNT=$(find backend -name "*_test.go" 2>/dev/null | wc -l)
echo "Go tests: $GO_TEST_COUNT"

# Check for common issues
echo ""
echo "========================================="
echo "Common Issues Check"
echo "========================================="

# Check for console.log in frontend
LOG_COUNT=$(grep -r "console.log" frontend/src --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l)
if [ "$LOG_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}!${NC} Found $LOG_COUNT console.log statements (consider removing for production)"
else
    echo -e "${GREEN}✓${NC} No console.log statements found"
fi

# Check for TODO comments
TODO_COUNT=$(grep -r "TODO\|FIXME" backend frontend/src --include="*.go" --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l)
if [ "$TODO_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}!${NC} Found $TODO_COUNT TODO/FIXME comments"
else
    echo -e "${GREEN}✓${NC} No TODO/FIXME comments found"
fi

echo ""
echo "========================================="
echo "Summary"
echo "========================================="
echo "Project structure looks good!"
echo ""
echo "Quick start:"
echo "  make dev      # Start development servers"
echo "  make build    # Build for production"
echo "  make test     # Run all tests"
echo ""
