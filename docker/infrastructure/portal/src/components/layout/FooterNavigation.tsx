import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';

import type { createIconStyle } from '../../utils/iconStyles';

export interface FooterNavItem {
  path: string;
  icon: IconDefinition;
  label: string;
  iconStyle?: ReturnType<typeof createIconStyle>;
}

interface FooterNavigationProps {
  items: FooterNavItem[];
}

/**
 * Footer Navigation Bar Component
 * Displays navigation items in a horizontal bar at the bottom of the page
 * Uses same styling as the top navigation bar
 */
export const FooterNavigation: React.FC<FooterNavigationProps> = ({ items }) => {
  const [searchParams] = useSearchParams();

  // Helper function to preserve search params in navigation
  const getNavLinkTo = (path: string) => {
    const params = new URLSearchParams(searchParams);
    const queryString = params.toString();
    return queryString ? `${path}?${queryString}` : path;
  };

  return (
    <div className='footer-navigation'>
      <wa-card className='footer-navigation-card' appearance='outlined'>
        <div className='wa-cluster wa-gap-m wa-justify-content-center'>
          {items.map(item => (
            <NavLink
              key={item.path}
              to={getNavLinkTo(item.path)}
              className={({ isActive }) =>
                `footer-navigation-item wa-stack wa-gap-xs wa-align-items-center ${isActive ? 'footer-navigation-item--active' : ''}`
              }
              aria-label={item.label}
            >
              <wa-button appearance='plain'>
                <FontAwesomeIcon
                  icon={item.icon}
                  size='lg'
                  style={{ ...item.iconStyle, maxWidth: '1.5rem' }}
                />
              </wa-button>
              <span className='footer-navigation-label'>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </wa-card>
    </div>
  );
};
