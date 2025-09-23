import React, { useMemo } from 'react';

export const QRCodeSection: React.FC = () => {
  // Environment variables (build-time)
  const ssid = import.meta.env.VITE_WIFI_SSID || 'DangerPrep-Hotspot';
  const password = import.meta.env.VITE_WIFI_PASSWORD || 'changeme';

  // Generate WiFi QR code string
  const wifiQRString = useMemo(() => {
    // Standard WiFi QR code format: WIFI:T:WPA;S:SSID;P:password;H:false;;
    const escapedSSID = ssid.replace(/[\\;,":]/g, '\\$&');
    const escapedPassword = password.replace(/[\\;,":]/g, '\\$&');
    return `WIFI:T:WPA;S:${escapedSSID};P:${escapedPassword};H:false;;`;
  }, [ssid, password]);

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
            fill="rgb(255, 255, 255)"
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
