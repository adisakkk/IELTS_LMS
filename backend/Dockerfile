# Backend Dockerfile for Railway
# Multi-stage build for Rust API + Worker combined service

# Stage 1: Build Rust application
FROM rust:1.88-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy Cargo.toml files for dependency caching
COPY Cargo.toml ./
COPY crates/api/Cargo.toml ./crates/api/
COPY crates/application/Cargo.toml ./crates/application/
COPY crates/domain/Cargo.toml ./crates/domain/
COPY crates/infrastructure/Cargo.toml ./crates/infrastructure/
COPY crates/worker/Cargo.toml ./crates/worker/

# Create dummy source files to cache dependencies
RUN mkdir -p crates/api/src && echo "fn main() {}" > crates/api/src/main.rs
RUN mkdir -p crates/worker/src && echo "fn main() {}" > crates/worker/src/main.rs
RUN mkdir -p crates/application/src && echo "" > crates/application/src/lib.rs
RUN mkdir -p crates/domain/src && echo "" > crates/domain/src/lib.rs
RUN mkdir -p crates/infrastructure/src && echo "" > crates/infrastructure/src/lib.rs

# Build dependencies
RUN cargo build --release

# Remove dummy files
RUN rm -rf crates/api/src/main.rs
RUN rm -rf crates/worker/src/main.rs
RUN rm -rf crates/application/src/lib.rs
RUN rm -rf crates/domain/src/lib.rs
RUN rm -rf crates/infrastructure/src/lib.rs

# Copy actual source code
COPY crates ./crates

# Build the actual application
RUN cargo build --release

# Stage 2: Runtime image
FROM debian:bookworm-slim AS runner

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy built binaries from builder
COPY --from=builder /app/target/release/ielts-backend-api /app/api
COPY --from=builder /app/target/release/ielts-backend-worker /app/worker

# Create startup script to run both API and worker
RUN cat > /app/start.sh << 'EOF'
#!/bin/bash
set -e

echo "Starting IELTS Backend Service..."

# Start API in background
echo "Starting API server..."
/api &

# Start worker in background
echo "Starting worker process..."
/worker &

# Wait for both processes
wait -n
echo "One process exited, shutting down..."
pkill -P $$ || true
EOF

RUN chmod +x /app/start.sh

# Expose API port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1

# Start both processes
CMD ["/app/start.sh"]
