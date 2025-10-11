# =============================================================================
# DANGERPREP PORTAL - DEVELOPMENT SERVER
# =============================================================================
# Multi-stage build with monorepo support for workspace dependencies
# =============================================================================

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

# Generate a partial monorepo with a pruned lockfile for portal
RUN turbo prune @dangerprep/portal --docker

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

# Copy source code for development
COPY --from=builder /app/out/full/ .

# Copy the scripts directory that turbo prune excludes (needed for build process)
COPY --from=builder /app/docker/infrastructure/portal/scripts ./docker/infrastructure/portal/scripts

FROM base AS runner
WORKDIR /app

# Install runtime system dependencies including network tools
RUN apk add --no-cache \
    wget \
    curl \
    bash \
    iproute2 \
    wireless-tools \
    iw \
    ethtool \
    bind-tools

# Note: Tailscale CLI not installed in container
# Tailscale interfaces will be detected through host network access
# Tailscale status commands will gracefully fail if not available

# Copy the entire workspace structure to maintain Yarn workspace functionality
COPY --from=installer /app ./

# Set permissions and create necessary directories
RUN mkdir -p /app/logs

# Note: Running as root to access host network interfaces
# The compose.yml file specifies user: root for network access

# Set working directory to the portal service
WORKDIR /app/docker/infrastructure/portal

# Expose port 3000 (Vite dev server default)
EXPOSE 3000

# Health check for dev server
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Build the application
RUN yarn build

# Start production server
CMD ["yarn", "start"]
