import React, { Suspense, useMemo } from 'react';

import { useHotspotInterface } from '../../hooks/useSWRData';
import type { WiFiInterface } from '../../types/network';

/**
 * Loading skeleton for QR code section using Web Awesome components
 */
function QRCodeSkeleton() {
  return (
    <div className='wifi-connection-container'>
      <div className='wifi-connection-content'>
        {/* Left Side - Connection Details Skeleton */}
        <div className='wifi-details'>
          <div className='wifi-detail-item'>
            <span className='wifi-detail-label'>Network Name:</span>
            {/* Skeleton INSIDE the wifi-detail-value container to maintain layout */}
            <div className='wifi-detail-value'>
              <wa-skeleton effect='sheen' style={{ width: '100%', height: '2rem' }}></wa-skeleton>
            </div>
          </div>
          <div className='wifi-detail-item'>
            <span className='wifi-detail-label'>Password:</span>
            {/* Skeleton INSIDE the wifi-detail-value container to maintain layout */}
            <div className='wifi-detail-value'>
              <wa-skeleton effect='sheen' style={{ width: '100%', height: '2rem' }}></wa-skeleton>
            </div>
          </div>
        </div>

        {/* Right Side - QR Code Skeleton */}
        <div className='wifi-qr'>
          {/* QR code skeleton - exactly 200px to match wa-qr-code size */}
          <wa-skeleton
            effect='sheen'
            style={{ width: '200px', height: '200px', borderRadius: 'var(--wa-border-radius-m)' }}
          ></wa-skeleton>
        </div>
      </div>

      {/* Instructions Skeleton */}
      <div className='wifi-instructions'>
        <p>
          Scan the QR code with your device's camera or use the details above to connect to the WiFi
          network.
        </p>
      </div>
    </div>
  );
}

/**
 * QR Code content component with real-time updates via SWR
 */
function QRCodeContent() {
  // Use SWR for real-time network updates with auto-reconnect
  const { data: hotspotInterface } = useHotspotInterface();

  // Extract SSID and password from hotspot interface
  // Type guard to ensure we have a WiFi interface with the required properties
  let ssid = 'DangerPrep';
  let password = 'change_me';

  if (hotspotInterface?.type === 'wifi') {
    const wifiInterface = hotspotInterface as WiFiInterface;
    ssid = wifiInterface.ssid || 'DangerPrep';
    password = wifiInterface.password || 'change_me';
  }

  // Generate WiFi QR code string
  const wifiQRString = useMemo(() => {
    // Standard WiFi QR code format: WIFI:T:WPA;S:SSID;P:password;H:false;;
    const escapedSSID = ssid.replace(/[\\;,":]/g, '\\$&');
    const escapedPassword = password.replace(/[\\;,":]/g, '\\$&');
    return `WIFI:T:WPA;S:${escapedSSID};P:${escapedPassword};H:false;;`;
  }, [ssid, password]);

  return (
    <div className='wifi-connection-container'>
      {/* Connection Details and QR Code Side by Side */}
      <div className='wifi-connection-content'>
        {/* Left Side - Connection Details */}
        <div className='wifi-details'>
          <div className='wifi-detail-item'>
            <span className='wifi-detail-label'>Network Name:</span>
            <span className='wifi-detail-value'>{ssid}</span>
          </div>
          <div className='wifi-detail-item'>
            <span className='wifi-detail-label'>Password:</span>
            <span className='wifi-detail-value'>{password}</span>
          </div>
        </div>

        {/* Right Side - QR Code */}
        <div className='wifi-qr'>
          <wa-qr-code
            value={wifiQRString}
            size={200}
            fill='rgba(199, 213, 237, 1)'
            background='oklab(0.234827 -0.00406564 -0.0311428 / 0.9)'
            label='WiFi Connection QR Code'
          />
        </div>
      </div>

      {/* Instructions Below */}
      <div className='wifi-instructions'>
        <p>
          Scan the QR code with your device's camera or use the details above to connect to the WiFi
          network.
        </p>
      </div>
    </div>
  );
}

/**
 * QR Code Section component with React 19 Suspense
 */
export const QRCodeSection: React.FC = () => {
  return (
    <Suspense fallback={<QRCodeSkeleton />}>
      <QRCodeContent />
    </Suspense>
  );
};
