import React, { useMemo } from 'react';
import {
  faWifi,
  faEthernet,
  faServer,
  faGlobe,
  faNetworkWired,
  faRoute,
} from '@fortawesome/free-solid-svg-icons';
import { useNetworkWorker } from '../../hooks/useNetworkWorker';
import type { NetworkInterface } from '../../hooks/useNetworks';
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
      return faNetworkWired;
    default:
      return faGlobe;
  }
}

/**
 * Status Tab Component - Shows network topology
 */
export const NetworkStatusTab: React.FC = () => {
  const network = useNetworkWorker({ pollInterval: 5000, autoStart: true });

  // Get LAN interfaces (hotspot/wlan)
  const lanInterfaces = useMemo(() => {
    if (!network.data?.interfaces) return [];
    return network.data.interfaces.filter(
      iface => iface.purpose === 'wlan' || iface.purpose === 'lan'
    );
  }, [network.data]);

  // Get WAN interfaces (internet)
  const wanInterfaces = useMemo(() => {
    if (!network.data?.interfaces) return [];
    return network.data.interfaces.filter(
      iface => iface.purpose === 'wan' && iface.type !== 'tailscale'
    );
  }, [network.data]);

  // Get device IP addresses
  const deviceIPs = useMemo(() => {
    if (!network.data?.interfaces) return [];
    return network.data.interfaces
      .filter(iface => iface.ipAddress && iface.state === 'up')
      .map(iface => ({ name: iface.name, ip: iface.ipAddress! }));
  }, [network.data]);

  if (network.loading && !network.data) {
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
            const title = iface.type === 'wifi' && 'ssid' in iface && iface.ssid
              ? `${iface.ssid} (${iface.name})`
              : iface.name;

            const tags: StatusCardTag[] = [];
            if (iface.ipAddress) {
              tags.push({
                label: 'IP',
                value: iface.ipAddress,
                icon: faNetworkWired,
                variant: 'neutral'
              });
            }

            return (
              <StatusCard
                key={iface.name}
                type='callout'
                variant={iface.state === "up" ? "success" : "danger"}
                layout='vertical'
                icon={getInterfaceIcon(iface)}
                title={title}
                tags={tags}
                className="interface-callout"
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
          icon={faServer}
          title="This Device"
          tags={deviceIPs
            .filter(({ name }) => !name.startsWith("br"))
            .map(({ name, ip }) => ({
              label: name,
              value: ip,
              icon: faNetworkWired,
              variant: 'neutral' as const
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
            const title = iface.type === 'wifi' && 'ssid' in iface && iface.ssid
              ? `${iface.ssid} (${iface.name})`
              : iface.name;

            const tags: StatusCardTag[] = [];
            if (iface.ipAddress) {
              tags.push({
                label: 'IP',
                value: iface.ipAddress,
                icon: faNetworkWired,
                variant: 'neutral'
              });
            }
            if (iface.gateway) {
              tags.push({
                label: 'Gateway',
                value: iface.gateway,
                icon: faRoute,
                variant: 'neutral'
              });
            }

            return (
              <StatusCard
                key={iface.name}
                type='callout'
                variant={iface.state === "up" ? "success" : "danger"}
                layout='vertical'
                icon={getInterfaceIcon(iface)}
                title={title}
                tags={tags}
                className="interface-callout"
              />
            );
          })
        )}
      </div>
    </div>
  );
};
