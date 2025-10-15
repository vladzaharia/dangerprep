import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faNetworkWired, faCircle } from '@fortawesome/free-solid-svg-icons';
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
  const onlinePeers = peers.filter((peer: TailscalePeer) => peer.online);

  return (
    <div
      className='wa-grid wa-gap-l'
      style={{ '--min-column-size': '200px' } as React.CSSProperties}
    >
      {/* Left Column - Tailscale Status */}
      <div className='wa-stack wa-gap-m'>
        <h3 className='wa-heading-s'>Tailscale Status</h3>
        <wa-callout appearance='outlined' variant={tailscaleInterface.state === "up" ? "success" : "danger"}>
          <div className='wa-stack wa-gap-m'>
            <div className='wa-flank wa-gap-m'>
              <FontAwesomeIcon icon={faNetworkWired} size='lg' />
              <div className='wa-stack wa-gap-3xs'>
                <span className='wa-body-s' style={{ fontWeight: 600 }}>
                  {tailscaleInterface.name}
                </span>
                {tailscaleInterface.tailnetName && (
                  <span className='wa-caption-s'>{tailscaleInterface.tailnetName}</span>
                )}
              </div>
            </div>

            <div className='wa-stack wa-gap-xs wa-body-s'>
              {/* IP Address */}
              {tailscaleInterface.ipAddress && (
                <div>
                  <span style={{ fontWeight: 600 }}>IP Address:</span>{' '}
                  <span className='wa-caption-s'>{tailscaleInterface.ipAddress}</span>
                </div>
              )}

              {/* Tags */}
              <div className='wa-flank wa-gap-xs' style={{ flexWrap: 'wrap' }}>
                {tailscaleInterface.exitNode && (
                  <wa-tag variant='brand' size='small'>
                    <wa-icon name='arrow-right-from-bracket' slot='prefix'></wa-icon>
                    Exit Node
                  </wa-tag>
                )}
                {tailscaleInterface.routeAdvertising &&
                  tailscaleInterface.routeAdvertising.length > 0 && (
                    <wa-tag variant='brand' size='small'>
                      <wa-icon name='route' slot='prefix'></wa-icon>
                      Subnet Routes ({tailscaleInterface.routeAdvertising.length})
                    </wa-tag>
                  )}
              </div>

              {/* Advertised Routes */}
              {tailscaleInterface.routeAdvertising &&
                tailscaleInterface.routeAdvertising.length > 0 && (
                  <div className='wa-stack wa-gap-3xs'>
                    <span style={{ fontWeight: 600 }}>Advertised Routes:</span>
                    <div className='wa-stack wa-gap-2xs'>
                      {tailscaleInterface.routeAdvertising.map((route, idx) => (
                        <span key={idx} className='wa-caption-s'>
                          • {route}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          </div>
        </wa-callout>
      </div>

      {/* Right Column - Peers */}
      <div className='wa-stack wa-gap-m'>
        <h3 className='wa-heading-s'>
          Peers ({onlinePeers.length} online{peers.length > onlinePeers.length ? `, ${peers.length - onlinePeers.length} offline` : ''})
        </h3>
        {peers.length === 0 ? (
          <wa-callout variant='neutral'>
            <wa-icon name='info-circle' slot='icon'></wa-icon>
            No peers connected.
          </wa-callout>
        ) : (
          <wa-scroller style={{ maxHeight: '500px' }}>
            <div className='wa-stack wa-gap-s'>
              {onlinePeers.map((peer: TailscalePeer, index: number) => (
                <wa-details key={peer.ipAddress || index}>
                  <div slot='summary' className='wa-flank wa-gap-s'>
                    <div className='wa-stack wa-gap-3xs' style={{ flex: 1 }}>
                      <span className='wa-body-s' style={{ fontWeight: 600 }}>
                        {peer.hostname || peer.ipAddress}
                      </span>
                      <span className='wa-caption-s'>{peer.ipAddress}</span>
                    </div>
                  </div>

                  <div className='wa-stack wa-gap-xs wa-body-s' style={{ paddingTop: '8px' }}>
                    {/* OS Information */}
                    {peer.os && (
                      <div>
                        <span style={{ fontWeight: 600 }}>Operating System:</span>{' '}
                        <span className='wa-caption-s'>{peer.os}</span>
                      </div>
                    )}

                    {/* Tags */}
                    <div className='wa-flank wa-gap-xs' style={{ flexWrap: 'wrap' }}>
                      {peer.exitNode && (
                        <wa-tag variant='brand' size='small'>
                          <wa-icon name='arrow-right-from-bracket' slot='prefix'></wa-icon>
                          Exit Node
                        </wa-tag>
                      )}
                    </div>
                  </div>
                </wa-details>
              ))}
            </div>
          </wa-scroller>
        )}
      </div>
    </div>
  );
};
