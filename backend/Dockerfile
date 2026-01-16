# Build stage
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY . .

# Build
RUN mkdir -p /app/config
RUN CGO_ENABLED=0 GOOS=linux go build -o /server ./cmd/server

# Production stage
FROM alpine:3.19

WORKDIR /app

# Copy binary
COPY --from=builder /server .

# Copy config directory (create if it doesn't exist to avoid copy error)
RUN mkdir -p config
COPY --from=builder /app/config* ./config/

EXPOSE 8080

CMD ["./server"]
