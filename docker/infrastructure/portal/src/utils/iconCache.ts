// Duotone Solid icons (preferred for services and specific use cases)
import {
  faEthernet,
  faPowerOff,
  faQrcode,
  faWindowRestore,
  faRocket,
  faCodeBranch,
  faFolderTree,
  faCloudArrowDown as faCloudArrowDownSolid,
  faRotate,
  faCertificate,
  faNetworkWired,
  faFilm,
  faGamepadModern,
  faBook,
  faBookOpen,
  faBox,
  faServer,
  faRainbowHalf,
  faRouter,
  faGaugeHigh,
  faMagnifyingGlass,
  faCloud,
  faChevronsUp,
  faChevronsDown,
  faTerminal,
  faRoute,
  faPlugCircleCheck,
  faCodeCompare,
  faUsers,
  faSatelliteDish,
  faArrowsRotate,
  faDesktop,
} from '@awesome.me/kit-a765fc5647/icons/duotone/solid';
// Utility Duotone Semibold icons (primary icon set)
import {
  faMusic,
  faPlay,
  faCircleInfo,
  faCircleExclamation,
  faShieldHalved,
  faShieldCheck,
  faRadio,
  faGear,
  faDatabase,
  faChartPie,
  faGlobe,
  faMap,
  faCompass,
  faLocationDot,
  faSignal,
  faBug,
  faUser,
  faArrowUp,
  faArrowDown,
  faArrowRightFromBracket,
  faCircle,
  faGrid2,
  faHouse,
  faWrench,
  faCircleQuestion,
  faComputerClassic,
  faLink,
  faBolt,
  faKey,
  faCloudArrowUp,
  faCloudArrowDown,
  faHardDrive,
  faTag,
} from '@awesome.me/kit-a765fc5647/icons/utility-duo/semibold';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

/**
 * FontAwesome icon cache
 * Pre-caches all icons used across the UI to ensure they're available offline
 * Prefers Utility Duotone icons, falls back to Duotone Solid when needed
 */
export class IconCache {
  private static iconMap: Record<string, IconDefinition> = {
    // Media & Entertainment
    film: faFilm,
    music: faMusic,
    gamepad: faGamepadModern,
    book: faBook,
    'book-open': faBookOpen,
    play: faPlay,

    // Information & Status
    info: faCircleInfo,
    'exclamation-triangle': faCircleExclamation,
    'question-circle': faCircleQuestion,

    // Security & Protection
    'shield-check': faShieldCheck,
    'shield-halved': faShieldHalved,
    'first-aid': faCircleExclamation,
    radio: faRadio,

    // System & Infrastructure
    gear: faGear,
    server: faServer,
    database: faDatabase,
    box: faBox,
    wrench: faWrench,
    bug: faBug,
    rocket: faRocket,
    'hard-drive': faHardDrive,

    // Network & Connectivity
    wifi: faRainbowHalf,
    ethernet: faEthernet,
    link: faLink,
    globe: faGlobe,
    signal: faSignal,
    router: faRouter,
    'network-wired': faNetworkWired,
    cloud: faCloud,
    'satellite-dish': faSatelliteDish,

    // Navigation & Location
    map: faMap,
    compass: faCompass,
    'location-dot': faLocationDot,
    home: faHouse,

    // Data & Analytics
    'chart-pie': faChartPie,

    // Devices & Computers
    computer: faComputerClassic,
    user: faUser,
    users: faUsers,
    desktop: faDesktop,
    terminal: faTerminal,

    // Arrows & Directions
    'arrow-up': faArrowUp,
    'arrow-down': faArrowDown,
    'external-link': faArrowRightFromBracket,
    'chevrons-up': faChevronsUp,
    'chevrons-down': faChevronsDown,
    'arrows-rotate': faArrowsRotate,
    route: faRoute,

    // Cloud & Transfer
    'cloud-arrow-up': faCloudArrowUp,
    'cloud-arrow-down': faCloudArrowDown,
    key: faKey,
    'gauge-high': faGaugeHigh,
    'magnifying-glass': faMagnifyingGlass,

    // UI Elements
    'power-off': faPowerOff,
    bolt: faBolt,
    'qr-code': faQrcode,
    'grid-2': faGrid2,
    'window-restore': faWindowRestore,
    circle: faCircle,
    tag: faTag,
    'plug-circle-check': faPlugCircleCheck,
    'code-compare': faCodeCompare,

    // Service-specific icons (from Docker labels)
    // Media Services
    jellyfin: faFilm, // Media streaming server
    komga: faBook, // Comic and ebook server (using book icon)

    // Content & Knowledge
    kiwix: faBook, // Offline Wikipedia
    'kiwix-sync': faCloudArrowDownSolid, // Kiwix sync service
    docmost: faBookOpen, // Documentation and knowledge base

    // Gaming
    romm: faGamepadModern, // ROM management for retro gaming

    // Development & Infrastructure
    onedev: faCodeBranch, // Git repository and CI/CD platform
    traefik: faNetworkWired, // Reverse proxy and load balancer
    komodo: faBox, // Docker container management

    // System Services
    wishlist: faServer, // SSH directory and frontdoor
    watchtower: faRotate, // Automatic container updates
    'step-ca': faCertificate, // Internal certificate authority
    cdn: faRocket, // Content delivery network
    dns: faServer, // DNS server (CoreDNS)

    // Sync Services
    'nfs-sync': faFolderTree, // Network file system synchronization
    'offline-sync': faCloudArrowDownSolid, // Offline content synchronization
  };

  /**
   * Get FontAwesome icon by name
   * @param iconName - Icon name (without fa- prefix)
   * @returns FontAwesome icon definition or fallback
   */
  static getIcon(iconName: string): IconDefinition {
    // Normalize icon name (remove fa- prefix if present, convert to lowercase)
    const normalizedName = iconName.toLowerCase().replace(/^fa-/, '');

    return this.iconMap[normalizedName] || this.iconMap['question-circle'] || faCircleQuestion;
  }

  /**
   * Check if an icon exists in the cache
   * @param iconName - Icon name to check
   * @returns True if icon exists in cache
   */
  static hasIcon(iconName: string): boolean {
    const normalizedName = iconName.toLowerCase().replace(/^fa-/, '');
    return normalizedName in this.iconMap;
  }

  /**
   * Get all available icon names
   * @returns Array of available icon names
   */
  static getAvailableIcons(): string[] {
    return Object.keys(this.iconMap);
  }
}

/**
 * Convenience function to get an icon
 * @param iconName - Icon name
 * @returns FontAwesome icon definition
 */
export function getIcon(iconName: string): IconDefinition {
  return IconCache.getIcon(iconName);
}

/**
 * Convenience function to check if an icon exists
 * @param iconName - Icon name
 * @returns True if icon exists
 */
export function hasIcon(iconName: string): boolean {
  return IconCache.hasIcon(iconName);
}
