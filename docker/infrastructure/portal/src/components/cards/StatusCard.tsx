import type WaPopup from '@awesome.me/webawesome/dist/components/popup/popup.js';
import React, { useState, useRef, useEffect } from 'react';

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
  /** Content to show in popup when card is clicked */
  detailsContent?: React.ReactNode | undefined;
  /** Error details to show in popup (alternative to detailsContent) */
  errorDetails?: string | undefined;
  /** Footer content displayed as a flank (left/right layout) */
  footerContent?: React.ReactNode | undefined;
}

/**
 * Unified status card component for displaying network interfaces, devices, peers, and clients
 * Supports both callout and card types with flexible layouts
 * Now supports popup for showing error/detail information on click with mouseout to close
 */
export const StatusCard: React.FC<StatusCardProps> = ({
  type = 'card',
  variant = 'neutral',
  layout: _layout = 'vertical',
  icon,
  title,
  subtitle,
  tags = [],
  className = '',
  actionButton,
  detailsContent,
  errorDetails,
  footerContent,
}) => {
  const [popupOpen, setPopupOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [popupElement, setPopupElement] = useState<WaPopup | null>(null);
  const hasPopupContent = Boolean(detailsContent || errorDetails);

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popupOpen &&
        cardRef.current &&
        popupElement &&
        !cardRef.current.contains(event.target as Node) &&
        !popupElement.contains(event.target as Node)
      ) {
        setPopupOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [popupOpen, popupElement]);

  // Handle mouseout to close popup
  const handleMouseLeave = () => {
    if (popupOpen) {
      setPopupOpen(false);
    }
  };

  const handleCardClick = () => {
    if (hasPopupContent) {
      setPopupOpen(!popupOpen);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!hasPopupContent) return;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setPopupOpen(!popupOpen);
    } else if (e.key === 'Escape' && popupOpen) {
      setPopupOpen(false);
    }
  };
  // Header content (icon + title/subtitle in flank layout)
  const headerContent = (
    <div className='wa-flank wa-gap-m wa-align-items-center'>
      {icon}
      <div className='wa-stack wa-gap-3xs' style={{ flex: 1 }}>
        <span className='wa-body-s' style={{ fontWeight: 600 }}>
          {title}
        </span>
        {subtitle && <span className='wa-caption-s'>{subtitle}</span>}
      </div>
    </div>
  );

  // Tags/details content for body
  const tagsContent = tags.length > 0 && (
    <div className='wa-cluster wa-gap-xs'>
      {tags.map((tag, idx) => {
        const tagWithTitle = tag as StatusCardTag & { title?: string };
        const tagProps: Record<string, unknown> = {
          key: idx,
          variant: tag.variant || 'neutral',
          size: 'small',
        };
        if (tagWithTitle.title) {
          tagProps.title = tagWithTitle.title;
        }
        return (
          <wa-tag {...tagProps}>
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
        );
      })}
    </div>
  );

  // Popup content
  const popupContent =
    detailsContent ||
    (errorDetails && (
      <div className='wa-stack wa-gap-xs' style={{ padding: 'var(--wa-space-s)' }}>
        <div className='wa-body-s' style={{ fontWeight: 600 }}>
          Error Details
        </div>
        <div className='wa-caption-s' style={{ whiteSpace: 'pre-wrap' }}>
          {errorDetails}
        </div>
      </div>
    ));

  if (type === 'card') {
    return (
      <div className='wa-stack wa-gap-s'>
        <div
          ref={cardRef}
          onClick={handleCardClick}
          onKeyDown={handleKeyDown}
          onMouseLeave={handleMouseLeave}
          role={hasPopupContent ? 'button' : undefined}
          tabIndex={hasPopupContent ? 0 : undefined}
          aria-expanded={hasPopupContent ? popupOpen : undefined}
          style={{
            cursor: hasPopupContent ? 'pointer' : undefined,
            position: 'relative',
          }}
        >
          <wa-card appearance='outlined' className={`${className} card`}>
            {/* Header slot with icon and title */}
            <div slot='header' style={{ width: '100%' }}>
              {headerContent}
            </div>

            {/* Body with tags/details */}
            {tagsContent}
          </wa-card>

          {/* Popup for details */}
          {hasPopupContent && cardRef.current && (
            <wa-popup
              ref={setPopupElement}
              anchor={cardRef.current}
              placement='bottom'
              distance={4}
              active={popupOpen}
              shift
            >
              <div onMouseLeave={handleMouseLeave}>
                <wa-card appearance='outlined' style={{ width: '100%', maxWidth: '400px' }}>
                  {popupContent}
                </wa-card>
              </div>
            </wa-popup>
          )}
        </div>

        {/* Action button below card */}
        {actionButton && <div>{actionButton}</div>}
      </div>
    );
  }

  // Callout type (legacy support)
  return (
    <div className='wa-stack wa-gap-s'>
      <div
        ref={cardRef}
        onClick={handleCardClick}
        onKeyDown={handleKeyDown}
        onMouseLeave={handleMouseLeave}
        role={hasPopupContent ? 'button' : undefined}
        tabIndex={hasPopupContent ? 0 : undefined}
        aria-expanded={hasPopupContent ? popupOpen : undefined}
        style={{
          cursor: hasPopupContent ? 'pointer' : undefined,
          position: 'relative',
        }}
      >
        <wa-callout appearance='outlined' variant={variant} className={className}>
          <div className='wa-stack wa-gap-m'>
            <div className='wa-flank wa-gap-m'>
              {icon}
              <div className='wa-stack wa-gap-3xs' style={{ flex: 1 }}>
                <span className='wa-body-s' style={{ fontWeight: 600 }}>
                  {title}
                </span>
                {subtitle && <span className='wa-caption-s'>{subtitle}</span>}
              </div>
            </div>
            {tagsContent}
            {footerContent && <div className='wa-flank wa-gap-m'>{footerContent}</div>}
          </div>
        </wa-callout>

        {/* Popup for details */}
        {hasPopupContent && cardRef.current && (
          <wa-popup
            ref={setPopupElement}
            anchor={cardRef.current}
            placement='bottom'
            distance={4}
            active={popupOpen}
            shift
          >
            <div onMouseLeave={handleMouseLeave}>
              <wa-card appearance='outlined' style={{ width: '100%', maxWidth: '400px' }}>
                {popupContent}
              </wa-card>
            </div>
          </wa-popup>
        )}
      </div>

      {/* Action button below callout */}
      {actionButton && <div>{actionButton}</div>}
    </div>
  );
};
