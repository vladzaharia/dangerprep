import React from 'react';
import { useNetworkWorker, useTailscaleFromWorker } from '../hooks/useNetworkWorker';
import type { TailscaleInterface, TailscalePeer } from '../hooks/useNetworks';

/**
 * Tailscale Tab Component
 */
export const TailscaleTab: React.FC = () => {
  const network = useNetworkWorker({ pollInterval: 5000, autoStart: true });
  const tailscale = useTailscaleFromWorker(network.data);

  if (network.loading && !network.data) {
    return (
      <div className='wa-stack wa-gap-m'>
        <wa-skeleton effect='sheen' style={{ width: '100%', height: '150px' }}></wa-skeleton>
      </div>
    );
  }

  if (!tailscale) {
    return (
      <wa-callout variant='neutral'>
        <wa-icon name='info-circle' slot='icon'></wa-icon>
        Tailscale is not configured or not running.
      </wa-callout>
    );
  }

  const tailscaleInterface = tailscale as TailscaleInterface;
  const peers = tailscaleInterface.peers || [];

  return (
    <div className='wa-stack wa-gap-l'>
      {/* Tailscale Status */}
      <wa-card appearance='filled'>
        <div className='wa-stack wa-gap-m'>
          <h3 className='wa-heading-s'>Tailscale Status</h3>
          <div className='wa-stack wa-gap-xs'>
            <div>
              <strong>Status:</strong>{' '}
              <wa-badge variant={tailscaleInterface.status === 'connected' ? 'success' : 'danger'}>
                {tailscaleInterface.status}
              </wa-badge>
            </div>
            {tailscaleInterface.tailnetName && (
              <div>
                <strong>Tailnet:</strong> {tailscaleInterface.tailnetName}
              </div>
            )}
            {tailscaleInterface.ipAddress && (
              <div>
                <strong>IP Address:</strong> {tailscaleInterface.ipAddress}
              </div>
            )}
            {tailscaleInterface.exitNode !== undefined && (
              <div>
                <strong>Exit Node:</strong> {tailscaleInterface.exitNode ? 'Yes' : 'No'}
              </div>
            )}
          </div>
        </div>
      </wa-card>

      {/* Tailscale Peers */}
      <div className='wa-stack wa-gap-s'>
        <h3 className='wa-heading-s'>Peers ({peers.length})</h3>
        {peers.length === 0 ? (
          <wa-callout variant='neutral'>
            <wa-icon name='info-circle' slot='icon'></wa-icon>
            No peers connected.
          </wa-callout>
        ) : (
          peers.map((peer: TailscalePeer, index: number) => (
            <wa-details key={peer.ipAddress || index} summary={peer.hostname || peer.ipAddress}>
              <div className='wa-stack wa-gap-xs'>
                <div>
                  <strong>IP Address:</strong> {peer.ipAddress}
                </div>
                <div>
                  <strong>Status:</strong>{' '}
                  <wa-badge variant={peer.online ? 'success' : 'neutral'}>
                    {peer.online ? 'Online' : 'Offline'}
                  </wa-badge>
                </div>
                {peer.os && (
                  <div>
                    <strong>OS:</strong> {peer.os}
                  </div>
                )}
                {peer.lastSeen && (
                  <div>
                    <strong>Last Seen:</strong> {new Date(peer.lastSeen).toLocaleString()}
                  </div>
                )}
                {peer.exitNode && (
                  <div>
                    <strong>Exit Node:</strong> Yes
                  </div>
                )}
              </div>
            </wa-details>
          ))
        )}
      </div>
    </div>
  );
};
