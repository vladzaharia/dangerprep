import React from 'react';
import { NetworkStatusTab } from '../components/NetworkStatusTab';
import { ConnectedClientsTab } from '../components/ConnectedClientsTab';
import { TailscaleTab } from '../components/TailscaleTab';

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
          <wa-scroller orientation="vertical" className="network-status-scroller">
            <NetworkStatusTab />
          </wa-scroller>
        </wa-tab-panel>

        <wa-tab-panel name='clients'>
          <wa-scroller orientation="vertical" className="network-status-scroller">
            <ConnectedClientsTab />
          </wa-scroller>
        </wa-tab-panel>

        <wa-tab-panel name='tailscale'>
          <wa-scroller orientation="vertical" className="network-status-scroller">
            <TailscaleTab />
          </wa-scroller>
        </wa-tab-panel>
      </wa-tab-group>
    </div>
  );
};
