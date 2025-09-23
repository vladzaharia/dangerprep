import React from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faQrcode, faGrip, faCog, faPowerOff } from '@fortawesome/free-solid-svg-icons';

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

  const mainNavItems: NavItem[] = [
    { path: '/', icon: faQrcode, label: 'QR Code' },
    { path: '/services', icon: faGrip, label: 'Services' },
  ];

  const powerNavItems: NavItem[] = [
    { path: '/maintenance', icon: faCog, label: 'Maintenance' },
    { path: '/power', icon: faPowerOff, label: 'Power' },
  ];

  return (
    <div className="app-navigation wa-split:column">
      <div className="wa-stack app-navigation-list">
        {mainNavItems.map((item) => (
          <NavLink
            key={item.path}
            to={getNavLinkTo(item.path)}
            className={({ isActive }) =>
              `navigation-item ${isActive ? 'navigation-item--active' : ''}`
            }
            aria-label={item.label}
          >
            <wa-button appearance="plain">
              <FontAwesomeIcon icon={item.icon} size="xl" />
            </wa-button>
          </NavLink>
        ))}
      </div>
      {isKioskMode && (
        <div className="wa-stack app-navigation-list">
          {powerNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={getNavLinkTo(item.path)}
              className={({ isActive }) =>
                `navigation-item ${isActive ? 'navigation-item--active' : ''}`
              }
              aria-label={item.label}
            >
              <wa-button appearance="plain">
                <FontAwesomeIcon icon={item.icon} size="xl" />
              </wa-button>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
};
