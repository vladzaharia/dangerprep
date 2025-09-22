import React from 'react';

import type { Service } from '../App';

interface ServiceCardProps {
  service: Service;
  isKioskMode: boolean;
}

export const ServiceCard: React.FC<ServiceCardProps> = ({ service, isKioskMode }) => {
  const handleClick = () => {
    if (!isKioskMode) {
      window.open(service.url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!isKioskMode && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      handleClick();
    }
  };

  return (
    <wa-card appearance='outlined'>
      <div
        className={`wa-stack service-card ${!isKioskMode ? 'service-card--clickable' : ''}`}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role={!isKioskMode ? 'button' : undefined}
        tabIndex={!isKioskMode ? 0 : undefined}
        aria-label={
          isKioskMode ? `${service.name} service` : `Open ${service.name} - ${service.description}`
        }
      >
        <div className='service-card-header'>
          <div className='service-icon'>
            <wa-icon name={service.icon} variant='solid' label={`${service.name} icon`} />
          </div>
          <div className='wa-stack service-info'>
            <h3 className='service-name'>{service.name}</h3>
            <p className='service-description'>{service.description}</p>
          </div>
        </div>

        <div className='service-card-footer'>
          {isKioskMode ? (
            <div className='service-url-display'>
              <span className='service-url'>{service.url}</span>
            </div>
          ) : (
            <div className='service-action'>
              <wa-button variant='brand' size='small' appearance='filled'>
                <wa-icon name='external-link' variant='solid' />
                Open Service
              </wa-button>
            </div>
          )}
        </div>
      </div>
    </wa-card>
  );
};
