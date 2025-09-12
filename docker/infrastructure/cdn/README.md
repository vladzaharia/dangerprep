# DangerPrep High-Performance CDN

Self-hosted CDN with dynamic library discovery, serving Web Awesome, Font Awesome, and future assets with enterprise-grade performance and caching.

## Architecture

**Hybrid Design:**
- **Nginx** - High-performance static file serving with advanced caching
- **Node.js API** - Dynamic library discovery and metadata management
- **Multi-stage Build** - Optimized container with pre-compressed assets

**Service:**
- **URL**: https://cdn.danger
- **Purpose**: High-performance asset delivery with dynamic configuration

## API Endpoints

**Dynamic Library Discovery:**
- `GET /api/libraries` - Get all available libraries
- `GET /api/library/{id}` - Get specific library information
- `GET /health` - Service health and metrics

**Static Asset Serving:**
- `GET /{library}/{path}` - Serve static assets with aggressive caching
- `GET /` - Dynamic homepage with library listings

## Performance Features

**Caching Strategy:**
- Static Assets: 1-year immutable cache headers
- API Responses: 5-minute cache with ETags
- Pre-compression: Gzip + Brotli for all text assets

**Security & Performance:**
- Rate Limiting: API (10 req/s) and Assets (100 req/s) per IP
- CORS Headers and Security Headers (CSP, X-Frame-Options)
- HTTP/2 Ready via Traefik reverse proxy

## Setup

```bash
# Start CDN service
docker compose -f docker/infrastructure/cdn/compose.yml up -d

# Verify assets
wget --spider https://cdn.danger/webawesome/dist/styles/webawesome.css
wget --spider https://cdn.danger/fontawesome/css/all.min.css
```

**Update Applications:**
Replace external CDN URLs:
```html
<!-- Before -->
<link rel="stylesheet" href="https://early.webawesome.com/webawesome@3.0.0-beta.4/dist/styles/webawesome.css">

<!-- After -->
<link rel="stylesheet" href="https://cdn.danger/webawesome/dist/styles/webawesome.css">
```

## Usage Examples

### Web Awesome Components
```html
<link rel="stylesheet" href="https://cdn.danger/webawesome/dist/styles/webawesome.css">
<script type="module" src="https://cdn.danger/webawesome/dist/webawesome.loader.js"></script>

<wa-button variant="primary">
    <wa-icon name="download"></wa-icon>
    Download
</wa-button>
```

### Font Awesome Icons
```html
<link rel="stylesheet" href="https://cdn.danger/fontawesome/css/all.min.css">

<i class="fas fa-download"></i> Download
<i class="fab fa-github"></i> GitHub
```

## Monitoring

```bash
# Health check
wget -qO- https://cdn.danger/health

# View logs
docker compose -f docker/infrastructure/cdn/compose.yml logs -f cdn

# Verify assets
wget -qO- https://cdn.danger/webawesome/dist/styles/webawesome.css | head -5
```

## Troubleshooting

**Common Issues:**
1. **Assets not loading** - Verify DNS resolution and asset existence
2. **CORS errors** - Check nginx CORS headers configuration
3. **Cache issues** - Clear browser cache and check nginx headers

**Debug Commands:**
```bash
docker compose -f docker/infrastructure/cdn/compose.yml ps
docker compose -f docker/infrastructure/cdn/compose.yml logs cdn
wget -S https://cdn.danger/webawesome/dist/styles/webawesome.css
```

## Benefits

- **Offline Operation** - No internet required for frontend assets
- **Performance** - Local assets load faster than external CDNs
- **Reliability** - No dependency on external services
- **Security** - All assets served over HTTPS with proper headers
