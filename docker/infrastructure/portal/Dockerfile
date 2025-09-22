# =============================================================================
# DANGERPREP PORTAL - DEVELOPMENT SERVER
# =============================================================================
# Single-stage build running Vite dev server for development
# =============================================================================

FROM node:20-alpine

# Set working directory
WORKDIR /app

# Enable Yarn v4 (Berry)
RUN corepack enable

# Copy package files and Yarn configuration
COPY package.json ./

# Install dependencies with Yarn v4
RUN yarn install --immutable && yarn cache clean

# Copy source code
COPY . .

# Expose port 3000 (Vite dev server default)
EXPOSE 3000

# Health check for dev server
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Start Vite dev server
CMD ["yarn", "dev"]
