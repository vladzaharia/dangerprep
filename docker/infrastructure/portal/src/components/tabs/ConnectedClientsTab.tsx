import {
  faComputerClassic,
  faKey,
  faSignal,
  faCloudArrowUp,
  faCloudArrowDown,
  faCircleInfo,
} from '@awesome.me/kit-a765fc5647/icons/utility-duo/semibold';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useMemo } from 'react';

import { useHotspotInterface } from '../../hooks/useSWRData';
import type { WiFiInterface, ConnectedClient } from '../../types/network';
import { createIconStyle, ICON_STYLES } from '../../utils/iconStyles';
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
      <wa-callout variant='neutral' className='wa-gap-s'>
        <div slot='icon' style={{ display: 'contents' }}>
          <FontAwesomeIcon icon={faCircleInfo} style={createIconStyle(ICON_STYLES.info)} />
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
            icon: <FontAwesomeIcon icon={faKey} style={createIconStyle(ICON_STYLES.security)} />,
            variant: 'neutral',
          });

          // Signal Strength tag
          if (client.signalStrength) {
            tags.push({
              label: 'Signal',
              value: `${client.signalStrength} dBm`,
              icon: <FontAwesomeIcon icon={faSignal} style={createIconStyle(ICON_STYLES.signal)} />,
              variant: 'neutral',
            });
          }

          // TX Rate tag
          if (client.txRate) {
            tags.push({
              label: 'TX',
              value: client.txRate,
              icon: (
                <FontAwesomeIcon
                  icon={faCloudArrowUp}
                  style={createIconStyle(ICON_STYLES.upload)}
                />
              ),
              variant: 'neutral',
            });
          }

          // RX Rate tag
          if (client.rxRate) {
            tags.push({
              label: 'RX',
              value: client.rxRate,
              icon: (
                <FontAwesomeIcon
                  icon={faCloudArrowDown}
                  style={createIconStyle(ICON_STYLES.download)}
                />
              ),
              variant: 'neutral',
            });
          }

          return (
            <StatusCard
              key={client.macAddress || index}
              layout='horizontal'
              icon={
                <FontAwesomeIcon
                  icon={faComputerClassic}
                  size='lg'
                  style={{ ...createIconStyle(ICON_STYLES.device), maxWidth: '2rem' }}
                />
              }
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
