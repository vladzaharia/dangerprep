import React, { useMemo } from 'react';
import { faComputer } from '@fortawesome/free-solid-svg-icons';
import { useNetworkWorker, useHotspotFromWorker } from '../hooks/useNetworkWorker';
import type { WiFiInterface, ConnectedClient } from '../hooks/useNetworks';
import { DeviceCard } from './DeviceCard';
import type { DeviceCardTag } from './DeviceCard';

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
      <h2>Connected Clients</h2>
      <div className='wa-grid'>
        {connectedClients.map((client: ConnectedClient, index: number) => {
          const tags: DeviceCardTag[] = [];

          // MAC Address tag
          tags.push({
            label: 'MAC',
            value: client.macAddress,
            icon: 'fingerprint',
            variant: 'neutral'
          });

          // Signal Strength tag
          if (client.signalStrength) {
            tags.push({
              label: 'Signal',
              value: `${client.signalStrength} dBm`,
              icon: 'signal',
              variant: 'neutral'
            });
          }

          // TX Rate tag
          if (client.txRate) {
            tags.push({
              label: 'TX',
              value: client.txRate,
              icon: 'arrow-up',
              variant: 'neutral'
            });
          }

          // RX Rate tag
          if (client.rxRate) {
            tags.push({
              label: 'RX',
              value: client.rxRate,
              icon: 'arrow-down',
              variant: 'neutral'
            });
          }

          return (
            <DeviceCard
              key={client.macAddress || index}
              icon={faComputer}
              title={client.hostname || client.ipAddress || client.macAddress}
              subtitle={client.ipAddress && client.hostname ? client.ipAddress : undefined}
              tags={tags}
              className='connected-client'
            />
          );
        })}
      </div>
    </div>
  );
};
