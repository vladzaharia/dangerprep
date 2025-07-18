FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache \
    rsync \
    nfs-utils \
    curl \
    wget \
    bash

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

# Create non-root user
RUN addgroup -g 1001 -S sync && \
    adduser -S sync -u 1001 -G sync

# Change ownership of app directory
RUN chown -R sync:sync /app

# Switch to non-root user
USER sync

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('./dist/sync-engine').SyncEngine.prototype.healthCheck().then(h => process.exit(h.status === 'healthy' ? 0 : 1))" || exit 1

# Run sync engine
CMD ["node", "dist/sync-engine.js"]
