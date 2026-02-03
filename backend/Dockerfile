# Build stage - use Debian for glibc compatibility (DuckDB requires glibc)
FROM golang:1.24-bookworm AS builder

# Install build dependencies for DuckDB (requires CGO)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ libc-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY . .

# Build with CGO enabled for DuckDB
RUN mkdir -p /app/config
RUN CGO_ENABLED=1 GOOS=linux go build -o /server ./cmd/server

# Production stage - use Debian slim for glibc runtime
FROM debian:bookworm-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy binary
COPY --from=builder /server .

# Copy config directory (create if it doesn't exist to avoid copy error)
RUN mkdir -p config
COPY --from=builder /app/config* ./config/

# Copy defaults directory for persistent default maps and rules
COPY data/defaults ./data/defaults/

EXPOSE 8089

CMD ["./server"]
