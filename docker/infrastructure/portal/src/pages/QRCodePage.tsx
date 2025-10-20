import React from 'react';

import { QRCodeSection } from '../components';

export const QRCodePage: React.FC = () => {
  return (
    <div className='qr-code-page wa-cluster wa-gap-none wa-align-items-center wa-justify-content-center'>
      <QRCodeSection />
    </div>
  );
};
