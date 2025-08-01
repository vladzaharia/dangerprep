FROM node:18-alpine AS base

# Install turbo globally
RUN npm install -g turbo@^2

FROM base AS builder
RUN apk update
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy the entire monorepo
COPY . .

# Generate a partial monorepo with a pruned lockfile for offline-sync
RUN turbo prune @dangerprep/offline-sync --docker

FROM base AS installer
RUN apk update
RUN apk add --no-cache libc6-compat

# Install offline-sync specific system dependencies (including build tools for native modules)
RUN apk add --no-cache \
    rsync \
    curl \
    wget \
    bash \
    util-linux \
    udisks2 \
    dbus \
    eudev \
    libudev \
    libusb \
    build-base \
    python3 \
    make \
    g++

WORKDIR /app

# First install dependencies (as they change less often)
COPY --from=builder /app/out/json/ .
RUN npm ci --frozen-lockfile

# Build the project and dependencies
COPY --from=builder /app/out/full/ .
RUN turbo run build --filter=@dangerprep/offline-sync

FROM base AS runner
WORKDIR /app

# Install runtime system dependencies (no build tools needed)
RUN apk add --no-cache \
    rsync \
    curl \
    wget \
    bash \
    util-linux \
    udisks2 \
    dbus \
    eudev \
    libudev \
    libusb

# Create non-root user with consistent UID/GID
RUN addgroup -g 1001 -S appuser && \
    adduser -S appuser -u 1001 -G appuser

# Add user to necessary groups for device access
RUN addgroup appuser disk && \
    addgroup appuser plugdev

# Copy the built application
COPY --from=installer --chown=appuser:appuser /app/docker/sync/offline-sync/dist ./dist
COPY --from=installer --chown=appuser:appuser /app/docker/sync/offline-sync/package.json ./package.json

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
