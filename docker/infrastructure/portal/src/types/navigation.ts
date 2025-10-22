import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

import type { IconStyleConfig } from '../utils/iconStyles';

/**
 * Unified navigation and card item interface
 * Used for primary navigation, secondary navigation, settings cards, and power cards
 */
export interface NavigationItem {
  /** Unique identifier for the item */
  id: string;

  /** Display label */
  label: string;

  /** Path for navigation (optional for action-only items) */
  path?: string;

  /** Single icon (mutually exclusive with stackedIcon) */
  icon?: IconDefinition;

  /** Stacked icon configuration (mutually exclusive with icon) */
  stackedIcon?: { base: IconDefinition; overlay: IconDefinition };

  /** Icon style configuration */
  iconStyle: IconStyleConfig;

  /** Icon flip direction */
  iconFlip?: 'horizontal' | 'vertical';

  /** Description text (used in cards) */
  description?: string;

  /** Category for grouping (status, settings, power, etc.) */
  category?: 'status' | 'settings' | 'power' | 'services' | 'maintenance';

  /** Button variant for action buttons */
  variant?: 'brand' | 'danger' | 'warning' | 'success';

  /** API endpoint for actions (used in power actions) */
  endpoint?: string;

  /** Confirmation message for actions */
  confirmMessage?: string;

  /** Visibility function for conditional rendering */
  isVisible?: (context: NavigationContext) => boolean;

  /** Position in navigation (top or bottom) */
  position?: 'top' | 'bottom';
}

/**
 * Context for determining navigation visibility
 */
export interface NavigationContext {
  isKioskMode: boolean;
  isOnManagePage: boolean;
  currentPath: string;
}
