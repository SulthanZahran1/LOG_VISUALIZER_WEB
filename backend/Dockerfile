# Build stage
FROM golang:1.24-alpine AS builder

# Install build dependencies for DuckDB (requires CGO)
RUN apk add --no-cache gcc musl-dev

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY . .

# Build with CGO enabled for DuckDB
RUN mkdir -p /app/config
RUN CGO_ENABLED=1 GOOS=linux go build -o /server ./cmd/server

# Production stage
FROM alpine:3.19

WORKDIR /app

# Copy binary
COPY --from=builder /server .

# Copy config directory (create if it doesn't exist to avoid copy error)
RUN mkdir -p config
COPY --from=builder /app/config* ./config/

# Copy defaults directory for persistent default maps and rules
# Copy from build context, not builder stage (static assets don't need Go build)
COPY data/defaults ./data/defaults/

EXPOSE 8089

CMD ["./server"]

