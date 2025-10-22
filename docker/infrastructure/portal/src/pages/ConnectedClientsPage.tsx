import {
  faComputerClassic,
  faKey,
  faSignal,
  faCloudArrowUp,
  faCloudArrowDown,
  faCircleInfo,
} from '@awesome.me/kit-a765fc5647/icons/utility-duo/semibold';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useMemo, Suspense } from 'react';

import { StatusCard } from '../components/cards/StatusCard';
import type { StatusCardTag } from '../components/cards/StatusCard';
import { useHotspotInterface } from '../hooks/useSWRData';
import type { WiFiInterface, ConnectedClient } from '../types/network';
import { createIconStyle, ICON_STYLES } from '../utils/iconStyles';

/**
 * Loading skeleton for connected clients page
 */
function ConnectedClientsSkeleton() {
  return (
    <div className='wa-stack wa-gap-s'>
      <h2>Connected Clients</h2>
      <div className='wa-grid'>
        {Array.from({ length: 3 }, (_, index) => (
          <wa-card key={index} appearance='outlined'>
            <div className='wa-stack wa-gap-m'>
              <div className='wa-flank wa-gap-m wa-align-items-center'>
                <wa-skeleton
                  effect='sheen'
                  style={{ width: '48px', height: '48px', borderRadius: '6px' }}
                ></wa-skeleton>
                <div className='wa-stack wa-gap-xs' style={{ flex: 1 }}>
                  <wa-skeleton
                    effect='sheen'
                    style={{ width: `${120 + index * 20}px`, height: '20px' }}
                  ></wa-skeleton>
                  <wa-skeleton
                    effect='sheen'
                    style={{ width: `${100 + index * 15}px`, height: '16px' }}
                  ></wa-skeleton>
                </div>
              </div>
              <div className='wa-cluster wa-gap-xs'>
                {Array.from({ length: 3 }, (_, tagIndex) => (
                  <wa-skeleton
                    key={tagIndex}
                    effect='sheen'
                    style={{ width: '80px', height: '24px', borderRadius: '4px' }}
                  ></wa-skeleton>
                ))}
              </div>
            </div>
          </wa-card>
        ))}
      </div>
    </div>
  );
}

/**
 * Connected Clients Page Component
 */
export const ConnectedClientsPage: React.FC = () => {
  const { data: hotspot } = useHotspotInterface();

  // Get connected clients from hotspot interface
  const connectedClients = useMemo(() => {
    if (!hotspot || hotspot.type !== 'wifi') return [];
    const wifiInterface = hotspot as WiFiInterface;
    return wifiInterface.connectedClients || [];
  }, [hotspot]);

  const content = (
    <>
      {connectedClients.length === 0 ? (
        <wa-callout variant='neutral' className='wa-gap-s'>
          <div slot='icon' style={{ display: 'contents' }}>
            <FontAwesomeIcon icon={faCircleInfo} style={createIconStyle(ICON_STYLES.info)} />
          </div>
          No clients currently connected to the hotspot.
        </wa-callout>
      ) : (
        <div className='wa-stack wa-gap-s'>
          <h2>Connected Clients</h2>
          <div className='wa-grid'>
            {connectedClients.map((client: ConnectedClient, index: number) => {
              const tags: StatusCardTag[] = [];

              // MAC Address tag
              tags.push({
                label: 'MAC',
                value: client.macAddress,
                icon: (
                  <FontAwesomeIcon icon={faKey} style={createIconStyle(ICON_STYLES.security)} />
                ),
                variant: 'neutral',
              });

              // Signal Strength tag
              if (client.signalStrength) {
                tags.push({
                  label: 'Signal',
                  value: `${client.signalStrength} dBm`,
                  icon: (
                    <FontAwesomeIcon icon={faSignal} style={createIconStyle(ICON_STYLES.signal)} />
                  ),
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
      )}
    </>
  );

  return (
    <div className='connected-clients-page'>
      <Suspense fallback={<ConnectedClientsSkeleton />}>{content}</Suspense>
    </div>
  );
};
