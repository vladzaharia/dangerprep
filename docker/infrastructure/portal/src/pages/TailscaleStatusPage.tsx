import {
  faNetworkWired,
  faTerminal,
  faRoute,
  faCodeCompare,
} from '@awesome.me/kit-a765fc5647/icons/duotone/solid';
import {
  faShieldCheck,
  faCircleInfo,
  faArrowRightFromBracket,
  faGlobe,
  faGear,
} from '@awesome.me/kit-a765fc5647/icons/utility-duo/semibold';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { Suspense } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { StatusCard } from '../components/cards/StatusCard';
import type { StatusCardTag } from '../components/cards/StatusCard';
import { TailscalePeerCard } from '../components/cards/TailscalePeerCard';
import {
  useTailscaleInterface,
  useTailscalePeers,
  useTailscaleSettings,
  useTailscaleStatus,
} from '../hooks/useSWRData';
import type { TailscaleInterface, TailscalePeer } from '../types/network';
import { createIconStyle, ICON_STYLES, getOSInfo } from '../utils/iconStyles';

/**
 * Loading skeleton for tailscale status page
 */
function TailscaleSkeleton() {
  return (
    <div
      className='wa-flank wa-gap-l'
      style={{ '--min-column-size': '18rem' } as React.CSSProperties}
    >
      {/* Left Column - Tailscale Status Skeleton */}
      <div className='wa-split:column'>
        <div className='wa-stack wa-gap-m tailscale-status'>
          <h3 className='wa-heading-s'>Tailscale Status</h3>
          <wa-card appearance='outlined'>
            <div className='wa-stack wa-gap-m'>
              <div className='wa-flank wa-gap-m wa-align-items-center'>
                <wa-skeleton
                  effect='sheen'
                  style={{ width: '48px', height: '48px', borderRadius: '6px' }}
                ></wa-skeleton>
                <div className='wa-stack wa-gap-xs' style={{ flex: 1 }}>
                  <wa-skeleton
                    effect='sheen'
                    style={{ width: '140px', height: '20px' }}
                  ></wa-skeleton>
                  <wa-skeleton
                    effect='sheen'
                    style={{ width: '180px', height: '16px' }}
                  ></wa-skeleton>
                </div>
              </div>
              <div className='wa-cluster wa-gap-xs'>
                {Array.from({ length: 4 }, (_, index) => (
                  <wa-skeleton
                    key={index}
                    effect='sheen'
                    style={{ width: '70px', height: '24px', borderRadius: '4px' }}
                  ></wa-skeleton>
                ))}
              </div>
            </div>
          </wa-card>

          {/* Settings Tags Skeleton */}
          <div className='wa-stack wa-gap-xs'>
            <h4 className='wa-heading-xs'>Current Settings</h4>
            <div className='wa-cluster wa-gap-xs'>
              {Array.from({ length: 3 }, (_, index) => (
                <wa-skeleton
                  key={index}
                  effect='sheen'
                  style={{ width: '60px', height: '24px', borderRadius: '4px' }}
                ></wa-skeleton>
              ))}
            </div>
          </div>

          {/* Settings Button Skeleton */}
          <wa-skeleton
            effect='sheen'
            style={{ width: '100%', height: '40px', borderRadius: '4px' }}
          ></wa-skeleton>
        </div>
      </div>

      {/* Right Column - Peers Skeleton */}
      <div className='wa-stack wa-gap-m'>
        <h3 className='wa-heading-s'>Peers (0 online)</h3>
        <wa-scroller orientation='vertical'>
          <div
            className='wa-grid wa-gap-xs'
            style={{ '--min-column-size': '18rem' } as React.CSSProperties}
          >
            {Array.from({ length: 4 }, (_, index) => (
              <wa-card key={index} appearance='outlined'>
                <div className='wa-stack wa-gap-m'>
                  <div className='wa-flank wa-gap-m wa-align-items-center'>
                    <wa-skeleton
                      effect='sheen'
                      style={{ width: '48px', height: '48px', borderRadius: '6px' }}
                    ></wa-skeleton>
                    <div className='wa-stack wa-gap-xs' style={{ flex: 1 }}>
                      <wa-skeleton
                        effect='sheen'
                        style={{ width: `${120 + index * 15}px`, height: '20px' }}
                      ></wa-skeleton>
                      <wa-skeleton
                        effect='sheen'
                        style={{ width: `${100 + index * 10}px`, height: '16px' }}
                      ></wa-skeleton>
                    </div>
                  </div>
                  <div className='wa-cluster wa-gap-xs'>
                    {Array.from({ length: 2 }, (_, tagIndex) => (
                      <wa-skeleton
                        key={tagIndex}
                        effect='sheen'
                        style={{ width: '70px', height: '24px', borderRadius: '4px' }}
                      ></wa-skeleton>
                    ))}
                  </div>
                </div>
              </wa-card>
            ))}
          </div>
        </wa-scroller>
      </div>
    </div>
  );
}

/**
 * Tailscale Status Content Component
 * This component calls SWR hooks and must be wrapped in Suspense
 */
const TailscaleStatusContent: React.FC = () => {
  const { data: tailscale } = useTailscaleInterface();
  const { data: peersData } = useTailscalePeers();
  const { data: settings } = useTailscaleSettings();
  const { data: status } = useTailscaleStatus();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Helper function to preserve search params in navigation
  const getNavLinkTo = (path: string) => {
    const params = new URLSearchParams(searchParams);
    const queryString = params.toString();
    return queryString ? `${path}?${queryString}` : path;
  };

  const tailscaleInterface = tailscale as TailscaleInterface;

  // Early exit if Tailscale is not configured
  if (!tailscaleInterface || !status) {
    return (
      <div className='wa-stack wa-gap-xl'>
        <h2>Tailscale Status</h2>
        <wa-callout variant='warning'>
          <strong>Tailscale Not Configured</strong>
          <p>
            Tailscale is not currently configured on this device. Please configure Tailscale in the{' '}
            <a
              href={getNavLinkTo('/settings/tailscale')}
              onClick={e => {
                e.preventDefault();
                navigate(getNavLinkTo('/settings/tailscale'));
              }}
              style={{ textDecoration: 'underline', cursor: 'pointer' }}
            >
              Tailscale Settings
            </a>{' '}
            page.
          </p>
        </wa-callout>
      </div>
    );
  }

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

  // Get OS info from status
  const osInfo = status?.self?.os;

  // Helper to clean version string (remove commit SHA)
  const cleanVersion = (version?: string) => {
    if (!version) return undefined;
    // Remove everything after the dash (commit SHA)
    return version.split('-')[0];
  };

  // OS tag
  if (osInfo) {
    const osDetails = getOSInfo(osInfo);
    tailscaleTags.push({
      label: osInfo,
      icon: (
        <wa-icon
          family={osDetails.family}
          name={osDetails.icon}
          style={{ color: osDetails.color }}
        />
      ),
      variant: 'neutral',
    });
  }

  // IPv4 and IPv6 tags
  if (status?.self?.tailscaleIPs) {
    status.self.tailscaleIPs.forEach(ip => {
      const isIPv6 = ip.includes(':');
      tailscaleTags.push({
        label: isIPv6 ? 'IPv6' : 'IPv4',
        value: ip,
        icon: (
          <FontAwesomeIcon
            icon={faGlobe}
            style={createIconStyle(isIPv6 ? ICON_STYLES.ipv6 : ICON_STYLES.ipv4)}
          />
        ),
        variant: 'neutral',
      });
    });
  }

  // Exit Node tag
  if (tailscaleInterface?.exitNode) {
    tailscaleTags.push({
      label: 'Exit Node',
      icon: (
        <FontAwesomeIcon
          icon={faArrowRightFromBracket}
          style={createIconStyle(ICON_STYLES.exitNode)}
        />
      ),
      variant: 'success',
    });
  }

  // Advertised Routes as individual tags
  if (tailscaleInterface?.routeAdvertising && tailscaleInterface?.routeAdvertising.length > 0) {
    tailscaleInterface.routeAdvertising.forEach(route => {
      tailscaleTags.push({
        label: route,
        icon: <FontAwesomeIcon icon={faNetworkWired} style={createIconStyle(ICON_STYLES.routes)} />,
        variant: 'neutral',
      });
    });
  }

  // Version tag
  if (settings?.version) {
    tailscaleTags.push({
      label: 'Version',
      value: cleanVersion(settings.version),
      icon: <FontAwesomeIcon icon={faCodeCompare} style={createIconStyle(ICON_STYLES.version)} />,
      variant: 'neutral',
    });
  }

  // Tailnet display name tag
  if (settings?.tailnetDisplayName) {
    tailscaleTags.push({
      label: 'Tailnet',
      value: settings.tailnetDisplayName,
      icon: <FontAwesomeIcon icon={faShieldCheck} style={createIconStyle(ICON_STYLES.tailscale)} />,
      variant: 'neutral',
    });
  }

  const content = (
    <div
      className='wa-flank wa-gap-l'
      style={{ '--min-column-size': '18rem' } as React.CSSProperties}
    >
      {/* Left Column - Tailscale Status */}
      <div className='wa-split:column'>
        <div className='wa-stack wa-gap-m tailscale-status'>
          <h3 className='wa-heading-s'>Tailscale Status</h3>
          <StatusCard
            variant={tailscaleInterface?.status === 'connected' ? 'success' : 'danger'}
            layout='vertical'
            icon={
              <FontAwesomeIcon
                icon={faShieldCheck}
                size='lg'
                style={{ ...createIconStyle(ICON_STYLES.tailscale), maxWidth: '2rem' }}
              />
            }
            title={tailscaleInterface?.name}
            subtitle={tailscaleInterface?.tailnetName}
            tags={tailscaleTags}
            className='interface-card'
          />

          {/* Current Settings Tags */}
          {tailscaleInterface?.status === 'connected' && (
            <div className='wa-stack wa-gap-xs'>
              <h4 className='wa-heading-xs'>Current Settings</h4>
              <div className='wa-cluster wa-gap-xs'>
                {tailscaleInterface?.acceptDNS && (
                  <wa-tag variant='success' size='small'>
                    <FontAwesomeIcon
                      icon={faGlobe}
                      style={{ ...createIconStyle(ICON_STYLES.network), marginRight: '4px' }}
                    />
                    DNS
                  </wa-tag>
                )}
                {tailscaleInterface?.acceptRoutes && (
                  <wa-tag variant='success' size='small'>
                    <FontAwesomeIcon
                      icon={faRoute}
                      style={{ ...createIconStyle(ICON_STYLES.routes), marginRight: '4px' }}
                    />
                    Routes
                  </wa-tag>
                )}
                {tailscaleInterface.sshEnabled && (
                  <wa-tag variant='success' size='small'>
                    <FontAwesomeIcon
                      icon={faTerminal}
                      style={{ ...createIconStyle(ICON_STYLES.terminal), marginRight: '4px' }}
                    />
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
              <FontAwesomeIcon icon={faCircleInfo} style={createIconStyle(ICON_STYLES.info)} />
            </div>
            No peers connected.
          </wa-callout>
        ) : (
          <wa-scroller orientation='vertical'>
            <div
              className='wa-grid wa-gap-xs'
              style={{ '--min-column-size': '18rem' } as React.CSSProperties}
            >
              {peers.map((peer: TailscalePeer, index: number) => (
                <TailscalePeerCard key={peer.id || `peer-${index}`} peer={peer} />
              ))}
            </div>
          </wa-scroller>
        )}
      </div>
    </div>
  );

  return content;
};

/**
 * Tailscale Status Page Component
 * Wraps TailscaleStatusContent in Suspense to show skeleton while loading
 */
export const TailscaleStatusPage: React.FC = () => {
  return (
    <div className='tailscale-status-page'>
      <Suspense fallback={<TailscaleSkeleton />}>
        <TailscaleStatusContent />
      </Suspense>
    </div>
  );
};
