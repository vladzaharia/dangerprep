import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

export interface DeviceCardTag {
  label: string;
  value?: string | number | undefined;
  icon?: string | undefined;
  variant?: 'brand' | 'success' | 'danger' | 'warning' | 'neutral' | undefined;
}

export interface DeviceCardProps {
  icon: IconDefinition;
  title: string;
  subtitle?: string | undefined;
  tags?: DeviceCardTag[] | undefined;
  className?: string | undefined;
}

/**
 * Reusable device card component for displaying peers, clients, and other devices
 * Uses a cluster of tags to display information with icons
 */
export const DeviceCard: React.FC<DeviceCardProps> = ({
  icon,
  title,
  subtitle,
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

          {/* Tags in a cluster */}
          {tags.length > 0 && (
            <div className='wa-cluster wa-gap-xs'>
              {tags.map((tag, idx) => (
                <wa-tag key={idx} variant={tag.variant || 'neutral'} size='small'>
                  {tag.icon && <wa-icon name={tag.icon} slot='prefix'></wa-icon>}
                  {tag.value ? `${tag.label}: ${tag.value}` : tag.label}
                </wa-tag>
              ))}
            </div>
          )}
        </div>
      </div>
    </wa-card>
  );
};

