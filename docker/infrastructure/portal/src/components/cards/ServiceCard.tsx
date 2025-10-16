import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import type { Service } from '../../App';
import { getIcon } from '../../utils/iconCache';

interface ServiceCardProps {
  service: Service;
}

export const ServiceCard: React.FC<ServiceCardProps> = ({ service }) => {
  const handleClick = () => {
    if (service.url) {
      window.open(service.url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick();
    }
  };

  // Don't make card clickable if there's no URL
  const isClickable = Boolean(service.url);

  return (
    <wa-card appearance='outlined'>
      <div
        className={`wa-stack wa-gap-m ${isClickable ? 'service-card--clickable' : ''}`}
        onClick={isClickable ? handleClick : undefined}
        onKeyDown={isClickable ? handleKeyDown : undefined}
        role={isClickable ? 'button' : undefined}
        tabIndex={isClickable ? 0 : undefined}
        aria-label={
          isClickable
            ? `Open ${service.name} - ${service.description}`
            : `${service.name} - ${service.description}`
        }
      >
        {/* Service Header */}
        <div className='wa-flank wa-gap-m'>
          <FontAwesomeIcon
            icon={getIcon(service.icon)}
            size='2xl'
            style={{ color: 'var(--wa-color-neutral-text-subtle)' }}
          />
          <div className='wa-stack wa-gap-3xs'>
            <span className='wa-body-m' style={{ fontWeight: 600 }}>
              {service.name}
            </span>
            <span className='wa-caption-s'>{service.description}</span>
          </div>
        </div>

        {/* Service URL at the bottom - only show if URL exists */}
        {service.url && (
          <div className='service-url service-url--split'>
            <span className='service-url-text'>{service.url}</span>
            <FontAwesomeIcon
              icon={getIcon('external-link')}
              size='lg'
              className='service-url-icon'
            />
          </div>
        )}
      </div>
    </wa-card>
  );
};
