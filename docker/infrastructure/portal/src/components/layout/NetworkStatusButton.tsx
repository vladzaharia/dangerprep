import { faServer } from '@awesome.me/kit-a765fc5647/icons/duotone/solid';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useNetworkSummary, useHostapdStatus } from '../../hooks/useSWRData';
import { COLORS, OPACITIES, createIconStyle } from '../../utils/iconStyles';

/**
 * Connection Status Button Component
 *
 * Displays a status button with badge showing:
 * - Green border + client count badge (pulsing) when connected with internet (< 5 min since last update)
 * - Yellow/warning border + client count badge (no pulse) when connected but no internet interfaces
 * - Red border + exclamation icon + warning badge when disconnected (> 5 min since last update)
 *
 * Clicking the button navigates to the Network Status page
 */
export const NetworkStatusButton: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Use SWR for real-time network updates with auto-reconnect
  const { data: networkData, error: networkError } = useNetworkSummary();

  // Use SWR for real-time hostapd status updates
  const { data: hostapdData } = useHostapdStatus();

  // Calculate connection status - if we have data and no error, we're connected
  const isConnected = !!networkData && !networkError;

  // Check if there are any internet (WAN) interfaces that are up
  const hasInternetInterface = useMemo(() => {
    if (!networkData?.interfaces) return false;
    return networkData.interfaces.some(iface => iface.purpose === 'wan' && iface.state === 'up');
  }, [networkData]);

  // Get connected clients count
  const connectedClients = hostapdData?.hostapd?.connectedClients || 0;

  // Determine the variant based on connection state and internet availability
  const variant = useMemo(() => {
    if (!isConnected) return 'danger';
    if (!hasInternetInterface) return 'warning';
    return 'success';
  }, [isConnected, hasInternetInterface]);

  // Only pulse when fully connected (backend + internet) and has clients
  const shouldPulse = isConnected && hasInternetInterface && connectedClients > 0;

  // Get icon color based on status
  const iconColor = useMemo(() => {
    if (!isConnected) return COLORS.semantic.danger;
    if (!hasInternetInterface) return COLORS.semantic.warning;
    return COLORS.semantic.success;
  }, [isConnected, hasInternetInterface]);

  // Handle click to navigate to network status page
  const handleClick = () => {
    const params = new URLSearchParams(searchParams);
    const queryString = params.toString();
    const path = queryString ? `/network?${queryString}` : '/network';
    navigate(path);
  };

  return (
    <div
      className='connection-status-button'
      onClick={handleClick}
      style={{ cursor: 'pointer' }}
      role='button'
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-label='View network status'
    >
      <wa-button appearance='outlined' variant={variant}>
        <FontAwesomeIcon
          icon={faServer}
          size='xl'
          style={createIconStyle({
            primaryColor: iconColor,
            primaryOpacity: OPACITIES.high,
            secondaryOpacity: OPACITIES.medium,
          })}
        />
        <wa-badge variant={variant} attention={shouldPulse ? 'pulse' : 'none'}>
          {isConnected ? connectedClients : '!'}
        </wa-badge>
      </wa-button>
    </div>
  );
};
