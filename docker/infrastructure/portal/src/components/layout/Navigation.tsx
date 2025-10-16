import React from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGrid2, faGear, faBolt } from '@awesome.me/kit-a765fc5647/icons/utility-duo/semibold';
import { ConnectionStatusButton } from './ConnectionStatusButton';

interface NavItem {
  path: string;
  icon: any;
  label: string;
}

export const Navigation: React.FC = () => {
  const [searchParams] = useSearchParams();
  const isKioskMode = searchParams.has('kiosk');

  // Helper function to preserve search params in navigation
  const getNavLinkTo = (path: string) => {
    const params = new URLSearchParams(searchParams);
    const queryString = params.toString();
    return queryString ? `${path}?${queryString}` : path;
  };

  const mainNavItems: NavItem[] = [{ path: '/services', icon: faGrid2, label: 'Services' }];

  const powerNavItems: NavItem[] = [
    { path: '/qr', icon: faGrid2, label: 'QR Code' },
    { path: '/maintenance', icon: faGear, label: 'Maintenance' },
    { path: '/power', icon: faBolt, label: 'Power' },
  ];

  return (
    <div className='app-navigation wa-split:column'>
      <div className='wa-stack app-navigation-list'>
        {mainNavItems.map(item => (
          <NavLink
            key={item.path}
            to={getNavLinkTo(item.path)}
            className={({ isActive }) =>
              `navigation-item ${isActive ? 'navigation-item--active' : ''}`
            }
            aria-label={item.label}
          >
            <wa-button appearance='plain'>
              <FontAwesomeIcon icon={item.icon} size='xl' />
            </wa-button>
          </NavLink>
        ))}
      </div>
      {isKioskMode && (
        <div className='wa-stack app-navigation-list'>
          {powerNavItems.map(item => (
            <NavLink
              key={item.path}
              to={getNavLinkTo(item.path)}
              className={({ isActive }) =>
                `navigation-item ${isActive ? 'navigation-item--active' : ''}`
              }
              aria-label={item.label}
            >
              <wa-button appearance='plain'>
                <FontAwesomeIcon icon={item.icon} size='xl' />
              </wa-button>
            </NavLink>
          ))}
          <ConnectionStatusButton />
        </div>
      )}
    </div>
  );
};
