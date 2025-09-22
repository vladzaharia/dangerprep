# DangerPrep Portal

Modern React 19 portal for DangerPrep hotspot services, built with TypeScript, Vite, and WebAwesome components.

## Features

- **WiFi Connection**: QR code generation for automatic WiFi connection with manual details toggle
- **Service Discovery**: Cards for Jellyfin, Kiwix, and Romm services
- **Responsive Design**: Optimized for both mobile (800x480 touchscreen) and desktop
- **Kiosk Mode**: URL parameter `?kiosk=true` disables clicks for touchscreen display
- **Dark Theme**: WebAwesome Awesome theme with dark mode only
- **Modern Stack**: React 19, TypeScript, Vite, Yarn v4

## Environment Variables

Configure these in `compose.env`:

- `WIFI_SSID`: WiFi network name
- `WIFI_PASSWORD`: WiFi network password  
- `JELLYFIN_URL`: Jellyfin media server URL
- `KIWIX_URL`: Kiwix offline content URL
- `ROMM_URL`: Romm game library URL

## Development

```bash
# Install dependencies
yarn install

# Start development server
yarn dev

# Build for production
yarn build

# Preview production build
yarn preview

# Lint code
yarn lint

# Format code
yarn format
```

## Docker Deployment

The portal is deployed as a Docker service with:

- Multi-stage build (Node.js → nginx)
- Runtime environment variable injection
- Traefik integration for `portal.danger` and `portal.danger.diy`
- Health checks and resource limits

## Usage

### Normal Mode
- Click QR code to toggle manual connection details
- Click service cards to open services in new tabs

### Kiosk Mode (`?kiosk=true`)
- QR code toggle still works for touchscreen interaction
- Service cards show URLs as text (no clicking)
- Optimized for NanoPi M6 touchscreen display

## Architecture

- **React 19**: Latest React with automatic batching and improved performance
- **WebAwesome**: Modern web components with consistent theming
- **Responsive**: CSS Grid and media queries for mobile/desktop layouts
- **Accessible**: ARIA labels, keyboard navigation, semantic HTML
- **Performance**: Code splitting, optimized builds, efficient rendering
