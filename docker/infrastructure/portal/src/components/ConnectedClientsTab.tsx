import React, { useMemo } from 'react';
import { useNetworkWorker, useHotspotFromWorker } from '../hooks/useNetworkWorker';
import type { WiFiInterface, ConnectedClient } from '../hooks/useNetworks';

/**
 * Connected Clients Tab Component
 */
export const ConnectedClientsTab: React.FC = () => {
  const network = useNetworkWorker({ pollInterval: 5000, autoStart: true });
  const hotspot = useHotspotFromWorker(network.data);

  // Get connected clients from hotspot interface
  const connectedClients = useMemo(() => {
    if (!hotspot || hotspot.type !== 'wifi') return [];
    const wifiInterface = hotspot as WiFiInterface;
    return wifiInterface.connectedClients || [];
  }, [hotspot]);

  if (network.loading && !network.data) {
    return (
      <div className='wa-stack wa-gap-m'>
        <wa-skeleton effect='sheen' style={{ width: '100%', height: '150px' }}></wa-skeleton>
      </div>
    );
  }

  if (connectedClients.length === 0) {
    return (
      <wa-callout variant='neutral'>
        <wa-icon name='info-circle' slot='icon'></wa-icon>
        No clients currently connected to the hotspot.
      </wa-callout>
    );
  }

  return (
    <div className='wa-stack wa-gap-s'>
      {connectedClients.map((client: ConnectedClient, index: number) => (
        <wa-details
          key={client.macAddress || index}
          summary={client.hostname || client.ipAddress || client.macAddress}
        >
          <div className='wa-stack wa-gap-xs'>
            {client.ipAddress && (
              <div>
                <strong>IP Address:</strong> {client.ipAddress}
              </div>
            )}
            <div>
              <strong>MAC Address:</strong> {client.macAddress}
            </div>
            {client.hostname && (
              <div>
                <strong>Hostname:</strong> {client.hostname}
              </div>
            )}
            {client.signalStrength && (
              <div>
                <strong>Signal Strength:</strong> {client.signalStrength} dBm
              </div>
            )}
            {client.txRate && (
              <div>
                <strong>TX Rate:</strong> {client.txRate}
              </div>
            )}
            {client.rxRate && (
              <div>
                <strong>RX Rate:</strong> {client.rxRate}
              </div>
            )}
            {client.connectedTime && (
              <div>
                <strong>Last Activity:</strong> {client.connectedTime}
              </div>
            )}
          </div>
        </wa-details>
      ))}
    </div>
  );
};
