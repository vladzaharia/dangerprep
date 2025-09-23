import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import * as solidIcons from '@fortawesome/free-solid-svg-icons';

import type { Service } from '../App';

interface ServiceCardProps {
  service: Service;
}

export const ServiceCard: React.FC<ServiceCardProps> = ({ service }) => {
  // Map icon names to FontAwesome icons
  const getIcon = (iconName: string) => {
    const iconMap: Record<string, any> = {
      'film': solidIcons.faFilm,
      'book': solidIcons.faBook,
      'gamepad': solidIcons.faGamepad,
      'file-text': solidIcons.faFileAlt,
      'git-branch': solidIcons.faCodeBranch,
      'activity': solidIcons.faChartLine,
      'box': solidIcons.faBox,
    };
    return iconMap[iconName] || solidIcons.faQuestionCircle;
  };

  const handleClick = () => {
    window.open(service.url, '_blank', 'noopener,noreferrer');
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick();
    }
  };

  return (
    <wa-card appearance='outlined'>
      <div
        className="wa-stack service-card service-card--clickable"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label={`Open ${service.name} - ${service.description}`}
      >
        <div className='service-card-header'>
          <div className='service-icon'>
            <FontAwesomeIcon
              icon={getIcon(service.icon)}
              size="2x"
              style={{ color: 'var(--wa-color-neutral-text-subtle)' }}
            />
          </div>
          <div className='wa-stack service-info'>
            <h3 className='service-name'>{service.name}</h3>
            <p className='service-description'>{service.description}</p>
          </div>
        </div>

        {/* Service URL at the bottom */}
        <div className='service-card-footer'>
          <div className='service-url-display'>
            <div className='service-url service-url--split'>
              <span className='service-url-text'>{service.url}</span>
              <FontAwesomeIcon
                icon={solidIcons.faExternalLinkAlt}
                size="sm"
                className='service-url-icon'
              />
            </div>
          </div>
        </div>
      </div>
    </wa-card>
  );
};
