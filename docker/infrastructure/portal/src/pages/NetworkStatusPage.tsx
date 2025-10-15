import React from 'react';
import { NetworkStatusTab } from '../components/NetworkStatusTab';
import { ConnectedClientsTab } from '../components/ConnectedClientsTab';
import { TailscaleTab } from '../components/TailscaleTab';

/**
 * Network Status Page Component
 */
export const NetworkStatusPage: React.FC = () => {
  return (
    <wa-tab-group placement='bottom' style={{ height: "100%" }}>
      <wa-tab panel='status'>Status</wa-tab>
      <wa-tab panel='clients'>Connected Clients</wa-tab>
      <wa-tab panel='tailscale'>Tailscale</wa-tab>

      <wa-tab-panel name='status'>
        <wa-scroller orientation="vertical">
          <NetworkStatusTab />
        </wa-scroller>
      </wa-tab-panel>

      <wa-tab-panel name='clients'>
        <wa-scroller orientation="vertical">
          <ConnectedClientsTab />
        </wa-scroller>
      </wa-tab-panel>

      <wa-tab-panel name='tailscale'>
        <wa-scroller orientation="vertical">
          <TailscaleTab />
        </wa-scroller>
      </wa-tab-panel>
    </wa-tab-group>
  );
};
