/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WIFI_SSID: string;
  readonly VITE_WIFI_PASSWORD: string;
  readonly VITE_JELLYFIN_URL: string;
  readonly VITE_KIWIX_URL: string;
  readonly VITE_ROMM_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// WebAwesome component type declarations
// Based on the official WebAwesome documentation and component APIs
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'wa-callout': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        size?: 'small' | 'medium' | 'large';
        appearance?: 'filled' | 'outlined' | 'filled outlined' | 'plain';
      };
      'wa-qr-code': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        value?: string;
        fill?: string;
        background?: string;
        size?: number;
        label?: string;
      };
      'wa-card': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        appearance?: 'filled' | 'outlined' | 'filled outlined' | 'plain' | 'accent';
      };
      'wa-icon': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        name?: string;
        variant?: 'solid' | 'regular' | 'light' | 'thin' | 'duotone' | 'brands';
        library?: string;
        label?: string;
      };
      'wa-button': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        variant?: 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'neutral';
        size?: 'small' | 'medium' | 'large';
        appearance?: 'filled' | 'outlined' | 'plain';
        pill?: boolean;
        disabled?: boolean;
      };
    }
  }
}
