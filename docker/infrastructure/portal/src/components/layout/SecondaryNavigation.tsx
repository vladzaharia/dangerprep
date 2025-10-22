import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useMemo, useState } from 'react';
import { NavLink, useLocation, useSearchParams } from 'react-router-dom';

import { NETWORK_STATUS_ITEMS, POWER_ITEMS, SETTINGS_ITEMS } from '../../config/navigation';
import type { NavigationItem } from '../../types/navigation';
import { createIconStyle } from '../../utils/iconStyles';

/**
 * All secondary navigation items
 */
const SECONDARY_NAV_ITEMS: NavigationItem[] = [
  ...NETWORK_STATUS_ITEMS,
  ...SETTINGS_ITEMS,
  ...POWER_ITEMS,
];

/**
 * Determine the current category based on the current path
 */
function getCurrentCategory(pathname: string): 'status' | 'settings' | 'power' | null {
  if (pathname.startsWith('/network')) return 'status';
  if (pathname.startsWith('/settings')) return 'settings';
  if (pathname.startsWith('/power')) return 'power';
  return null;
}

/**
 * Secondary Navigation Component
 * Displays horizontal navigation for grouped pages (Status, Settings, Power)
 */
export const SecondaryNavigation: React.FC = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState<string | null>(null);

  const currentCategory = useMemo(() => getCurrentCategory(location.pathname), [location.pathname]);

  // Filter items for the current category
  const visibleItems = useMemo(() => {
    if (!currentCategory) return [];
    return SECONDARY_NAV_ITEMS.filter(item => item.category === currentCategory);
  }, [currentCategory]);

  // Don't render if no category or no items
  if (!currentCategory || visibleItems.length === 0) {
    return null;
  }

  // Helper function to preserve search params in navigation
  const getNavLinkTo = (path: string) => {
    const params = new URLSearchParams(searchParams);
    const queryString = params.toString();
    return queryString ? `${path}?${queryString}` : path;
  };

  // Handle power actions
  const handlePowerAction = async (item: NavigationItem, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    if (!item.endpoint || !item.confirmMessage) {
      return;
    }

    // Show confirmation dialog
    const confirmed = window.confirm(item.confirmMessage);
    if (!confirmed) {
      return;
    }

    setLoading(item.path || item.id);

    try {
      const response = await fetch(item.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!data.success) {
        alert(data.message || 'Action failed');
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className='app-secondary-navigation'>
      <wa-card className='app-secondary-navigation-card' appearance='outlined'>
        <div className='wa-cluster wa-gap-m wa-align-items-center'>
          {visibleItems.map(item => {
            const isPowerAction = !!item.endpoint;

            // Render icon (regular or stacked)
            const renderIcon = () => {
              const iconStyle = {
                ...createIconStyle(item.iconStyle),
                maxWidth: '1.5rem',
                paddingRight: 'var(--wa-space-xs)',
                '--fa-primary-opacity': 1,
                '--fa-secondary-opacity': 0.8,
              } as React.CSSProperties;

              if (item.stackedIcon) {
                return (
                  <span
                    className='fa-stack'
                    style={{ fontSize: '0.75em', verticalAlign: 'middle' }}
                  >
                    <FontAwesomeIcon
                      icon={item.stackedIcon.base}
                      className='fa-stack-2x'
                      style={iconStyle}
                    />
                    <FontAwesomeIcon
                      icon={item.stackedIcon.overlay}
                      className='fa-stack-1x'
                      transform='shrink-6'
                      style={{ color: 'var(--wa-color-neutral-0)' }}
                    />
                  </span>
                );
              }

              if (!item.icon) return null;

              return (
                <FontAwesomeIcon
                  icon={item.icon}
                  size='lg'
                  flip={item.iconFlip}
                  style={iconStyle}
                />
              );
            };

            if (isPowerAction) {
              // Power actions are clickable buttons, not navigation links
              return (
                <div
                  key={item.id}
                  className='secondary-navigation-item'
                  onClick={e => handlePowerAction(item, e)}
                  role='button'
                  tabIndex={loading === null ? 0 : -1}
                  onKeyDown={e => {
                    if (loading === null && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      handlePowerAction(item, e as unknown as React.MouseEvent);
                    }
                  }}
                  aria-label={item.label}
                  style={{ cursor: loading === null ? 'pointer' : 'not-allowed' }}
                >
                  <wa-button appearance='plain' size='small' disabled={loading !== null}>
                    {renderIcon()}
                    <span className='secondary-navigation-label'>{item.label}</span>
                  </wa-button>
                </div>
              );
            }

            // Regular navigation links
            return (
              <NavLink
                key={item.id}
                to={getNavLinkTo(item.path || '/')}
                className={({ isActive }) =>
                  `secondary-navigation-item ${isActive ? 'secondary-navigation-item--active' : ''}`
                }
                aria-label={item.label}
              >
                <wa-button appearance='plain' size='small'>
                  {renderIcon()}
                  <span className='secondary-navigation-label'>{item.label}</span>
                </wa-button>
              </NavLink>
            );
          })}
        </div>
      </wa-card>
    </div>
  );
};
