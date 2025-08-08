# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM node:22-alpine AS base
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

# Generate a partial monorepo with a pruned lockfile for step-ca
RUN turbo prune @dangerprep/step-ca --docker

FROM base AS installer
RUN apk update && apk add --no-cache \
    libc6-compat \
    wget \
    curl \
    bash

WORKDIR /app

# First install dependencies (as they change less often)
COPY --from=builder /app/out/json/ .
RUN yarn install --immutable

# Build the project and dependencies
COPY --from=builder /app/out/full/ .
RUN turbo run build --filter=@dangerprep/step-ca

FROM base AS runner
WORKDIR /app

# Install runtime system dependencies
RUN apk add --no-cache \
    wget \
    curl \
    bash

# Create non-root user with consistent UID/GID
RUN addgroup -g 1001 -S appuser && \
    adduser -S appuser -u 1001 -G appuser

# Copy built application from installer
COPY --from=installer /app/docker/infrastructure/step-ca/dist ./dist
COPY --from=installer /app/docker/infrastructure/step-ca/start-with-cdn-assets.sh ./
COPY --from=installer /app/node_modules ./node_modules

# Make script executable and set permissions
RUN chmod +x start-with-cdn-assets.sh && \
    mkdir -p /app/data /app/logs && \
    chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Start the application with CDN asset generation
CMD ["./start-with-cdn-assets.sh"]
