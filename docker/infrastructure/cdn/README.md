# DangerPrep High-Performance CDN

This service provides an optimized, self-hosted CDN with dynamic library discovery, serving Web Awesome, Font Awesome, and future assets with enterprise-grade performance and caching.

## Architecture

### Hybrid Design
- **Nginx**: High-performance static file serving with advanced caching
- **Node.js API**: Dynamic library discovery and metadata management
- **Supervisor**: Process management for both services
- **Multi-stage Build**: Optimized container with pre-compressed assets

### cdn
- **Base Image**: `nginx:alpine` + `node:18-alpine`
- **URL**: https://cdn.danger
- **Purpose**: High-performance asset delivery with dynamic configuration
- **Assets**: `./assets/` directory with automatic discovery

## API Endpoints

### Dynamic Library Discovery
- **List Libraries**: `GET /api/libraries` - Get all available libraries
- **Library Details**: `GET /api/library/{id}` - Get specific library information
- **Library Endpoints**: `GET /api/library/{id}/endpoints` - Get library-specific endpoints
- **Health Check**: `GET /health` - Service health and metrics

### Static Asset Serving
- **Library Assets**: `GET /{library}/{path}` - Serve static assets with aggressive caching
- **Homepage**: `GET /` - Dynamic homepage with library listings

## Performance Features

### Caching Strategy
- **Static Assets**: 1-year immutable cache headers
- **API Responses**: 5-minute cache with ETags
- **Pre-compression**: Gzip + Brotli for all text assets
- **File Descriptor Caching**: Nginx open_file_cache optimization

### Security & Performance
- **Rate Limiting**: API (10 req/s) and Assets (100 req/s) per IP
- **CORS Headers**: Proper cross-origin resource sharing
- **Security Headers**: CSP, X-Frame-Options, X-Content-Type-Options
- **HTTP/2 Ready**: Via Traefik reverse proxy

## Setup Instructions

### 1. Start the CDN Service
```bash
docker compose -f docker/infrastructure/cdn/compose.yml up -d
```

### 2. Verify Assets
Check that the required assets are available:
```bash
# Web Awesome
curl -I https://cdn.danger/webawesome/dist/styles/webawesome.css

# Font Awesome
curl -I https://cdn.danger/fontawesome/css/all.min.css
```

### 3. Update Applications
Replace external CDN URLs with local ones:

**Before:**
```html
<link rel="stylesheet" href="https://early.webawesome.com/webawesome@3.0.0-beta.4/dist/styles/webawesome.css">
```

**After:**
```html
<link rel="stylesheet" href="https://cdn.danger/webawesome/dist/styles/webawesome.css">
```

## Features

### Performance
- **Nginx**: High-performance web server optimized for static assets
- **Gzip Compression**: Automatic compression for CSS/JS files
- **Long-term Caching**: 1-year cache headers for immutable assets
- **HTTP/2**: Modern protocol support via Traefik

### Security
- **HTTPS Only**: All assets served over HTTPS via step-ca certificates
- **CORS Headers**: Proper cross-origin resource sharing configuration
- **Security Headers**: X-Frame-Options, X-Content-Type-Options, etc.

### Reliability
- **Health Checks**: Built-in health monitoring
- **Local Assets**: No external dependencies
- **Offline Support**: Works without internet connectivity
- **Auto-restart**: Container restarts automatically on failure

## Directory Structure

```
docker/infrastructure/cdn/
├── compose.yml          # Docker Compose configuration
├── compose.env          # Environment variables
├── nginx.conf           # Nginx configuration
└── README.md           # This file

Assets served from:
├── lib/webawesome/      # Web Awesome assets
└── lib/fontawesome/     # Font Awesome assets
```

## Usage Examples

### Web Awesome Components
```html
<!DOCTYPE html>
<html class="wa-theme-default wa-palette-default wa-brand-blue">
<head>
    <!-- Self-hosted Web Awesome -->
    <link rel="stylesheet" href="https://cdn.danger/webawesome/dist/styles/webawesome.css">
    <link rel="stylesheet" href="https://cdn.danger/webawesome/dist/styles/themes/default.css">
    <link rel="stylesheet" href="https://cdn.danger/webawesome/dist/styles/color/palettes/default.css">
    <script type="module" src="https://cdn.danger/webawesome/dist/webawesome.loader.js"></script>
</head>
<body>
    <wa-button variant="primary">
        <wa-icon name="download"></wa-icon>
        Download
    </wa-button>
</body>
</html>
```

### Font Awesome Icons
```html
<!DOCTYPE html>
<html>
<head>
    <!-- Self-hosted Font Awesome -->
    <link rel="stylesheet" href="https://cdn.danger/fontawesome/css/all.min.css">
</head>
<body>
    <i class="fas fa-download"></i> Download
    <i class="fab fa-github"></i> GitHub
</body>
</html>
```

## Monitoring

### Health Check
```bash
curl https://cdn.danger/health
```

### Logs
```bash
docker compose -f docker/infrastructure/cdn/compose.yml logs -f cdn
```

### Asset Verification
```bash
# Check Web Awesome assets
curl -s https://cdn.danger/webawesome/dist/styles/webawesome.css | head -5

# Check Font Awesome assets
curl -s https://cdn.danger/fontawesome/css/all.min.css | head -5
```

## Troubleshooting

### Common Issues

1. **Assets not loading**
   - Verify DNS resolution for `cdn.danger`
   - Check that assets exist in `/lib/webawesome/` and `/lib/fontawesome/`
   - Verify Traefik routing and certificates

2. **CORS errors**
   - Check nginx CORS headers configuration
   - Verify the requesting domain is allowed

3. **Cache issues**
   - Clear browser cache
   - Check nginx cache headers
   - Verify asset timestamps

### Debug Commands
```bash
# Check container status
docker compose -f docker/infrastructure/cdn/compose.yml ps

# View nginx logs
docker compose -f docker/infrastructure/cdn/compose.yml logs cdn

# Test asset availability
curl -v https://cdn.danger/webawesome/dist/styles/webawesome.css
```

## Benefits

- **Offline Operation**: No internet required for frontend assets
- **Performance**: Local assets load faster than external CDNs
- **Reliability**: No dependency on external services
- **Security**: All assets served over HTTPS with proper headers
- **Consistency**: Same assets across all environments
- **Emergency Ready**: Critical for disaster response scenarios
