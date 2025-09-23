/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WIFI_SSID: string;
  readonly VITE_WIFI_PASSWORD: string;
  readonly VITE_JELLYFIN_URL: string;
  readonly VITE_KIWIX_URL: string;
  readonly VITE_ROMM_URL: string;
  readonly VITE_DOCMOST_URL: string;
  readonly VITE_ONEDEV_URL: string;
  readonly VITE_TRAEFIK_URL: string;
  readonly VITE_KOMODO_URL: string;
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
