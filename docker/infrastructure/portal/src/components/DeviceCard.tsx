import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

export interface DeviceCardField {
  label: string;
  value: string | number;
}

export interface DeviceCardTag {
  label: string;
  icon?: string;
  variant?: 'brand' | 'success' | 'danger' | 'warning' | 'neutral';
}

export interface DeviceCardProps {
  icon: IconDefinition;
  title: string;
  subtitle?: string | undefined;
  fields?: DeviceCardField[] | undefined;
  tags?: DeviceCardTag[] | undefined;
  className?: string | undefined;
}

/**
 * Reusable device card component for displaying peers, clients, and other devices
 * Based on the Tailscale peer card design
 */
export const DeviceCard: React.FC<DeviceCardProps> = ({
  icon,
  title,
  subtitle,
  fields = [],
  tags = [],
  className = '',
}) => {
  return (
    <wa-card orientation="horizontal" className={className}>
      <div className='wa-flank wa-gap-m'>
        <FontAwesomeIcon icon={icon} size='lg' />

        <div className='wa-stack wa-gap-3xs'>
          <span className='wa-body-s' style={{ fontWeight: 600 }}>
            {title}
          </span>

          {subtitle && (
            <span className='wa-caption-s'>
              {subtitle}
            </span>
          )}

          {/* Fields */}
          {fields.length > 0 && (
            <div className='wa-stack wa-gap-2xs'>
              {fields.map((field, idx) => (
                <span key={idx} className='wa-caption-s'>
                  <strong>{field.label}:</strong> {field.value}
                </span>
              ))}
            </div>
          )}

          {/* Tags */}
          {tags.length > 0 && (
            <div className='wa-flank wa-gap-xs' style={{ flexWrap: 'wrap' }}>
              {tags.map((tag, idx) => (
                <wa-tag key={idx} variant={tag.variant || 'brand'} size='small'>
                  {tag.icon && <wa-icon name={tag.icon} slot='prefix'></wa-icon>}
                  {tag.label}
                </wa-tag>
              ))}
            </div>
          )}
        </div>
      </div>
    </wa-card>
  );
};

