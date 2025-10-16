import React from 'react';
import {
  faComputer,
  faNetworkWired,
  faInfoCircle,
  faArrowRightFromBracket,
  faRoute
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useNetworkWorker, useTailscaleFromWorker } from '../hooks/useNetworkWorker';
import type { TailscaleInterface, TailscalePeer } from '../hooks/useNetworks';
import { DeviceCard } from './DeviceCard';
import { InterfaceCard } from './InterfaceCard';
import type { DeviceCardTag } from './DeviceCard';
import type { InterfaceCardTag } from './InterfaceCard';


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
        <span slot='icon'>
          <FontAwesomeIcon icon={faInfoCircle} />
        </span>
        Tailscale is not configured or not running.
      </wa-callout>
    );
  }

  const tailscaleInterface = tailscale as TailscaleInterface;
  const peers = tailscaleInterface.peers || [];
  const onlinePeers = peers.filter((peer: TailscalePeer) => peer.online);

  // Prepare Tailscale interface data
  const tailscaleTags: InterfaceCardTag[] = [];

  // IP Address tag
  if (tailscaleInterface.ipAddress) {
    tailscaleTags.push({
      label: 'IP',
      value: tailscaleInterface.ipAddress,
      icon: faNetworkWired,
      variant: 'neutral'
    });
  }

  // Exit Node tag
  if (tailscaleInterface.exitNode) {
    tailscaleTags.push({
      label: 'Exit Node',
      icon: faArrowRightFromBracket,
      variant: 'brand'
    });
  }

  // Subnet Routes tag
  if (tailscaleInterface.routeAdvertising && tailscaleInterface.routeAdvertising.length > 0) {
    tailscaleTags.push({
      label: 'Subnet Routes',
      value: tailscaleInterface.routeAdvertising.length,
      icon: faRoute,
      variant: 'brand'
    });
  }

  return (
    <div
      className='wa-flank wa-gap-l'
      style={{ '--min-column-size': '200px' } as React.CSSProperties}
    >
      {/* Left Column - Tailscale Status */}
      <div className='wa-split:column'>
        <div className='wa-stack wa-gap-m'>
          <h3 className='wa-heading-s'>Tailscale Status</h3>
          <InterfaceCard
            type='callout'
            variant={tailscaleInterface.status === "connected" ? "success" : "danger"}
            icon={faNetworkWired}
            title={tailscaleInterface.name}
            subtitle={tailscaleInterface.tailnetName}
            tags={tailscaleTags}
            routes={tailscaleInterface.routeAdvertising}
            className="interface-callout"
          />
        </div>
      </div>

      {/* Right Column - Peers */}
      <div className='wa-stack wa-gap-m'>
        <h3 className='wa-heading-s'>
          Peers ({onlinePeers.length} online{peers.length > onlinePeers.length ? `, ${peers.length - onlinePeers.length} offline` : ''})
        </h3>
        {peers.length === 0 ? (
          <wa-callout variant='neutral'>
            <span slot='icon'>
              <FontAwesomeIcon icon={faInfoCircle} />
            </span>
            No peers connected.
          </wa-callout>
        ) : (
          <wa-scroller style={{ maxHeight: '500px' }}>
            <div className='wa-grid wa-gap-xs'>
              {peers.map((peer: TailscalePeer, index: number) => {
                const peerTags: DeviceCardTag[] = [];
                if (peer.exitNode) {
                  peerTags.push({ label: 'Exit Node', icon: faArrowRightFromBracket, variant: 'brand' });
                }

                return (
                  <DeviceCard
                    key={`peer-${index}`}
                    icon={faComputer}
                    title={peer.hostname || peer.ipAddress}
                    subtitle={peer.ipAddress}
                    tags={peerTags}
                    className={`tailscale-peer ${peer.online ? 'wa-success' : 'wa-danger'}`}
                  />
                );
              })}
            </div>
          </wa-scroller>
        )}
      </div>
    </div>
  );
};
