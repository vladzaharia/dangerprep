import React, { useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUsers, faCircleExclamation } from '@fortawesome/free-solid-svg-icons';
import { useNetworkWorker } from '../hooks/useNetworkWorker';
import { useHostapdWorker } from '../hooks/useHostapdWorker';

/**
 * Connection Status Button Component
 * 
 * Displays a status button with badge showing:
 * - Green border + users icon + client count badge (pulsing) when connected (< 5 min since last update)
 * - Red border + exclamation icon + warning badge when disconnected (> 5 min since last update)
 */
export const ConnectionStatusButton: React.FC = () => {
  // Use worker for real-time network updates
  const network = useNetworkWorker({
    pollInterval: 5000,
    autoStart: true
  });

  // Use worker for real-time hostapd status updates
  const hostapd = useHostapdWorker({
    pollInterval: 5000,
    autoStart: true
  });

  // Calculate connection status based on last update time
  const isConnected = useMemo(() => {
    if (!network.lastUpdate) return false;
    const lastUpdateTime = new Date(network.lastUpdate).getTime();
    const now = Date.now();
    const fiveMinutesInMs = 5 * 60 * 1000;
    return (now - lastUpdateTime) < fiveMinutesInMs;
  }, [network.lastUpdate]);

  // Get connected clients count
  const connectedClients = hostapd.data?.connectedClients || 0;

  return (
    <div className="qr-status-button">
      <wa-button
        appearance="plain"
        style={{
          border: `2px solid var(--wa-color-${isConnected ? 'success' : 'danger'}-600)`,
          backgroundColor: 'transparent',
          position: 'relative',
        }}
      >
        <FontAwesomeIcon
          icon={isConnected ? faUsers : faCircleExclamation}
          size="lg"
        />
        {isConnected && connectedClients > 0 && (
          <wa-badge
            variant="success"
            attention="pulse"
            style={{
              position: 'absolute',
              top: '-8px',
              right: '-8px',
            }}
          >
            {connectedClients}
          </wa-badge>
        )}
        {!isConnected && (
          <wa-badge
            variant="danger"
            style={{
              position: 'absolute',
              top: '-8px',
              right: '-8px',
            }}
          >
            !
          </wa-badge>
        )}
      </wa-button>
    </div>
  );
};

