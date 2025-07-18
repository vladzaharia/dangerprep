FROM node:18-alpine

WORKDIR /app

# Install system dependencies for monitoring
RUN apk add --no-cache \
    curl \
    procps

# Copy package files first for better caching
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY . .

# Build the Next.js application
RUN npm run build

# Create data directory
RUN mkdir -p /app/data

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Run the application
CMD ["npm", "start"]
