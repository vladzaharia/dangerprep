import React, { useState, useMemo } from 'react';

interface QRCodeSectionProps {
  isKioskMode: boolean;
}

export const QRCodeSection: React.FC<QRCodeSectionProps> = ({ isKioskMode }) => {
  // Environment variables (build-time)
  const ssid = import.meta.env.VITE_WIFI_SSID || 'DangerPrep-Hotspot';
  const password = import.meta.env.VITE_WIFI_PASSWORD || 'changeme';
  const [showQR, setShowQR] = useState(true);

  // Generate WiFi QR code string
  const wifiQRString = useMemo(() => {
    // Standard WiFi QR code format: WIFI:T:WPA;S:SSID;P:password;H:false;;
    const escapedSSID = ssid.replace(/[\\;,":]/g, '\\$&');
    const escapedPassword = password.replace(/[\\;,":]/g, '\\$&');
    return `WIFI:T:WPA;S:${escapedSSID};P:${escapedPassword};H:false;;`;
  }, [ssid, password]);

  const toggleView = () => {
    if (!isKioskMode) {
      setShowQR(!showQR);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleView();
    }
  };

  return (
    <wa-callout size='large' appearance='outlined filled'>
      <div
        className={`qr-section ${!isKioskMode ? 'qr-section--clickable' : ''}`}
        onClick={toggleView}
        onKeyDown={handleKeyDown}
        role={!isKioskMode ? 'button' : undefined}
        tabIndex={!isKioskMode ? 0 : undefined}
        aria-label={
          showQR
            ? 'WiFi QR Code - Click to show manual connection details'
            : 'WiFi connection details - Click to show QR code'
        }
      >
        {showQR ? (
          <div className='wa-stack wa-align-items-center qr-code-container'>
            <wa-qr-code
              value={wifiQRString}
              size={200}
              fill='#ffffff'
              background='#1a1a1a'
              label='WiFi Connection QR Code'
            />
            <div className='wa-stack qr-code-info'>
              <h3 className='qr-code-title'>Scan to Connect</h3>
              <p className='qr-code-description'>
                Point your camera at the QR code to automatically connect to the WiFi network
              </p>
              {!isKioskMode && (
                <p className='qr-code-hint'>
                  <small>Tap for manual connection details</small>
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className='wa-stack manual-connection'>
            <h3 className='manual-title'>WiFi Connection Details</h3>
            <div className='wa-stack connection-details'>
              <div className='detail-item'>
                <span className='detail-label'>Network Name (SSID):</span>
                <span className='detail-value'>{ssid}</span>
              </div>
              <div className='detail-item'>
                <span className='detail-label'>Password:</span>
                <span className='detail-value'>{password}</span>
              </div>
              <div className='detail-item'>
                <span className='detail-label'>Security:</span>
                <span className='detail-value'>WPA/WPA2</span>
              </div>
            </div>
            {!isKioskMode && (
              <p className='manual-hint'>
                <small>Tap to show QR code</small>
              </p>
            )}
          </div>
        )}
      </div>
    </wa-callout>
  );
};
