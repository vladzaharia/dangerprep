import React from 'react';

import type { NetworkInterface } from '../../types/network';
import { formatBytes, formatNumber } from '../../utils/networkFormatting';

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

interface ISPDetailsPopupProps {
  iface: NetworkInterface;
}

export const ISPDetailsPopup: React.FC<ISPDetailsPopupProps> = ({ iface }) => {
  return (
    <div className='wa-stack wa-gap-m'>
      {/* ISP Info */}
      {(iface.ispName || iface.publicIpv4 || iface.publicIpv6) && (
        <DetailSection title='ISP Information'>
          {iface.ispName && <DetailRow label='ISP' value={iface.ispName} />}
          {iface.publicIpv4 && <DetailRow label='Public IPv4' value={iface.publicIpv4} />}
          {iface.publicIpv6 && <DetailRow label='Public IPv6' value={iface.publicIpv6} />}
        </DetailSection>
      )}

      {/* Statistics */}
      {(iface.rxBytes !== undefined ||
        iface.txBytes !== undefined ||
        iface.rxPackets !== undefined ||
        iface.txPackets !== undefined ||
        iface.rxErrors !== undefined ||
        iface.txErrors !== undefined ||
        iface.rxDropped !== undefined ||
        iface.txDropped !== undefined) && (
        <DetailSection title='Statistics'>
          {iface.rxBytes !== undefined && (
            <DetailRow label='RX Bytes' value={formatBytes(iface.rxBytes)} />
          )}
          {iface.txBytes !== undefined && (
            <DetailRow label='TX Bytes' value={formatBytes(iface.txBytes)} />
          )}
          {iface.rxPackets !== undefined && (
            <DetailRow label='RX Packets' value={formatNumber(iface.rxPackets)} />
          )}
          {iface.txPackets !== undefined && (
            <DetailRow label='TX Packets' value={formatNumber(iface.txPackets)} />
          )}
          {iface.rxErrors !== undefined && (
            <DetailRow label='RX Errors' value={formatNumber(iface.rxErrors)} />
          )}
          {iface.txErrors !== undefined && (
            <DetailRow label='TX Errors' value={formatNumber(iface.txErrors)} />
          )}
          {iface.rxDropped !== undefined && (
            <DetailRow label='RX Dropped' value={formatNumber(iface.rxDropped)} />
          )}
          {iface.txDropped !== undefined && (
            <DetailRow label='TX Dropped' value={formatNumber(iface.txDropped)} />
          )}
        </DetailSection>
      )}
    </div>
  );
};
