import {
  faFilm,
  faMusic,
  faGamepadModern,
  faBook,
  faBookOpen,
  faPlay,
  faCircleInfo,
  faCircleExclamation,
  faShieldHalved,
  faShieldCheck,
  faRadio,
  faGear,
  faServer,
  faWifi,
  faDatabase,
  faChartPie,
  faBox,
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
} from '@awesome.me/kit-a765fc5647/icons/utility-duo/semibold';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

/**
 * Comprehensive FontAwesome icon cache for emergency/travel use case
 * Pre-caches commonly used icons to ensure they're available offline
 * Using FontAwesome Pro Utility Duotone icons
 */
export class IconCache {
  private static iconMap: Record<string, IconDefinition> = {
    // Media & Entertainment
    film: faFilm,
    music: faMusic,
    gamepad: faGamepadModern,
    book: faBook,
    'book-open': faBookOpen,
    'play-circle': faPlay, // Using play as fallback for play-circle
    play: faPlay,

    // Information & Emergency
    info: faCircleInfo, // Using circle-info as fallback for info
    'info-circle': faCircleInfo,
    'exclamation-triangle': faCircleExclamation, // Using circle-exclamation as fallback
    'shield-alt': faShieldHalved,
    'shield-check': faShieldCheck,
    'first-aid': faCircleExclamation, // Using circle-exclamation as fallback for first-aid
    radio: faRadio,

    // System & Maintenance
    'screwdriver-wrench': faWrench, // Using wrench as fallback
    gear: faGear,
    server: faServer,
    'network-wired': faWifi, // Using wifi as fallback for network-wired
    database: faDatabase,
    'chart-line': faChartPie, // Using chart-pie as fallback for chart-line
    box: faBox,

    // Navigation & Connectivity
    wifi: faWifi,
    globe: faGlobe,
    map: faMap,
    compass: faCompass,
    'location-dot': faLocationDot,
    satellite: faSignal, // Using signal as fallback for satellite
    signal: faSignal,
    ethernet: faLink,
    link: faLink,

    // Development & Documentation
    'code-branch': faCircle, // Using circle as fallback for code-branch
    'file-text': faCircle, // Using circle as fallback for file-text
    terminal: faCircle, // Using circle as fallback for terminal
    bug: faBug,

    // Network & Device Information
    fingerprint: faUser, // Using user as fallback for fingerprint
    'arrow-up': faArrowUp,
    'arrow-down': faArrowDown,
    'arrow-right-from-bracket': faArrowRightFromBracket,
    route: faCompass, // Using compass as fallback for route
    computer: faComputerClassic,

    // Additional common icons
    activity: faChartPie, // Alias for chart-line (using chart-pie as fallback)
    'git-branch': faCircle, // Alias for code-branch (using circle as fallback)
    'external-link': faArrowRightFromBracket, // Using arrow-right-from-bracket as fallback
    'power-off': faBolt,
    bolt: faBolt,
    'qr-code': faGrid2, // Using grid-2 as fallback for qr-code
    home: faHouse,
    cog: faGear, // Alternative to gear
    wrench: faWrench,
    tools: faWrench, // Using wrench as fallback for tools

    // Fallback icon
    'question-circle': faCircleQuestion,
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

  /**
   * Get icon categories for documentation/debugging
   * @returns Object with categorized icon names
   */
  static getIconCategories() {
    return {
      'Media & Entertainment': ['film', 'music', 'gamepad', 'book', 'book-open', 'play-circle'],
      'Information & Emergency': [
        'info',
        'info-circle',
        'exclamation-triangle',
        'shield-alt',
        'first-aid',
        'radio',
      ],
      'System & Maintenance': [
        'screwdriver-wrench',
        'gear',
        'server',
        'network-wired',
        'database',
        'chart-line',
        'box',
      ],
      'Navigation & Connectivity': ['wifi', 'globe', 'map', 'compass', 'satellite'],
      'Development & Documentation': ['code-branch', 'file-text', 'terminal', 'bug'],
      Common: [
        'activity',
        'git-branch',
        'external-link',
        'power-off',
        'qr-code',
        'home',
        'cog',
        'wrench',
        'tools',
      ],
      Fallback: ['question-circle'],
    };
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
