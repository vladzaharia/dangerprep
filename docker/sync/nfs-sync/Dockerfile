# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM node:18-alpine AS base
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

# Generate a partial monorepo with a pruned lockfile for nfs-sync
RUN turbo prune @dangerprep/nfs-sync --docker

FROM base AS installer
RUN apk update && apk add --no-cache \
    libc6-compat \
    rsync \
    nfs-utils \
    curl \
    wget \
    bash

WORKDIR /app

# First install dependencies (as they change less often)
COPY --from=builder /app/out/json/ .
RUN yarn install --immutable

# Build the project and dependencies
COPY --from=builder /app/out/full/ .
RUN turbo run build --filter=@dangerprep/nfs-sync

FROM base AS runner
WORKDIR /app

# Install runtime system dependencies
RUN apk add --no-cache \
    rsync \
    nfs-utils \
    curl \
    wget \
    bash

# Create non-root user with consistent UID/GID
RUN addgroup -g 1001 -S appuser && \
    adduser -S appuser -u 1001 -G appuser

# Copy the built application and dependencies
COPY --from=installer --chown=appuser:appuser /app/docker/sync/nfs-sync/dist ./dist
COPY --from=installer --chown=appuser:appuser /app/docker/sync/nfs-sync/package.json ./package.json
COPY --from=installer --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=installer --chown=appuser:appuser /app/packages ./packages

# Create data directory
RUN mkdir -p /app/data/logs && \
    chown -R appuser:appuser /app/data

# Switch to non-root user
USER appuser

# Health check using the standardized CLI
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node dist/engine.js health --simple || exit 1

# Run the service using the standardized entry point
CMD ["node", "dist/engine.js"]
