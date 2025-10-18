# DangerPrep Portal

Modern React 19 portal for DangerPrep hotspot services, built with TypeScript, Vite, and WebAwesome components.

## Features

- **WiFi Connection**: QR code generation for automatic WiFi connection with manual details toggle
- **Service Discovery**: Cards for Jellyfin, Kiwix, and Romm services
- **SWR Data Fetching**: Efficient data fetching with automatic revalidation on focus and network reconnect (perfect for WiFi hotspot!)
- **Dynamic Configuration**: Runtime environment variable loading via API endpoints
- **Responsive Design**: Optimized for both mobile (800x480 touchscreen) and desktop
- **Kiosk Mode**: URL parameter `?kiosk=true` disables clicks for touchscreen display
- **Auto-Reset**: Automatically returns to homepage 5 minutes after last user interaction
- **Dark Theme**: WebAwesome Awesome theme with dark mode only
- **Modern Stack**: React 19, TypeScript, Vite, Yarn v4, SWR

## Configuration

The portal supports both build-time and runtime configuration. Runtime configuration is preferred as it allows updating settings without rebuilding the application.

### Runtime Configuration (Recommended)

The portal fetches configuration from `/api/config` at runtime, allowing dynamic updates:

#### WiFi Configuration
The portal automatically reads WiFi configuration from the system's hostapd configuration (`/etc/hostapd/hostapd.conf`) with fallback to environment variables:
- `WIFI_SSID`: WiFi network name (fallback only)
- `WIFI_PASSWORD`: WiFi network password (fallback only)

#### Service URL Configuration
The portal uses dynamic URL construction based on a base domain and service subdomains:

- `BASE_DOMAIN`: Base domain for all services (e.g., `argos.surf`, `danger.diy`)

##### Main Services
- `JELLYFIN_SUBDOMAIN`: Jellyfin media server subdomain (default: `media`)
- `KIWIX_SUBDOMAIN`: Kiwix offline content subdomain (default: `kiwix`)
- `ROMM_SUBDOMAIN`: Romm game library subdomain (default: `retro`)

##### Maintenance Services
- `DOCMOST_SUBDOMAIN`: Docmost documentation subdomain (default: `docmost`)
- `ONEDEV_SUBDOMAIN`: OneDev git management subdomain (default: `onedev`)
- `TRAEFIK_SUBDOMAIN`: Traefik dashboard subdomain (default: `traefik`)
- `KOMODO_SUBDOMAIN`: Komodo container management subdomain (default: `docker`)

#### App Configuration
- `VITE_APP_TITLE`: Application title (default: `DangerPrep Portal`)
- `VITE_APP_DESCRIPTION`: Application description

### Build-time Configuration (Fallback)

If the runtime API fails, the portal falls back to build-time environment variables with `VITE_` prefix.

### Example Configuration
```bash
# In compose.env
BASE_DOMAIN=argos.surf
JELLYFIN_SUBDOMAIN=media
# Results in: https://media.argos.surf
```

## API Endpoints

The portal provides several API endpoints for dynamic functionality:

- `GET /api/config` - Runtime configuration (WiFi, services, app settings)
- `GET /api/services` - Service discovery with health checks
- `GET /api/health` - Application health status

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

### Auto-Reset Feature
The portal automatically returns to the homepage after 5 minutes of user inactivity. This feature:
- **Resets on each interaction**: The 5-minute timer resets every time the user interacts with the page
- **5 minutes from LAST interaction**: The countdown is always from the most recent user activity, not from page load
- **Comprehensive activity detection**: Monitors mouse movement, clicks, keyboard input, scrolling, touch gestures, and tab visibility
- **Preserves kiosk mode**: If `?kiosk` is in the URL, it stays in kiosk mode after reset
- **Smart routing**: Redirects to `/qr` in kiosk mode or `/services` in normal mode
- **Optimized performance**: Uses `react-idle-timer` library with 200ms event throttling
- **Development logging**: In development mode, logs user activity to console for debugging
- **Ideal for kiosks**: Perfect for public kiosk displays to reset to the default view

**Events that reset the timer:**
- Mouse: clicks, movement, wheel scrolling
- Keyboard: any key press
- Touch: taps and gestures
- Page: scrolling, tab visibility changes

## Architecture

- **React 19**: Latest React with automatic batching and improved performance
- **WebAwesome**: Modern web components with consistent theming
- **Responsive**: CSS Grid and media queries for mobile/desktop layouts
- **Accessible**: ARIA labels, keyboard navigation, semantic HTML
- **Performance**: Code splitting, optimized builds, efficient rendering
