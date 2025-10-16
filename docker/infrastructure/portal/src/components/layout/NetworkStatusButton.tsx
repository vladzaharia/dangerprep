import React, { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faServer } from '@awesome.me/kit-a765fc5647/icons/utility-duo/semibold';
import { useNetworkWorker } from '../../hooks/useNetworkWorker';
import { useHostapdWorker } from '../../hooks/useHostapdWorker';

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

  // Use worker for real-time network updates
  const network = useNetworkWorker({
    pollInterval: 5000,
    autoStart: true,
  });

  // Use worker for real-time hostapd status updates
  const hostapd = useHostapdWorker({
    pollInterval: 5000,
    autoStart: true,
  });

  // Calculate connection status based on last update time
  const isConnected = useMemo(() => {
    if (!network.lastUpdate) return false;
    const lastUpdateTime = new Date(network.lastUpdate).getTime();
    const now = Date.now();
    const fiveMinutesInMs = 30 * 1000;
    return now - lastUpdateTime < fiveMinutesInMs;
  }, [network.lastUpdate]);

  // Check if there are any internet (WAN) interfaces that are up
  const hasInternetInterface = useMemo(() => {
    if (!network.data?.interfaces) return false;
    return network.data.interfaces.some(iface => iface.purpose === 'wan' && iface.state === 'up');
  }, [network.data]);

  // Get connected clients count
  const connectedClients = hostapd.data?.connectedClients || 0;

  // Determine the variant based on connection state and internet availability
  const variant = useMemo(() => {
    if (!isConnected) return 'danger';
    if (!hasInternetInterface) return 'warning';
    return 'success';
  }, [isConnected, hasInternetInterface]);

  // Only pulse when fully connected (backend + internet) and has clients
  const shouldPulse = isConnected && hasInternetInterface && connectedClients > 0;

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
        <FontAwesomeIcon icon={faServer} size='xl' />
        <wa-badge variant={variant} attention={shouldPulse ? 'pulse' : 'none'}>
          {isConnected ? connectedClients : '!'}
        </wa-badge>
      </wa-button>
    </div>
  );
};
