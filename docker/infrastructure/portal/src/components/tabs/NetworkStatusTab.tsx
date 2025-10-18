import { faEthernet, faRouter, faServer } from '@awesome.me/kit-a765fc5647/icons/duotone/solid';
import {
  faWifi,
  faGlobe,
  faShieldCheck,
  faHardDrive,
} from '@awesome.me/kit-a765fc5647/icons/utility-duo/semibold';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useMemo } from 'react';

import { useNetworkSummary } from '../../hooks/useSWRData';
import type { NetworkInterface } from '../../types/network';
import { createIconStyle, ICON_STYLES } from '../../utils/iconStyles';
import { StatusCard } from '../cards/StatusCard';
import type { StatusCardTag } from '../cards/StatusCard';

/**
 * Get icon for network interface type
 */
function getInterfaceIcon(iface: NetworkInterface) {
  switch (iface.type) {
    case 'wifi':
    case 'hotspot':
      return faWifi;
    case 'ethernet':
      return faEthernet;
    case 'tailscale':
      return faShieldCheck;
    default:
      return faGlobe;
  }
}

/**
 * Get icon color based on interface type and state
 */
function getInterfaceIconColor(iface: NetworkInterface): string | undefined {
  if (iface.state !== 'up') return undefined;

  switch (iface.type) {
    case 'wifi':
    case 'hotspot':
      return '#3b82f6'; // Blue for WiFi
    case 'ethernet':
      return '#10b981'; // Green for Ethernet
    case 'tailscale':
      return '#a855f7'; // Purple for Tailscale
    default:
      return '#6b7280'; // Gray for other
  }
}

/**
 * Status Tab Component - Shows network topology
 */
export const NetworkStatusTab: React.FC = () => {
  const { data: networkData } = useNetworkSummary();

  // Get LAN interfaces (hotspot/wlan)
  const lanInterfaces = useMemo(() => {
    if (!networkData?.interfaces) return [];
    return networkData.interfaces.filter(
      iface => iface.purpose === 'wlan' || iface.purpose === 'lan'
    );
  }, [networkData]);

  // Get WAN interfaces (internet)
  // Include Tailscale IF it's being used as an exit node
  const wanInterfaces = useMemo(() => {
    if (!networkData?.interfaces) return [];
    return networkData.interfaces.filter(
      iface =>
        iface.purpose === 'wan' &&
        (iface.type !== 'tailscale' ||
          (iface.type === 'tailscale' && 'exitNode' in iface && iface.exitNode))
    );
  }, [networkData]);

  // Get device IP addresses
  const deviceIPs = useMemo(() => {
    if (!networkData?.interfaces) return [];
    return networkData.interfaces
      .filter(
        (iface): iface is typeof iface & { ipAddress: string } =>
          iface.ipAddress !== undefined && iface.ipAddress !== null && iface.state === 'up'
      )
      .map(iface => ({ name: iface.name, ip: iface.ipAddress }));
  }, [networkData]);

  // Note: Loading state handled by parent Suspense boundary
  if (!networkData) {
    return (
      <div className='wa-stack wa-gap-m'>
        <wa-skeleton effect='sheen' style={{ width: '100%', height: '200px' }}></wa-skeleton>
      </div>
    );
  }

  return (
    <div
      className='wa-grid wa-gap-l'
      style={{ '--min-column-size': '200px' } as React.CSSProperties}
    >
      {/* Left Column - LAN Interfaces */}
      <div className='wa-stack wa-gap-m'>
        <h3 className='wa-heading-s'>LAN</h3>
        {lanInterfaces.length === 0 ? (
          <wa-card appearance='outlined'>
            <div className='wa-stack wa-gap-xs'>
              <span className='wa-caption-s'>No LAN interfaces</span>
            </div>
          </wa-card>
        ) : (
          lanInterfaces.map(iface => {
            const title =
              iface.type === 'wifi' && 'ssid' in iface && iface.ssid
                ? `${iface.ssid} (${iface.name})`
                : iface.name;

            const tags: StatusCardTag[] = [];
            if (iface.ipAddress) {
              tags.push({
                label: 'IP',
                value: iface.ipAddress,
                icon: (
                  <FontAwesomeIcon icon={faGlobe} style={createIconStyle(ICON_STYLES.network)} />
                ),
                variant: 'neutral',
              });
            }

            const iconColor = getInterfaceIconColor(iface);
            let iconStyle;
            if (iconColor) {
              if (iface.type === 'wifi' || iface.type === 'hotspot') {
                iconStyle = createIconStyle(ICON_STYLES.wifi);
              } else if (iface.type === 'ethernet') {
                iconStyle = createIconStyle(ICON_STYLES.ethernet);
              } else if (iface.type === 'tailscale') {
                iconStyle = createIconStyle(ICON_STYLES.tailscale);
              } else {
                iconStyle = createIconStyle(ICON_STYLES.neutral);
              }
            }

            return (
              <StatusCard
                key={iface.name}
                type='callout'
                variant={iface.state === 'up' ? 'success' : 'danger'}
                layout='vertical'
                icon={
                  <FontAwesomeIcon icon={getInterfaceIcon(iface)} size='lg' style={iconStyle} />
                }
                title={title}
                tags={tags}
                className='interface-callout'
              />
            );
          })
        )}
      </div>

      {/* Middle Column - Router/Device */}
      <div className='wa-stack wa-gap-m'>
        <h3 className='wa-heading-s'>&nbsp;</h3>
        <StatusCard
          type='card'
          layout='vertical'
          icon={
            <FontAwesomeIcon
              icon={faServer}
              size='lg'
              style={
                {
                  '--fa-primary-color': '#6366f1', // Indigo for device
                } as React.CSSProperties
              }
            />
          }
          title='This Device'
          tags={deviceIPs
            .filter(({ name }) => !name.startsWith('br'))
            .map(({ name, ip }) => ({
              label: name,
              value: ip,
              variant: 'neutral' as const,
            }))}
        />
      </div>

      {/* Right Column - WAN Interfaces */}
      <div className='wa-stack wa-gap-m'>
        <h3 className='wa-heading-s'>Internet</h3>
        {wanInterfaces.length === 0 ? (
          <wa-card appearance='outlined'>
            <div className='wa-stack wa-gap-xs'>
              <span className='wa-caption-s'>No internet connection</span>
            </div>
          </wa-card>
        ) : (
          wanInterfaces.map(iface => {
            const title =
              iface.type === 'wifi' && 'ssid' in iface && iface.ssid
                ? `${iface.ssid} (${iface.name})`
                : iface.name;

            const tags: StatusCardTag[] = [];
            if (iface.ipAddress) {
              tags.push({
                label: 'IP',
                value: iface.ipAddress,
                icon: (
                  <FontAwesomeIcon
                    icon={faGlobe}
                    style={
                      {
                        '--fa-primary-color': '#10b981', // Green for IP/network
                        '--fa-primary-opacity': 0.9,
                      } as React.CSSProperties
                    }
                  />
                ),
                variant: 'neutral',
              });
            }
            if (iface.gateway) {
              tags.push({
                label: 'Gateway',
                value: iface.gateway,
                icon: (
                  <FontAwesomeIcon icon={faRouter} style={createIconStyle(ICON_STYLES.gateway)} />
                ),
                variant: 'neutral',
              });
            }

            return (
              <StatusCard
                key={iface.name}
                type='callout'
                variant={iface.state === 'up' ? 'success' : 'danger'}
                layout='vertical'
                icon={
                  <FontAwesomeIcon
                    icon={getInterfaceIcon(iface)}
                    size='lg'
                    style={createIconStyle(ICON_STYLES[iface.type])}
                  />
                }
                title={title}
                tags={tags}
                className='interface-callout'
              />
            );
          })
        )}
      </div>
    </div>
  );
};
