import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

export interface InterfaceCardTag {
  label: string;
  value?: string | number | undefined;
  icon?: string | undefined;
  variant?: 'brand' | 'success' | 'danger' | 'warning' | 'neutral' | undefined;
}

export interface InterfaceCardProps {
  type?: 'callout' | 'card' | undefined;
  variant?: 'success' | 'danger' | 'neutral' | 'warning' | undefined;
  icon: IconDefinition;
  title: string;
  subtitle?: string | undefined;
  tags?: InterfaceCardTag[] | undefined;
  routes?: string[] | undefined;
  className?: string | undefined;
}

/**
 * Reusable interface card component for displaying network interfaces
 * Uses a cluster of tags to display information with icons
 */
export const InterfaceCard: React.FC<InterfaceCardProps> = ({
  type = 'callout',
  variant = 'neutral',
  icon,
  title,
  subtitle,
  tags = [],
  routes = [],
  className = '',
}) => {
  const content = (
    <div className='wa-stack wa-gap-m'>
      <div className='wa-flank wa-gap-m'>
        <FontAwesomeIcon icon={icon} size='lg' />
        <div className='wa-stack wa-gap-3xs'>
          <span className='wa-body-s' style={{ fontWeight: 600 }}>
            {title}
          </span>
          {subtitle && (
            <span className='wa-caption-s'>{subtitle}</span>
          )}
        </div>
      </div>

      {(tags.length > 0 || routes.length > 0) && (
        <div className='wa-stack wa-gap-xs wa-body-s'>
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

          {/* Advertised Routes */}
          {routes.length > 0 && (
            <div className='wa-stack wa-gap-3xs'>
              <span style={{ fontWeight: 600 }}>Advertised Routes:</span>
              <div className='wa-stack wa-gap-2xs'>
                {routes.map((route, idx) => (
                  <span key={idx} className='wa-caption-s'>
                    • {route}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (type === 'card') {
    return (
      <wa-card appearance='outlined' className={className}>
        <div className='wa-stack wa-gap-xs'>
          {content}
        </div>
      </wa-card>
    );
  }

  return (
    <wa-callout appearance='outlined' variant={variant} className={className}>
      {content}
    </wa-callout>
  );
};

