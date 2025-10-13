import React, { useMemo } from 'react';
import { useNetworkWorker, useHotspotFromWorker } from '../hooks/useNetworkWorker';
import { ConnectionStatusButton } from './ConnectionStatusButton';

/**
 * Loading skeleton for QR code section using Web Awesome components
 */
function QRCodeSkeleton() {
  return (
    <div className="wifi-connection-container">
      <div className="wifi-connection-content">
        {/* Left Side - Connection Details Skeleton */}
        <div className="wifi-details">
          <div className="wifi-detail-item">
            <span className="wifi-detail-label">Network Name:</span>
            {/* Skeleton INSIDE the wifi-detail-value container to maintain layout */}
            <div className="wifi-detail-value">
              <wa-skeleton effect="sheen" style={{ width: '100%', height: '2rem' }}></wa-skeleton>
            </div>
          </div>
          <div className="wifi-detail-item">
            <span className="wifi-detail-label">Password:</span>
            {/* Skeleton INSIDE the wifi-detail-value container to maintain layout */}
            <div className="wifi-detail-value">
              <wa-skeleton effect="sheen" style={{ width: '100%', height: '2rem' }}></wa-skeleton>
            </div>
          </div>

        </div>

        {/* Right Side - QR Code Skeleton */}
        <div className="wifi-qr">
          {/* QR code skeleton - exactly 200px to match wa-qr-code size */}
          <wa-skeleton effect="sheen" style={{ width: '200px', height: '200px', borderRadius: 'var(--wa-border-radius-m)' }}></wa-skeleton>
        </div>
      </div>

      {/* Instructions Skeleton */}
      <div className="wifi-instructions">
        <p>Scan the QR code with your device's camera or use the details above to connect to the WiFi network.</p>
      </div>
    </div>
  );
}

/**
 * QR Code content component with real-time updates
 */
function QRCodeContent() {
  // Use worker for real-time network updates
  const network = useNetworkWorker({
    pollInterval: 5000,
    autoStart: true
  });

  const hotspotInterface = useHotspotFromWorker(network.data);

  // Extract SSID and password from hotspot interface
  // Type guard to ensure we have a WiFi interface with the required properties
  const ssid = (hotspotInterface?.type === 'wifi' && 'ssid' in hotspotInterface)
    ? hotspotInterface.ssid || 'DangerPrep'
    : 'DangerPrep';
  const password = (hotspotInterface?.type === 'wifi' && 'password' in hotspotInterface)
    ? hotspotInterface.password || 'change_me'
    : 'change_me';

  // Generate WiFi QR code string
  const wifiQRString = useMemo(() => {
    // Standard WiFi QR code format: WIFI:T:WPA;S:SSID;P:password;H:false;;
    const escapedSSID = ssid.replace(/[\\;,":]/g, '\\$&');
    const escapedPassword = password.replace(/[\\;,":]/g, '\\$&');
    return `WIFI:T:WPA;S:${escapedSSID};P:${escapedPassword};H:false;;`;
  }, [ssid, password]);

  // Show loading state while fetching initial data
  if (network.loading && !network.data) {
    return <QRCodeSkeleton />;
  }

  return (
    <div className="wifi-connection-container">
      {/* Status Button with Badge - Top Right */}
      <ConnectionStatusButton />

      {/* Real-time update indicator */}
      {network.isPolling && (
        <div className="flex items-center gap-2 mb-4 text-sm text-green-600">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          <span>Live updates active</span>
          {network.lastUpdate && (
            <span className="text-xs text-gray-500">
              Updated: {new Date(network.lastUpdate).toLocaleTimeString()}
            </span>
          )}
        </div>
      )}

      {/* Connection Details and QR Code Side by Side */}
      <div className="wifi-connection-content">
        {/* Left Side - Connection Details */}
        <div className="wifi-details">
          <div className="wifi-detail-item">
            <span className="wifi-detail-label">Network Name:</span>
            <span className="wifi-detail-value">{ssid}</span>
          </div>
          <div className="wifi-detail-item">
            <span className="wifi-detail-label">Password:</span>
            <span className="wifi-detail-value">{password}</span>
          </div>
        </div>

        {/* Right Side - QR Code */}
        <div className="wifi-qr">
          <wa-qr-code
            value={wifiQRString}
            size={200}
            fill="rgba(199, 213, 237, 1)"
            background="oklab(0.234827 -0.00406564 -0.0311428 / 0.9)"
            label="WiFi Connection QR Code"
          />
        </div>
      </div>

      {/* Instructions Below */}
      <div className="wifi-instructions">
        <p>Scan the QR code with your device's camera or use the details above to connect to the WiFi network.</p>
      </div>
    </div>
  );
}

/**
 * QR Code Section component with real-time updates via Web Worker
 */
export const QRCodeSection: React.FC = () => {
  return <QRCodeContent />;
};
