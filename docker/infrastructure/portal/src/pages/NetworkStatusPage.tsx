import React from 'react';
import { NetworkStatusTab, ConnectedClientsTab, TailscaleTab } from '../components';

/**
 * Network Status Page Component
 */
export const NetworkStatusPage: React.FC = () => {
  return (
    <div className="network-status-page">
      <wa-tab-group placement='bottom' className="network-status-tabs">
        <wa-tab panel='status'>Status</wa-tab>
        <wa-tab panel='clients'>Connected Clients</wa-tab>
        <wa-tab panel='tailscale'>Tailscale</wa-tab>

        <wa-tab-panel name='status'>
          <NetworkStatusTab />
        </wa-tab-panel>

        <wa-tab-panel name='clients'>
          <ConnectedClientsTab />
        </wa-tab-panel>

        <wa-tab-panel name='tailscale'>
          <TailscaleTab />
        </wa-tab-panel>
      </wa-tab-group>
    </div>
  );
};
