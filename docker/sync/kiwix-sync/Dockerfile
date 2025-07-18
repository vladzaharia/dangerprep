FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache \
    curl \
    wget \
    aria2 \
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

# Make CLI executable
RUN chmod +x dist/cli.js && \
    ln -s /app/dist/cli.js /usr/local/bin/kiwix-cli

# Create non-root user
RUN addgroup -g 1001 -S kiwix && \
    adduser -S kiwix -u 1001 -G kiwix

# Change ownership of app directory
RUN chown -R kiwix:kiwix /app

# Switch to non-root user
USER kiwix

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('./dist/kiwix-manager').KiwixManager.prototype.healthCheck().then(h => process.exit(h.status === 'healthy' ? 0 : 1))" || exit 1

# Run kiwix manager
CMD ["node", "dist/kiwix-manager.js"]
