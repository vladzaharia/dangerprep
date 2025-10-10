import React, { useMemo } from 'react';
import { useWiFiConfig } from '../hooks/useConfig';

export const QRCodeSection: React.FC = () => {
  // Get WiFi configuration from API (runtime)
  const { wifi, loading, error } = useWiFiConfig();
  const { ssid, password } = wifi;

  // Generate WiFi QR code string
  const wifiQRString = useMemo(() => {
    // Standard WiFi QR code format: WIFI:T:WPA;S:SSID;P:password;H:false;;
    const escapedSSID = ssid.replace(/[\\;,":]/g, '\\$&');
    const escapedPassword = password.replace(/[\\;,":]/g, '\\$&');
    return `WIFI:T:WPA;S:${escapedSSID};P:${escapedPassword};H:false;;`;
  }, [ssid, password]);

  // Show loading state
  if (loading) {
    return (
      <div className="wifi-connection-container">
        <div className="wifi-connection-content">
          <div className="wifi-details">
            <p>Loading WiFi configuration...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show error state with fallback
  if (error) {
    console.warn('WiFi config error:', error);
    // Continue with fallback values from the hook
  }

  return (
    <div className="wifi-connection-container">
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
        <p>Scan the QR code with your device's camera to automatically connect to the WiFi network, or use the connection details above to connect manually.</p>
      </div>
    </div>
  );
};
