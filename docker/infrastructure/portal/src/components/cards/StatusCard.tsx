import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

export interface StatusCardTag {
  label: string;
  value?: string | number | undefined;
  icon?: IconDefinition | undefined;
  variant?: 'brand' | 'success' | 'danger' | 'warning' | 'neutral' | undefined;
}

export interface StatusCardProps {
  type?: 'callout' | 'card' | undefined;
  variant?: 'success' | 'danger' | 'neutral' | 'warning' | undefined;
  layout?: 'vertical' | 'horizontal' | undefined;
  icon: IconDefinition;
  title: string;
  subtitle?: string | undefined;
  tags?: StatusCardTag[] | undefined;
  routes?: string[] | undefined;
  className?: string | undefined;
}

/**
 * Unified status card component for displaying network interfaces, devices, peers, and clients
 * Supports both callout and card types with flexible layouts
 */
export const StatusCard: React.FC<StatusCardProps> = ({
  type = 'card',
  variant = 'neutral',
  layout = 'vertical',
  icon,
  title,
  subtitle,
  tags = [],
  routes = [],
  className = '',
}) => {
  // Header content (icon + title/subtitle)
  const header = (
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
  );

  // Tags and routes content
  const tagsAndRoutes = (tags.length > 0 || routes.length > 0) && (
    <div className='wa-stack wa-gap-xs wa-body-s'>
      {/* Tags in a cluster */}
      {tags.length > 0 && (
        <div className='wa-cluster wa-gap-xs' style={layout === 'horizontal' ? { paddingTop: 'var(--wa-space-s)' } : undefined}>
          {tags.map((tag, idx) => (
            <wa-tag key={idx} variant={tag.variant || 'neutral'} size='small'>
              {tag.icon && (
                <span slot='prefix'>
                  <FontAwesomeIcon icon={tag.icon} />
                </span>
              )}
              {tag.value ? !tag.icon ? `${tag.label}: ${tag.value}` : tag.value : tag.label}
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
  );

  // Combine content based on layout
  const content = layout === 'vertical' ? (
    <div className='wa-stack wa-gap-m'>
      {header}
      {tagsAndRoutes}
    </div>
  ) : (
    <div className='wa-flank wa-gap-m'>
      <FontAwesomeIcon icon={icon} size='lg' />
      <div className='wa-stack wa-gap-3xs'>
        <span className='wa-body-s' style={{ fontWeight: 600 }}>
          {title}
        </span>
        {subtitle && (
          <span className='wa-caption-s'>{subtitle}</span>
        )}
        {tagsAndRoutes}
      </div>
    </div>
  );

  if (type === 'card') {
    const cardProps = {
      appearance: 'outlined' as const,
      className,
      ...(layout === 'horizontal' && { orientation: 'horizontal' as const })
    };

    return (
      <wa-card {...cardProps}>
        {layout === 'vertical' && <div className='wa-stack wa-gap-xs'>{content}</div>}
        {layout === 'horizontal' && content}
      </wa-card>
    );
  }

  return (
    <wa-callout appearance='outlined' variant={variant} className={className}>
      {content}
    </wa-callout>
  );
};

