import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React from 'react';

import { createIconStyle, type IconStyleConfig } from '../../utils/iconStyles';

export interface SettingsCardProps {
  // Icon configuration - either a single icon or stacked icons
  icon?: IconDefinition;
  stackedIcon?: { base: IconDefinition; overlay: IconDefinition };
  iconStyle: IconStyleConfig;

  // Content
  title: string;
  description?: string;

  // Optional header slot (e.g., for switches)
  headerSlot?: React.ReactNode;

  // Optional footer slot (e.g., for inputs, selects)
  footerSlot?: React.ReactNode;

  // Optional loading indicator
  loading?: boolean;

  // Optional children (for custom content between description and footer)
  children?: React.ReactNode;
}

/**
 * Reusable settings card component for Tailscale and other settings pages
 * Supports header slots (switches), footer slots (inputs/selects), and custom content
 */
export const SettingsCard: React.FC<SettingsCardProps> = ({
  icon,
  stackedIcon,
  iconStyle,
  title,
  description,
  headerSlot,
  footerSlot,
  loading = false,
  children,
}) => {
  const iconStyleObj = createIconStyle(iconStyle);

  return (
    <wa-card appearance='outlined' className='settings-card'>
      {/* Header slot - typically for switches */}
      {headerSlot && (
        <div slot='header' style={{ width: '100%' }}>
          {headerSlot}
        </div>
      )}

      {/* Main content - icon, title, description */}
      <div className='wa-stack wa-gap-s wa-align-items-center' style={{ justifyContent: 'center', height: '100%' }}>
        {stackedIcon ? (
          <span className='fa-stack fa-2x'>
            <FontAwesomeIcon icon={stackedIcon.base} className='fa-stack-2x' style={iconStyleObj} />
            <FontAwesomeIcon
              icon={stackedIcon.overlay}
              className='fa-stack-1x'
              transform='shrink-2 down-10 right-12'
              style={iconStyleObj}
            />
          </span>
        ) : icon ? (
          <FontAwesomeIcon icon={icon} size='4x' style={iconStyleObj} />
        ) : null}
        <h3 className='wa-heading-s'>{title}</h3>
        <p className='wa-body-s' style={{ textAlign: 'center' }}>
          {description}
        </p>
        {loading && <wa-spinner></wa-spinner>}
        {children}
      </div>

      {/* Footer slot - typically for inputs, selects, buttons */}
      {footerSlot && (
        <div slot='footer' style={{ width: '100%' }} className='wa-stack wa-gap-m'>
          {footerSlot}
        </div>
      )}
    </wa-card>
  );
};
