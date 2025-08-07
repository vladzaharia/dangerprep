# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM node:20-alpine AS base
ARG TARGETPLATFORM
ARG BUILDPLATFORM
ARG TARGETOS
ARG TARGETARCH

# Enable Corepack for proper Yarn version management
RUN corepack enable

# Install turbo globally
RUN yarn global add turbo@^2

FROM --platform=$BUILDPLATFORM base AS builder
RUN apk update && apk add --no-cache libc6-compat
WORKDIR /app

# Copy the entire monorepo
COPY . .

# Generate a partial monorepo with a pruned lockfile for cdn
RUN turbo prune @dangerprep/cdn --docker

FROM base AS installer
RUN apk update && apk add --no-cache \
    libc6-compat \
    python3 \
    make \
    g++

WORKDIR /app

# First install dependencies (as they change less often)
COPY --from=builder /app/out/json/ .
RUN yarn install --immutable

# Build the project and dependencies
COPY --from=builder /app/out/full/ .
RUN turbo run build --filter=@dangerprep/cdn

FROM base AS runner
WORKDIR /app

# Install runtime system dependencies
RUN apk add --no-cache \
    curl \
    wget \
    bash

# Create non-root user with consistent UID/GID
RUN addgroup -g 1001 -S appuser && \
    adduser -S appuser -u 1001 -G appuser

# Copy built application from installer
COPY --from=installer /app/docker/infrastructure/cdn/dist ./dist
COPY --from=installer /app/docker/infrastructure/cdn/assets ./assets
COPY --from=installer /app/node_modules ./node_modules

# Create necessary directories and set permissions
RUN mkdir -p /app/data /app/logs && \
    chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Start the CDN service
CMD ["node", "dist/server.js"]
