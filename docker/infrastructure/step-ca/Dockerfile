FROM node:18-alpine

# Install dependencies
RUN apk add --no-cache wget curl

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY src/ ./src/
COPY generate-cdn-assets.js ./
COPY start-with-cdn-assets.sh ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Make startup script executable
RUN chmod +x /app/start-with-cdn-assets.sh

# Change ownership
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:8080/health || exit 1

# Start the application with CDN asset generation
CMD ["./start-with-cdn-assets.sh"]
