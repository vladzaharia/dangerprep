import React, { useMemo } from 'react';
import {
  faComputer,
  faFingerprint,
  faSignal,
  faArrowUp,
  faArrowDown,
  faInfoCircle
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useNetworkWorker, useHotspotFromWorker } from '../../hooks/useNetworkWorker';
import type { WiFiInterface, ConnectedClient } from '../../hooks/useNetworks';
import { StatusCard } from '../cards/StatusCard';
import type { StatusCardTag } from '../cards/StatusCard';

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
        <span slot='icon'>
          <FontAwesomeIcon icon={faInfoCircle} />
        </span>
        No clients currently connected to the hotspot.
      </wa-callout>
    );
  }

  return (
    <div className='wa-stack wa-gap-s'>
      <h2>Connected Clients</h2>
      <div className='wa-grid'>
        {connectedClients.map((client: ConnectedClient, index: number) => {
          const tags: StatusCardTag[] = [];

          // MAC Address tag
          tags.push({
            label: 'MAC',
            value: client.macAddress,
            icon: <FontAwesomeIcon icon={faFingerprint} />,
            variant: 'neutral'
          });

          // Signal Strength tag
          if (client.signalStrength) {
            tags.push({
              label: 'Signal',
              value: `${client.signalStrength} dBm`,
              icon: <FontAwesomeIcon icon={faSignal} />,
              variant: 'neutral'
            });
          }

          // TX Rate tag
          if (client.txRate) {
            tags.push({
              label: 'TX',
              value: client.txRate,
              icon: <FontAwesomeIcon icon={faArrowUp} />,
              variant: 'neutral'
            });
          }

          // RX Rate tag
          if (client.rxRate) {
            tags.push({
              label: 'RX',
              value: client.rxRate,
              icon: <FontAwesomeIcon icon={faArrowDown} />,
              variant: 'neutral'
            });
          }

          return (
            <StatusCard
              key={client.macAddress || index}
              type='card'
              layout='horizontal'
              icon={<FontAwesomeIcon icon={faComputer} size='lg' />}
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
