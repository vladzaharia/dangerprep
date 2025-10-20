import React from 'react';

import type { NetworkInterface, EthernetInterface, WiFiInterface } from '../../types/network';
import {
  formatUptime,
  formatLatency,
  formatPacketLoss,
  formatBoolean,
} from '../../utils/networkFormatting';

interface DetailRowProps {
  label: string;
  value: string | number | undefined;
}

const DetailRow: React.FC<DetailRowProps> = ({ label, value }) => (
  <div className='wa-flank wa-gap-m' style={{ justifyContent: 'space-between' }}>
    <span className='wa-caption-s' style={{ fontWeight: 500 }}>
      {label}
    </span>
    <span className='wa-caption-s'>{value || 'N/A'}</span>
  </div>
);

interface DetailSectionProps {
  title: string;
  children: React.ReactNode;
}

const DetailSection: React.FC<DetailSectionProps> = ({ title, children }) => (
  <div className='wa-stack wa-gap-xs'>
    <span className='wa-body-xs' style={{ fontWeight: 600, opacity: 0.7 }}>
      {title}
    </span>
    <div className='wa-stack wa-gap-2xs'>{children}</div>
  </div>
);

interface InterfaceDetailsPopupProps {
  iface: NetworkInterface;
}

export const InterfaceDetailsPopup: React.FC<InterfaceDetailsPopupProps> = ({ iface }) => {
  return (
    <div className='wa-stack wa-gap-m'>
      {/* Connection Info - Only show gateway, MAC, DNS (IPv4 already in tags) */}
      {(iface.gateway || iface.macAddress || (iface.dnsServers && iface.dnsServers.length > 0)) && (
        <DetailSection title='Connection'>
          {iface.gateway && <DetailRow label='Gateway' value={iface.gateway} />}
          {iface.macAddress && <DetailRow label='MAC Address' value={iface.macAddress} />}
          {iface.dnsServers && iface.dnsServers.length > 0 && (
            <DetailRow label='DNS Servers' value={iface.dnsServers.join(', ')} />
          )}
        </DetailSection>
      )}

      {/* IPv6 Address - Show separately if available */}
      {iface.ipv6Address && (
        <DetailSection title='IPv6'>
          <DetailRow label='Address' value={iface.ipv6Address} />
        </DetailSection>
      )}

      {/* WAN Metrics */}
      {iface.purpose === 'wan' &&
        (iface.dhcpStatus !== undefined ||
          iface.connectionUptime !== undefined ||
          iface.latencyToGateway !== undefined ||
          iface.packetLoss !== undefined) && (
          <DetailSection title='WAN Metrics'>
            {iface.dhcpStatus !== undefined && (
              <DetailRow label='DHCP' value={formatBoolean(iface.dhcpStatus)} />
            )}
            {iface.connectionUptime !== undefined && (
              <DetailRow label='Uptime' value={formatUptime(iface.connectionUptime)} />
            )}
            {iface.latencyToGateway !== undefined && (
              <DetailRow label='Latency' value={formatLatency(iface.latencyToGateway)} />
            )}
            {iface.packetLoss !== undefined && (
              <DetailRow label='Packet Loss' value={formatPacketLoss(iface.packetLoss)} />
            )}
          </DetailSection>
        )}

      {/* Ethernet Details */}
      {iface.type === 'ethernet' && (
        <>
          {((iface as EthernetInterface).speed ||
            (iface as EthernetInterface).duplex ||
            (iface as EthernetInterface).linkDetected !== undefined) && (
            <DetailSection title='Ethernet'>
              {(iface as EthernetInterface).speed && (
                <DetailRow label='Speed' value={(iface as EthernetInterface).speed} />
              )}
              {(iface as EthernetInterface).duplex && (
                <DetailRow label='Duplex' value={(iface as EthernetInterface).duplex} />
              )}
              {(iface as EthernetInterface).linkDetected !== undefined && (
                <DetailRow
                  label='Link Detected'
                  value={formatBoolean((iface as EthernetInterface).linkDetected)}
                />
              )}
            </DetailSection>
          )}
        </>
      )}

      {/* WiFi Details - Only show channel and signal info (frequency/security already in tags) */}
      {(iface.type === 'wifi' || iface.type === 'hotspot') && (
        <>
          {((iface as WiFiInterface).channel ||
            (iface as WiFiInterface).signalStrength !== undefined ||
            (iface as WiFiInterface).linkQuality !== undefined ||
            (iface as WiFiInterface).noiseLevel !== undefined ||
            (iface as WiFiInterface).bitRate) && (
            <DetailSection title='WiFi Details'>
              {(iface as WiFiInterface).channel && (
                <DetailRow label='Channel' value={(iface as WiFiInterface).channel} />
              )}
              {(iface as WiFiInterface).signalStrength !== undefined && (
                <DetailRow
                  label='Signal Strength'
                  value={`${(iface as WiFiInterface).signalStrength} dBm`}
                />
              )}
              {(iface as WiFiInterface).linkQuality !== undefined && (
                <DetailRow
                  label='Link Quality'
                  value={`${(iface as WiFiInterface).linkQuality}%`}
                />
              )}
              {(iface as WiFiInterface).noiseLevel !== undefined && (
                <DetailRow
                  label='Noise Level'
                  value={`${(iface as WiFiInterface).noiseLevel} dBm`}
                />
              )}
              {(iface as WiFiInterface).bitRate && (
                <DetailRow label='Bit Rate' value={(iface as WiFiInterface).bitRate} />
              )}
            </DetailSection>
          )}
        </>
      )}
    </div>
  );
};
