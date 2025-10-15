import React, { useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faWifi,
  faEthernet,
  faServer,
  faGlobe,
  faNetworkWired,
} from '@fortawesome/free-solid-svg-icons';
import { useNetworkWorker } from '../hooks/useNetworkWorker';
import type { NetworkInterface } from '../hooks/useNetworks';

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
          lanInterfaces.map(iface => (
            <wa-card key={iface.name} appearance='outlined'>
              <div className='wa-stack wa-gap-xs'>
                <div className='wa-flank wa-gap-s'>
                  <FontAwesomeIcon icon={getInterfaceIcon(iface)} size='lg' />
                  <div className='wa-stack wa-gap-3xs'>
                    <span className='wa-body-s' style={{ fontWeight: 600 }}>
                      {iface.type === 'wifi' && 'ssid' in iface && iface.ssid
                        ? `${iface.ssid} (${iface.name})`
                        : iface.name}
                    </span>
                    {iface.ipAddress && <span className='wa-caption-s'>{iface.ipAddress}</span>}
                  </div>
                </div>
              </div>
            </wa-card>
          ))
        )}
      </div>

      {/* Middle Column - Router/Device */}
      <div className='wa-stack wa-gap-m'>
        <h3 className='wa-heading-s'>&nbsp;</h3>
        <wa-card appearance='outlined'>
          <div className='wa-stack wa-gap-m wa-align-items-center'>
            <FontAwesomeIcon icon={faServer} size='2x' />
            <div className='wa-stack wa-gap-xs wa-align-items-center'>
              {deviceIPs.length > 0 && (
                <div className='wa-stack wa-gap-3xs wa-align-items-center'>
                  {deviceIPs.map(({ name, ip }) => (
                    <span key={name} className='wa-caption-s'>
                      <strong>{name}</strong>: {ip}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </wa-card>
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
          wanInterfaces.map(iface => (
            <wa-card key={iface.name} appearance='outlined'>
              <div className='wa-stack wa-gap-xs'>
                <div className='wa-flank wa-gap-s'>
                  <FontAwesomeIcon icon={getInterfaceIcon(iface)} size='lg' />
                  <div className='wa-stack wa-gap-3xs'>
                    <span className='wa-body-s' style={{ fontWeight: 600 }}>
                      {iface.type === 'wifi' && 'ssid' in iface && iface.ssid
                        ? `${iface.ssid} (${iface.name})`
                        : iface.name}
                    </span>
                    {iface.ipAddress && (
                      <span className='wa-caption-s'>
                        <strong>IP:</strong> {iface.ipAddress}
                      </span>
                    )}
                    {iface.gateway && (
                      <span className='wa-caption-s'>
                        <strong>Gateway:</strong> {iface.gateway}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </wa-card>
          ))
        )}
      </div>
    </div>
  );
};
