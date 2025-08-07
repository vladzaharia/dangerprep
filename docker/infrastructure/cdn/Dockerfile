# Simple build for CDN service
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY src/ ./src/
COPY assets/ ./assets/

# Assets are ready - compression will be done on-the-fly by Nginx

# Production stage
FROM caddy:alpine

# Install Node.js for the API service
RUN apk add --no-cache nodejs supervisor wget curl

# Copy Caddy configuration
COPY Caddyfile /etc/caddy/Caddyfile

# Copy pre-compressed assets from builder
COPY --from=builder /app/assets /usr/share/caddy/assets

# Set up Node.js API service
WORKDIR /app

# Copy application and dependencies from builder
COPY --from=builder /app/src ./src
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copy supervisor configuration
COPY supervisord.conf /etc/supervisord.conf

# Create non-root user for Node.js
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

# Create log directories
RUN mkdir -p /var/log/supervisor /var/log/cdn && \
    chown -R nodejs:nodejs /var/log/cdn

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/health || exit 1

# Start both Nginx and Node.js with supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
