import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import React from 'react';

import { createIconStyle, type IconStyleConfig } from '../../utils/iconStyles';

export interface SettingsCardProps {
  // Icon configuration
  icon: IconDefinition;
  iconStyle: IconStyleConfig;

  // Content
  title: string;
  description: string;

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
  iconStyle,
  title,
  description,
  headerSlot,
  footerSlot,
  loading = false,
  children,
}) => {
  return (
    <wa-card appearance='outlined'>
      {/* Header slot - typically for switches */}
      {headerSlot && <div slot='header' style={{ width: '100%' }}>{headerSlot}</div>}

      {/* Main content - icon, title, description */}
      <div className='wa-stack wa-gap-s wa-align-items-center'>
        <FontAwesomeIcon icon={icon} size='4x' style={createIconStyle(iconStyle)} />
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

