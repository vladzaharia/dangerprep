// Import WebAwesome CSS files locally
import '@awesome.me/webawesome/dist/styles/webawesome.css';
import '@awesome.me/webawesome/dist/styles/themes/default.css';
import '@awesome.me/webawesome/dist/styles/color/palettes/default.css';

// Import WebAwesome components
import '@awesome.me/webawesome/dist/components/badge/badge.js';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/callout/callout.js';
import '@awesome.me/webawesome/dist/components/card/card.js';
import '@awesome.me/webawesome/dist/components/details/details.js';
import '@awesome.me/webawesome/dist/components/icon/icon.js';
import '@awesome.me/webawesome/dist/components/qr-code/qr-code.js';
import '@awesome.me/webawesome/dist/components/select/select.js';
import '@awesome.me/webawesome/dist/components/skeleton/skeleton.js';
import '@awesome.me/webawesome/dist/components/switch/switch.js';
import '@awesome.me/webawesome/dist/components/tab-group/tab-group.js';
import '@awesome.me/webawesome/dist/components/tag/tag.js';

// Set default icon family for WebAwesome
import { setDefaultIconFamily } from '@awesome.me/webawesome';
import React from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import './styles/global.css';

// Import fonts locally
import '@fontsource/sansation/400.css';
import '@fontsource/sansation/700.css';
import '@fontsource/geist-mono/400.css';
import '@fontsource/geist-mono/500.css';

setDefaultIconFamily('duotone');

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
