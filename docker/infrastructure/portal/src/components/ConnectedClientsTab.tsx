import React, { useMemo } from 'react';
import { faComputer } from '@fortawesome/free-solid-svg-icons';
import { useNetworkWorker, useHotspotFromWorker } from '../hooks/useNetworkWorker';
import type { WiFiInterface, ConnectedClient } from '../hooks/useNetworks';
import { DeviceCard } from './DeviceCard';
import type { DeviceCardField } from './DeviceCard';

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
      {connectedClients.map((client: ConnectedClient, index: number) => {
        const fields: DeviceCardField[] = [];

        if (client.ipAddress) {
          fields.push({ label: 'IP Address', value: client.ipAddress });
        }
        fields.push({ label: 'MAC Address', value: client.macAddress });
        if (client.hostname) {
          fields.push({ label: 'Hostname', value: client.hostname });
        }
        if (client.signalStrength) {
          fields.push({ label: 'Signal Strength', value: `${client.signalStrength} dBm` });
        }
        if (client.txRate) {
          fields.push({ label: 'TX Rate', value: client.txRate });
        }
        if (client.rxRate) {
          fields.push({ label: 'RX Rate', value: client.rxRate });
        }

        return (
          <DeviceCard
            key={client.macAddress || index}
            icon={faComputer}
            title={client.hostname || client.ipAddress || client.macAddress}
            subtitle={client.ipAddress && client.hostname ? client.ipAddress : undefined}
            fields={fields}
          />
        );
      })}
    </div>
  );
};
