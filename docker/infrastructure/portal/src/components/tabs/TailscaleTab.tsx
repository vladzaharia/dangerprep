import React from 'react';
import {
  faComputer,
  faNetworkWired,
  faInfoCircle,
  faArrowRightFromBracket,
  faRoute
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useNetworkWorker, useTailscaleFromWorker } from '../../hooks/useNetworkWorker';
import type { TailscaleInterface, TailscalePeer } from '../../hooks/useNetworks';
import { StatusCard } from '../cards/StatusCard';
import type { StatusCardTag } from '../cards/StatusCard';


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
  const peers = tailscaleInterface.peers?.sort((peer: TailscalePeer) => peer.online ? -1 : 1) || [];
  const onlinePeers = peers.filter((peer: TailscalePeer) => peer.online);

  // Prepare Tailscale interface data
  const tailscaleTags: StatusCardTag[] = [];

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
        <div className='wa-stack wa-gap-m tailscale-status'>
          <h3 className='wa-heading-s'>Tailscale Status</h3>
          <StatusCard
            type='callout'
            variant={tailscaleInterface.status === "connected" ? "success" : "neutral"}
            layout='vertical'
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
                const peerTags: StatusCardTag[] = [];
                if (peer.exitNode) {
                  peerTags.push({ label: 'Exit Node', icon: faArrowRightFromBracket, variant: 'brand' });
                }

                return (
                  <StatusCard
                    key={`peer-${index}`}
                    type='callout'
                    variant={peer.online ? 'success' : 'danger'}
                    layout='horizontal'
                    icon={faComputer}
                    title={peer.hostname || peer.ipAddress}
                    subtitle={peer.ipAddress}
                    tags={peerTags}
                    className='tailscale-peer'
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
