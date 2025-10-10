/// <reference types="vite/client" />

interface ImportMetaEnv {
  // WiFi Configuration (fallback only - prefer runtime API)
  readonly VITE_WIFI_SSID?: string;
  readonly VITE_WIFI_PASSWORD?: string;

  // Service Configuration (fallback only - prefer runtime API)
  readonly VITE_BASE_DOMAIN?: string;
  readonly VITE_JELLYFIN_SUBDOMAIN?: string;
  readonly VITE_KIWIX_SUBDOMAIN?: string;
  readonly VITE_ROMM_SUBDOMAIN?: string;
  readonly VITE_DOCMOST_SUBDOMAIN?: string;
  readonly VITE_ONEDEV_SUBDOMAIN?: string;
  readonly VITE_TRAEFIK_SUBDOMAIN?: string;
  readonly VITE_KOMODO_SUBDOMAIN?: string;

  // App Configuration (fallback only - prefer runtime API)
  readonly VITE_APP_TITLE?: string;
  readonly VITE_APP_DESCRIPTION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// WebAwesome component type declarations
// Based on the official WebAwesome documentation and component APIs
// WebAwesome types are imported via tsconfig.json types array
// Additional type declarations for wa-page component
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'wa-page': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        'mobile-breakpoint'?: string | number;
        'navigation-placement'?: 'start' | 'end';
        'nav-open'?: boolean;
        'disable-navigation-toggle'?: boolean;
        view?: 'mobile' | 'desktop';
      };
    }
  }
}
