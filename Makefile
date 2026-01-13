# PLC Log Visualizer - Development Makefile

.PHONY: dev dev-backend dev-frontend clean build

# Run both backend and frontend in parallel
dev:
	@echo "Starting development servers..."
	@make -j2 dev-backend dev-frontend

# Run Go backend server
dev-backend:
	@echo "Starting Go backend on :8080..."
	cd backend && go run cmd/server/main.go

# Run Vite frontend dev server
dev-frontend:
	@echo "Starting Vite frontend on :5173..."
	cd frontend && npm run dev

# Build production bundles
build:
	@echo "Building production..."
	cd backend && go build -o ../dist/server cmd/server/main.go
	cd frontend && npm run build

# Clean build artifacts
clean:
	rm -rf dist/
	rm -rf frontend/dist/
	rm -rf frontend/node_modules/

# Run Go tests
test-backend:
	cd backend && go test ./...

# Run frontend type check
check-frontend:
	cd frontend && npm run build -- --mode=check
