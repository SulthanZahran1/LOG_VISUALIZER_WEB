#!/bin/bash

# E2E Test Runner with Docker
# This script starts the backend in Docker, runs E2E tests, and cleans up

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_DIR="$PROJECT_ROOT/test-results"
LOG_FILE="$LOG_DIR/e2e-docker-$(date +%Y%m%d-%H%M%S).log"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.e2e.yml"

# Create log directory
mkdir -p "$LOG_DIR"

# Logging function
log() {
    echo -e "$1" | tee -a "$LOG_FILE"
}

# Cleanup function
cleanup() {
    log "${BLUE}🧹 Cleaning up...${NC}"
    cd "$SCRIPT_DIR"
    docker compose -f "$COMPOSE_FILE" down -v 2>&1 | tee -a "$LOG_FILE" || true
    log "${GREEN}✅ Cleanup complete${NC}"
}

# Trap to ensure cleanup on exit
trap cleanup EXIT

log "${BLUE}========================================${NC}"
log "${BLUE}  E2E Test Runner with Docker${NC}"
log "${BLUE}========================================${NC}"
log ""
log "Log file: $LOG_FILE"
log ""

# Check if Docker is running
log "${BLUE}🔍 Checking Docker...${NC}"
if ! docker info > /dev/null 2>&1; then
    log "${RED}❌ Docker is not running. Please start Docker first.${NC}"
    exit 1
fi
log "${GREEN}✅ Docker is running${NC}"
log ""

# Stop any existing containers
log "${BLUE}🛑 Stopping any existing containers...${NC}"
cd "$SCRIPT_DIR"
docker compose -f "$COMPOSE_FILE" down -v 2>&1 | tee -a "$LOG_FILE" || true
log ""

# Start backend
log "${BLUE}🐳 Starting backend container...${NC}"
docker compose -f "$COMPOSE_FILE" up -d --build 2>&1 | tee -a "$LOG_FILE"
log "${GREEN}✅ Backend container started${NC}"
log ""

# Wait for backend to be healthy
log "${BLUE}⏳ Waiting for backend to be healthy...${NC}"
MAX_ATTEMPTS=60
ATTEMPT=0
BACKEND_URL="http://localhost:8089"

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if curl -s "$BACKEND_URL/api/health" > /dev/null 2>&1; then
        log "${GREEN}✅ Backend is healthy${NC}"
        break
    fi
    
    ATTEMPT=$((ATTEMPT + 1))
    echo -n "." | tee -a "$LOG_FILE"
    sleep 1
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    log ""
    log "${RED}❌ Backend failed to become healthy within $MAX_ATTEMPTS seconds${NC}"
    log "${YELLOW}📋 Container logs:${NC}"
    docker compose -f "$COMPOSE_FILE" logs 2>&1 | tee -a "$LOG_FILE"
    exit 1
fi

log ""

# Run E2E tests
log "${BLUE}🎭 Running E2E tests...${NC}"
cd "$PROJECT_ROOT/frontend"

if npm run test:e2e 2>&1 | tee -a "$LOG_FILE"; then
    TEST_EXIT_CODE=${PIPESTATUS[0]}
else
    TEST_EXIT_CODE=${PIPESTATUS[0]}
fi

log ""

# Report results
if [ $TEST_EXIT_CODE -eq 0 ]; then
    log "${GREEN}========================================${NC}"
    log "${GREEN}  ✅ All E2E tests passed!${NC}"
    log "${GREEN}========================================${NC}"
else
    log "${RED}========================================${NC}"
    log "${RED}  ❌ Some E2E tests failed${NC}"
    log "${RED}========================================${NC}"
fi

log ""
log "${BLUE}📁 Full log saved to: $LOG_FILE${NC}"
log ""

exit $TEST_EXIT_CODE
