# Build stage
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY . .

# Build
RUN CGO_ENABLED=0 GOOS=linux go build -o /server ./cmd/server

# Production stage
FROM alpine:3.19

WORKDIR /app

# Copy binary
COPY --from=builder /server .

# Copy config if exists
COPY --from=builder /app/config ./config 2>/dev/null || true

EXPOSE 8080

CMD ["./server"]
