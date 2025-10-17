import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React from 'react';

import type { Service } from '../../App';
import { getIcon } from '../../utils/iconCache';

interface ServiceCardProps {
  service: Service;
  pageType?: 'services' | 'maintenance';
}

export const ServiceCard: React.FC<ServiceCardProps> = ({ service, pageType = 'services' }) => {
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

  // Get icon color based on page type (matching navigation colors)
  const iconColor = pageType === 'maintenance' ? '#f59e0b' : '#3b82f6'; // Amber for maintenance, Blue for services

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
            style={
              {
                '--fa-primary-color': iconColor,
                '--fa-primary-opacity': 0.9,
                '--fa-secondary-opacity': 0.8,
              } as React.CSSProperties
            }
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
              style={
                {
                  '--fa-primary-color': iconColor,
                  '--fa-primary-opacity': 0.7,
                  '--fa-secondary-opacity': 0.6,
                } as React.CSSProperties
              }
            />
          </div>
        )}
      </div>
    </wa-card>
  );
};
