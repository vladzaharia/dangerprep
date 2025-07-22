FROM node:18-alpine

# Install system dependencies for USB detection and mounting
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

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Create data directory
RUN mkdir -p /app/data/logs

# Make CLI executable
RUN chmod +x dist/cli.js && \
    ln -s /app/dist/cli.js /usr/local/bin/offline-sync-cli

# Create non-root user
RUN addgroup -g 1001 -S offlinesync && \
    adduser -S offlinesync -u 1001 -G offlinesync

# Add user to necessary groups for device access
RUN addgroup offlinesync disk && \
    addgroup offlinesync plugdev

# Change ownership of app directory
RUN chown -R offlinesync:offlinesync /app

# Switch to non-root user
USER offlinesync

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('./dist/offline-sync').OfflineSync.prototype.healthCheck().then(h => process.exit(h.status === 'healthy' ? 0 : 1))" || exit 1

# Run offline sync service
CMD ["node", "dist/offline-sync.js"]
