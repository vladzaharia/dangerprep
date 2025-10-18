import {
  faNetworkWired,
  faTerminal,
  faRoute,
} from '@awesome.me/kit-a765fc5647/icons/duotone/solid';
import {
  faComputerClassic,
  faShieldCheck,
  faCircleInfo,
  faArrowRightFromBracket,
  faGlobe,
  faGear,
  faTag,
} from '@awesome.me/kit-a765fc5647/icons/utility-duo/semibold';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useTailscaleInterface, useTailscalePeers } from '../../hooks/useSWRData';
import type { TailscaleInterface, TailscalePeer } from '../../types/network';
import { StatusCard } from '../cards/StatusCard';
import type { StatusCardTag } from '../cards/StatusCard';

/**
 * Tailscale Tab Component
 */
export const TailscaleTab: React.FC = () => {
  const { data: tailscale } = useTailscaleInterface();
  const { data: peersData } = useTailscalePeers();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Helper function to preserve search params in navigation
  const getNavLinkTo = (path: string) => {
    const params = new URLSearchParams(searchParams);
    const queryString = params.toString();
    return queryString ? `${path}?${queryString}` : path;
  };

  // Note: Loading state handled by parent Suspense boundary

  if (!tailscale) {
    return (
      <wa-callout variant='neutral' className='wa-gap-s'>
        <div slot='icon' style={{ display: 'contents' }}>
          <FontAwesomeIcon
            icon={faCircleInfo}
            style={
              {
                '--fa-primary-color': '#3b82f6', // Blue for info
                '--fa-primary-opacity': 1,
                '--fa-secondary-opacity': 0.4,
              } as React.CSSProperties
            }
          />
        </div>
        Tailscale is not configured or not running.
      </wa-callout>
    );
  }

  const tailscaleInterface = tailscale as TailscaleInterface;

  // Filter out peers that haven't been seen in over a month
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  // Use peers from dedicated endpoint, fallback to interface peers
  const allPeers = peersData || tailscaleInterface.peers || [];
  const recentPeers = allPeers.filter((peer: TailscalePeer) => {
    // Always include online peers
    if (peer.online) return true;

    // For offline peers, check if they were seen within the last month
    if (peer.lastSeen) {
      const lastSeenDate = new Date(peer.lastSeen);
      return lastSeenDate >= oneMonthAgo;
    }

    // If no lastSeen date, include the peer (might be a new peer)
    return true;
  });

  const peers = recentPeers.sort((peer1: TailscalePeer, peer2: TailscalePeer) => {
    if ((peer1.online && peer2.online) || (!peer1.online && !peer2.online)) {
      return peer1.hostname.localeCompare(peer2.hostname);
    } else if (peer1.online && !peer2.online) {
      return -1;
    } else {
      return 1;
    }
  });
  const onlinePeers = peers.filter((peer: TailscalePeer) => peer.online);

  // Prepare Tailscale interface data
  const tailscaleTags: StatusCardTag[] = [];

  // IP Address tag
  if (tailscaleInterface.ipAddress) {
    tailscaleTags.push({
      label: 'IP',
      value: tailscaleInterface.ipAddress,
      icon: (
        <FontAwesomeIcon
          icon={faGlobe}
          style={
            {
              '--fa-primary-color': '#10b981', // Green for IP/network
              '--fa-primary-opacity': 0.9,
            } as React.CSSProperties
          }
        />
      ),
      variant: 'neutral',
    });
  }

  // Exit Node tag
  if (tailscaleInterface.exitNode) {
    tailscaleTags.push({
      label: 'Exit Node',
      icon: (
        <FontAwesomeIcon
          icon={faArrowRightFromBracket}
          style={
            {
              '--fa-primary-color': '#3b82f6', // Blue for exit node
              '--fa-primary-opacity': 0.9,
              '--fa-secondary-opacity': 0.8,
            } as React.CSSProperties
          }
        />
      ),
      variant: 'brand',
    });
  }

  // Advertised Routes as individual tags
  if (tailscaleInterface.routeAdvertising && tailscaleInterface.routeAdvertising.length > 0) {
    tailscaleInterface.routeAdvertising.forEach(route => {
      tailscaleTags.push({
        label: route,
        icon: (
          <FontAwesomeIcon
            icon={faNetworkWired}
            style={
              {
                '--fa-primary-color': '#10b981', // Green for routes
                '--fa-primary-opacity': 0.9,
                '--fa-secondary-opacity': 0.8,
              } as React.CSSProperties
            }
          />
        ),
        variant: 'neutral',
      });
    });
  }

  return (
    <div
      className='wa-flank wa-gap-l'
      style={{ '--min-column-size': '18rem' } as React.CSSProperties}
    >
      {/* Left Column - Tailscale Status */}
      <div className='wa-split:column'>
        <div className='wa-stack wa-gap-m tailscale-status'>
          <h3 className='wa-heading-s'>Tailscale Status</h3>
          <StatusCard
            type='callout'
            variant={tailscaleInterface.status === 'connected' ? 'success' : 'danger'}
            layout='vertical'
            icon={
              <FontAwesomeIcon
                icon={faShieldCheck}
                size='lg'
                style={
                  {
                    '--fa-primary-color': '#a855f7', // Purple for Tailscale/security
                    '--fa-primary-opacity': 0.9,
                    '--fa-secondary-opacity': 0.8,
                    maxWidth: '2rem',
                  } as React.CSSProperties
                }
              />
            }
            title={tailscaleInterface.name}
            subtitle={tailscaleInterface.tailnetName}
            tags={tailscaleTags}
            className='interface-callout'
          />

          {/* Current Settings Tags */}
          {tailscaleInterface.status === 'connected' && (
            <div className='wa-stack wa-gap-xs'>
              <h4 className='wa-heading-xs'>Current Settings</h4>
              <div className='wa-cluster wa-gap-xs'>
                {tailscaleInterface.acceptDNS && (
                  <wa-tag variant='success' size='small'>
                    <FontAwesomeIcon icon={faGlobe} style={{ marginRight: '4px' }} />
                    DNS
                  </wa-tag>
                )}
                {tailscaleInterface.acceptRoutes && (
                  <wa-tag variant='success' size='small'>
                    <FontAwesomeIcon icon={faRoute} style={{ marginRight: '4px' }} />
                    Routes
                  </wa-tag>
                )}
                {tailscaleInterface.sshEnabled && (
                  <wa-tag variant='success' size='small'>
                    <FontAwesomeIcon icon={faTerminal} style={{ marginRight: '4px' }} />
                    SSH
                  </wa-tag>
                )}
              </div>
            </div>
          )}

          {/* Tailscale Settings Button */}
          <div
            onClick={() => navigate(getNavLinkTo('/tailscale'))}
            style={{ cursor: 'pointer' }}
            role='button'
            tabIndex={0}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigate(getNavLinkTo('/tailscale'));
              }
            }}
            aria-label='Tailscale Settings'
          >
            <wa-button
              appearance='outlined'
              variant='brand'
              style={{ width: '100%', pointerEvents: 'none' }}
            >
              <FontAwesomeIcon icon={faGear} style={{ marginRight: '8px' }} />
              Tailscale Settings
            </wa-button>
          </div>
        </div>
      </div>

      {/* Right Column - Peers */}
      <div className='wa-stack wa-gap-m'>
        <h3 className='wa-heading-s'>
          Peers ({onlinePeers.length} online
          {peers.length > onlinePeers.length
            ? `, ${peers.length - onlinePeers.length} offline`
            : ''}
          )
        </h3>
        {peers.length === 0 ? (
          <wa-callout variant='neutral'>
            <div slot='icon' style={{ display: 'contents' }}>
              <FontAwesomeIcon
                icon={faCircleInfo}
                style={
                  {
                    '--fa-primary-color': '#3b82f6', // Blue for info
                    '--fa-primary-opacity': 1,
                    '--fa-secondary-opacity': 0.4,
                  } as React.CSSProperties
                }
              />
            </div>
            No peers connected.
          </wa-callout>
        ) : (
          <wa-scroller orientation='vertical'>
            <div
              className='wa-grid wa-gap-xs'
              style={{ '--min-column-size': '18rem' } as React.CSSProperties}
            >
              {peers.map((peer: TailscalePeer, index: number) => {
                const peerTags: StatusCardTag[] = [];

                // OS tag
                if (peer.os) {
                  peerTags.push({
                    label: peer.os
                      .replace('linux', 'Linux')
                      .replace('windows', 'Windows')
                      .replace('android', 'Android'),
                    variant: 'neutral',
                  });
                }

                // Exit Node (currently being used)
                if (peer.exitNode) {
                  peerTags.push({
                    label: 'Exit Node',
                    icon: (
                      <FontAwesomeIcon
                        icon={faArrowRightFromBracket}
                        style={
                          {
                            '--fa-primary-color': '#3b82f6', // Blue for exit node
                            '--fa-primary-opacity': 0.9,
                            '--fa-secondary-opacity': 0.8,
                          } as React.CSSProperties
                        }
                      />
                    ),
                    variant: 'brand',
                  });
                }

                // Exit Node Option (can be used as exit node)
                if (peer.exitNodeOption && !peer.exitNode) {
                  peerTags.push({
                    label: 'Exit Node',
                    icon: (
                      <FontAwesomeIcon
                        icon={faArrowRightFromBracket}
                        style={
                          {
                            '--fa-primary-color': '#6b7280', // Gray for available
                            '--fa-primary-opacity': 0.7,
                          } as React.CSSProperties
                        }
                      />
                    ),
                    variant: 'neutral',
                  });
                }

                // SSH Enabled
                if (peer.sshEnabled) {
                  peerTags.push({
                    label: 'SSH',
                    icon: (
                      <FontAwesomeIcon
                        icon={faTerminal}
                        style={
                          {
                            '--fa-primary-color': '#a855f7', // Purple for SSH
                            '--fa-primary-opacity': 0.9,
                          } as React.CSSProperties
                        }
                      />
                    ),
                    variant: 'neutral',
                  });
                }

                // Subnet Routes
                if (peer.subnetRoutes && peer.subnetRoutes.length > 0) {
                  peer.subnetRoutes.forEach(route => {
                    peerTags.push({
                      label: route,
                      icon: (
                        <FontAwesomeIcon
                          icon={faRoute}
                          style={
                            {
                              '--fa-primary-color': '#10b981', // Green for routes
                              '--fa-primary-opacity': 0.9,
                            } as React.CSSProperties
                          }
                        />
                      ),
                      variant: 'neutral',
                    });
                  });
                }

                // Tailscale tags (after system-level tags)
                if (peer.tags && peer.tags.length > 0) {
                  peer.tags.forEach(tag => {
                    const tagName = tag.replace('tag:', '');
                    // Filter out exit-node tag
                    if (tagName === 'exit-node') return;

                    peerTags.push({
                      label: tagName,
                      icon: (
                        <FontAwesomeIcon
                          icon={faTag}
                          style={
                            {
                              '--fa-primary-color': '#8b5cf6', // Purple for tags
                              '--fa-primary-opacity': 0.8,
                            } as React.CSSProperties
                          }
                        />
                      ),
                      variant: 'neutral',
                    });
                  });
                }

                // Expired key warning
                if (peer.expired) {
                  peerTags.push({
                    label: 'Expired',
                    variant: 'danger',
                  });
                }

                // Build subtitle with IP and relay info
                let subtitle = peer.ipAddress;
                if (peer.lastSeen && !peer.online) {
                  subtitle += ` • Last seen: ${new Date(peer.lastSeen).toLocaleDateString()}`;
                }

                return (
                  <StatusCard
                    key={peer.id || `peer-${index}`}
                    type='callout'
                    variant={peer.online ? 'success' : 'neutral'}
                    layout='horizontal'
                    icon={
                      <FontAwesomeIcon
                        icon={faComputerClassic}
                        size='lg'
                        style={
                          {
                            '--fa-primary-color': peer.online ? '#10b981' : '#6b7280', // Green if online, gray if offline
                            '--fa-primary-opacity': 0.7,
                            '--fa-secondary-opacity': 0.8,
                            maxWidth: '2rem',
                          } as React.CSSProperties
                        }
                      />
                    }
                    title={peer.hostname || peer.ipAddress}
                    subtitle={subtitle}
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
