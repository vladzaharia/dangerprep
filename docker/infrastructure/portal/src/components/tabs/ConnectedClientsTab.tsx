import React, { useMemo } from 'react';
import {
  faComputerClassic,
  faKey,
  faSignal,
  faCloudArrowUp,
  faCloudArrowDown,
  faCircleInfo,
} from '@awesome.me/kit-a765fc5647/icons/utility-duo/semibold';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useHotspotInterface } from '../../hooks/useSWRData';
import type { WiFiInterface, ConnectedClient } from '../../types/network';
import { StatusCard } from '../cards/StatusCard';
import type { StatusCardTag } from '../cards/StatusCard';

/**
 * Connected Clients Tab Component
 */
export const ConnectedClientsTab: React.FC = () => {
  const { data: hotspot } = useHotspotInterface();

  // Get connected clients from hotspot interface
  const connectedClients = useMemo(() => {
    if (!hotspot || hotspot.type !== 'wifi') return [];
    const wifiInterface = hotspot as WiFiInterface;
    return wifiInterface.connectedClients || [];
  }, [hotspot]);

  // Note: Loading state handled by parent Suspense boundary

  if (connectedClients.length === 0) {
    return (
      <wa-callout variant='neutral'>
        <div slot='icon' style={{ display: 'contents' }}>
          <FontAwesomeIcon icon={faCircleInfo} />
        </div>
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
            icon: <FontAwesomeIcon icon={faKey} />,
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
              icon: <FontAwesomeIcon icon={faCloudArrowUp} />,
              variant: 'neutral'
            });
          }

          // RX Rate tag
          if (client.rxRate) {
            tags.push({
              label: 'RX',
              value: client.rxRate,
              icon: <FontAwesomeIcon icon={faCloudArrowDown} />,
              variant: 'neutral'
            });
          }

          return (
            <StatusCard
              key={client.macAddress || index}
              type='card'
              layout='horizontal'
              icon={<FontAwesomeIcon icon={faComputerClassic} size='lg' />}
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
