import React from 'react';

export interface StatusCardTag {
  label: string;
  value?: string | number | undefined;
  icon?: React.ReactNode | undefined;
  variant?: 'brand' | 'success' | 'danger' | 'warning' | 'neutral' | undefined;
}

export interface StatusCardProps {
  type?: 'callout' | 'card' | undefined;
  variant?: 'success' | 'danger' | 'neutral' | 'warning' | undefined;
  layout?: 'vertical' | 'horizontal' | undefined;
  icon: React.ReactNode;
  title: string;
  subtitle?: string | number | undefined;
  tags?: StatusCardTag[] | undefined;
  className?: string | undefined;
  actionButton?: React.ReactNode | undefined;
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
  className = '',
  actionButton,
}) => {
  // Header content (icon + title/subtitle + optional action button)
  const header = (
    <div className='wa-flank wa-gap-m' style={{ width: '100%' }}>
      {icon}
      <div className='wa-stack wa-gap-3xs' style={{ flex: 1 }}>
        <span className='wa-body-s' style={{ fontWeight: 600 }}>
          {title}
        </span>
        {subtitle && <span className='wa-caption-s'>{subtitle}</span>}
      </div>
      {actionButton && <div style={{ marginLeft: 'auto' }}>{actionButton}</div>}
    </div>
  );

  // Tags content
  const tagsContent = tags.length > 0 && (
    <div
      className='wa-cluster wa-gap-xs'
      style={layout === 'horizontal' ? { paddingTop: 'var(--wa-space-s)' } : undefined}
    >
      {tags.map((tag, idx) => (
        <wa-tag key={idx} variant={tag.variant || 'neutral'} size='small'>
          {tag.icon ? (
            <div className='wa-flank wa-gap-xs'>
              {tag.icon}
              <span>{tag.value || tag.label}</span>
            </div>
          ) : tag.value ? (
            `${tag.label}: ${tag.value}`
          ) : (
            tag.label
          )}
        </wa-tag>
      ))}
    </div>
  );

  // Combine content based on layout
  const content =
    layout === 'vertical' ? (
      <div className='wa-stack wa-gap-m'>
        {header}
        {tagsContent}
      </div>
    ) : (
      <div className='wa-flank wa-gap-m'>
        {icon}
        <div className='wa-stack wa-gap-3xs'>
          <span className='wa-body-s' style={{ fontWeight: 600 }}>
            {title}
          </span>
          {subtitle && <span className='wa-caption-s'>{subtitle}</span>}
          {tagsContent}
        </div>
      </div>
    );

  if (type === 'card') {
    const cardProps = {
      appearance: 'outlined' as const,
      className: `${className} card`,
      ...(layout === 'horizontal' && { orientation: 'horizontal' as const }),
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
