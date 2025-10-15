import React, { useMemo } from 'react';
import {
  faWifi,
  faEthernet,
  faServer,
  faGlobe,
  faNetworkWired,
} from '@fortawesome/free-solid-svg-icons';
import { useNetworkWorker } from '../hooks/useNetworkWorker';
import type { NetworkInterface } from '../hooks/useNetworks';
import { InterfaceCard } from './InterfaceCard';
import type { InterfaceCardField } from './InterfaceCard';

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

            const fields: InterfaceCardField[] = [];
            if (iface.ipAddress) {
              fields.push({ label: 'IP', value: iface.ipAddress });
            }

            return (
              <InterfaceCard
                key={iface.name}
                type='callout'
                variant={iface.state === "up" ? "success" : "danger"}
                icon={getInterfaceIcon(iface)}
                title={title}
                fields={fields}
                className="interface-callout"
              />
            );
          })
        )}
      </div>

      {/* Middle Column - Router/Device */}
      <div className='wa-stack wa-gap-m'>
        <h3 className='wa-heading-s'>&nbsp;</h3>
        <InterfaceCard
          type='card'
          icon={faServer}
          title="This Device"
          fields={deviceIPs
            .filter(({ name }) => !name.startsWith("br"))
            .map(({ name, ip }) => ({ label: name, value: ip }))}
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

            const fields: InterfaceCardField[] = [];
            if (iface.ipAddress) {
              fields.push({ label: 'IP', value: iface.ipAddress });
            }
            if (iface.gateway) {
              fields.push({ label: 'Gateway', value: iface.gateway });
            }

            return (
              <InterfaceCard
                key={iface.name}
                type='callout'
                variant={iface.state === "up" ? "success" : "danger"}
                icon={getInterfaceIcon(iface)}
                title={title}
                fields={fields}
                className="interface-callout"
              />
            );
          })
        )}
      </div>
    </div>
  );
};
