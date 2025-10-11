import * as solidIcons from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

/**
 * Comprehensive FontAwesome icon cache for emergency/travel use case
 * Pre-caches commonly used icons to ensure they're available offline
 */
export class IconCache {
  private static iconMap: Record<string, IconDefinition> = {
    // Media & Entertainment
    'film': solidIcons.faFilm,
    'music': solidIcons.faMusic,
    'gamepad': solidIcons.faGamepad,
    'book': solidIcons.faBook,
    'book-open': solidIcons.faBookOpen,
    'play-circle': solidIcons.faPlayCircle,

    // Information & Emergency
    'info': solidIcons.faInfo,
    'info-circle': solidIcons.faInfoCircle,
    'exclamation-triangle': solidIcons.faExclamationTriangle,
    'shield-alt': solidIcons.faShieldAlt,
    'first-aid': solidIcons.faFirstAid,
    'radio': solidIcons.faRadio,

    // System & Maintenance
    'screwdriver-wrench': solidIcons.faScrewdriverWrench,
    'gear': solidIcons.faGear,
    'server': solidIcons.faServer,
    'network-wired': solidIcons.faNetworkWired,
    'database': solidIcons.faDatabase,
    'chart-line': solidIcons.faChartLine,
    'box': solidIcons.faBox,

    // Navigation & Connectivity
    'wifi': solidIcons.faWifi,
    'globe': solidIcons.faGlobe,
    'map': solidIcons.faMap,
    'compass': solidIcons.faCompass,
    'satellite': solidIcons.faSatellite,

    // Development & Documentation
    'code-branch': solidIcons.faCodeBranch,
    'file-text': solidIcons.faFileAlt,
    'terminal': solidIcons.faTerminal,
    'bug': solidIcons.faBug,

    // Additional common icons
    'activity': solidIcons.faChartLine, // Alias for chart-line
    'git-branch': solidIcons.faCodeBranch, // Alias for code-branch
    'external-link': solidIcons.faExternalLinkAlt,
    'power-off': solidIcons.faPowerOff,
    'qr-code': solidIcons.faQrcode,
    'home': solidIcons.faHome,
    'cog': solidIcons.faCog, // Alternative to gear
    'wrench': solidIcons.faWrench,
    'tools': solidIcons.faTools,

    // Fallback icon
    'question-circle': solidIcons.faQuestionCircle,
  };

  /**
   * Get FontAwesome icon by name
   * @param iconName - Icon name (without fa- prefix)
   * @returns FontAwesome icon definition or fallback
   */
  static getIcon(iconName: string): IconDefinition {
    // Normalize icon name (remove fa- prefix if present, convert to lowercase)
    const normalizedName = iconName.toLowerCase().replace(/^fa-/, '');

    return this.iconMap[normalizedName] || this.iconMap['question-circle'] || solidIcons.faQuestionCircle;
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
      'Media & Entertainment': [
        'film', 'music', 'gamepad', 'book', 'book-open', 'play-circle'
      ],
      'Information & Emergency': [
        'info', 'info-circle', 'exclamation-triangle', 'shield-alt', 'first-aid', 'radio'
      ],
      'System & Maintenance': [
        'screwdriver-wrench', 'gear', 'server', 'network-wired', 'database', 'chart-line', 'box'
      ],
      'Navigation & Connectivity': [
        'wifi', 'globe', 'map', 'compass', 'satellite'
      ],
      'Development & Documentation': [
        'code-branch', 'file-text', 'terminal', 'bug'
      ],
      'Common': [
        'activity', 'git-branch', 'external-link', 'power-off', 'qr-code', 'home', 'cog', 'wrench', 'tools'
      ],
      'Fallback': [
        'question-circle'
      ]
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
