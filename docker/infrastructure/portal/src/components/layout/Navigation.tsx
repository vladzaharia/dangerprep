import React from 'react';
import { NavLink, useSearchParams, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGrid2, faGear, faBolt, faWrench } from '@awesome.me/kit-a765fc5647/icons/utility-duo/semibold';
import { faQrcode } from '@awesome.me/kit-a765fc5647/icons/duotone/regular';
import { NetworkStatusButton } from './NetworkStatusButton';

interface NavItem {
  path: string;
  icon: any;
  label: string;
}

export const Navigation: React.FC = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const isKioskMode = searchParams.has('kiosk');

  // Helper function to preserve search params in navigation
  const getNavLinkTo = (path: string) => {
    const params = new URLSearchParams(searchParams);
    const queryString = params.toString();
    return queryString ? `${path}?${queryString}` : path;
  };

  // Determine if we're on a manage page
  const isOnManagePage = ['/network', '/maintenance', '/settings', '/power'].includes(
    location.pathname
  );

  // Determine which navigation items to show
  const showAllNavigation = isKioskMode || isOnManagePage;

  // Top navigation items (always shown when showAllNavigation is true)
  const topNavItems: NavItem[] = [
    { path: '/services', icon: faGrid2, label: 'Services' },
    { path: '/maintenance', icon: faWrench, label: 'Maintenance' },
  ];

  // Bottom navigation items (shown when showAllNavigation is true)
  const bottomNavItems: NavItem[] = [
    { path: '/qr', icon: faQrcode, label: 'QR Code' },
    { path: '/settings', icon: faGear, label: 'Settings' },
    { path: '/power', icon: faBolt, label: 'Power' },
  ];

  return (
    <div className='app-navigation wa-split:column'>
      {/* Top section - Services (and Maintenance when showing all) */}
      <div className='wa-stack app-navigation-list'>
        {showAllNavigation ? (
          // Show Services and Maintenance
          topNavItems.map(item => (
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
          ))
        ) : (
          // Show only Services by default
          <NavLink
            to={getNavLinkTo('/services')}
            className={({ isActive }) =>
              `navigation-item ${isActive ? 'navigation-item--active' : ''}`
            }
            aria-label='Services'
          >
            <wa-button appearance='plain'>
              <FontAwesomeIcon icon={faGrid2} size='xl' />
            </wa-button>
          </NavLink>
        )}
      </div>

      {/* Bottom section - QR Code, Manage/Network Status, Settings, Power */}
      {showAllNavigation && (
        <div className='wa-stack app-navigation-list'>
          {bottomNavItems.map(item => (
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
          <NetworkStatusButton />
        </div>
      )}
    </div>
  );
};
