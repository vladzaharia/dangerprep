import {
  faEthernet,
  faRouter,
  faServer,
  faNetworkWired,
} from '@awesome.me/kit-a765fc5647/icons/duotone/solid';
import {
  faWifi,
  faGlobe,
  faShieldCheck,
  faArrowRightFromBracket,
  faGear,
} from '@awesome.me/kit-a765fc5647/icons/utility-duo/semibold';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useNetworkSummary, useTailscaleSettings, useTailscalePeers } from '../../hooks/useSWRData';
import type { NetworkInterface, TailscaleInterface } from '../../types/network';
import { COLORS, createIconStyle, ICON_STYLES } from '../../utils/iconStyles';
import { StatusCard } from '../cards/StatusCard';
import type { StatusCardTag } from '../cards/StatusCard';
import { InterfaceDetailsPopup } from '../details/InterfaceDetailsPopup';

/**
 * Get icon for network interface type
 */
function getInterfaceIcon(iface: NetworkInterface) {
  switch (iface.type) {
    case 'wifi':
    case 'hotspot':
      return faWifi;
    case 'ethernet':
      return faEthernet;
    case 'tailscale':
      return faShieldCheck;
    default:
      return faGlobe;
  }
}

/**
 * Get icon color based on interface type and state
 */
function getInterfaceIconColor(iface: NetworkInterface): string | undefined {
  if (iface.state !== 'up') return undefined;

  switch (iface.type) {
    case 'wifi':
    case 'hotspot':
      return COLORS.feature.wifi;
    case 'ethernet':
      return COLORS.feature.ethernet;
    case 'tailscale':
      return COLORS.feature.tailscale;
    default:
      return COLORS.neutral.gray;
  }
}

/**
 * Status Tab Component - Shows network topology
 */
export const NetworkStatusTab: React.FC = () => {
  const { data: networkData } = useNetworkSummary();
  const { data: tailscaleSettings } = useTailscaleSettings();
  const { data: tailscalePeers } = useTailscalePeers();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Helper function to preserve search params in navigation
  const getNavLinkTo = (path: string) => {
    const params = new URLSearchParams(searchParams);
    const queryString = params.toString();
    return queryString ? `${path}?${queryString}` : path;
  };

  // Get LAN interfaces (hotspot/wlan)
  const lanInterfaces = useMemo(() => {
    if (!networkData?.interfaces) return [];
    return networkData.interfaces.filter(
      iface => iface.purpose === 'wlan' || iface.purpose === 'lan'
    );
  }, [networkData]);

  // Get WAN interfaces (internet)
  // Include Tailscale IF it's being used as an exit node OR accepting subnet routes
  const wanInterfaces = useMemo(() => {
    if (!networkData?.interfaces) return [];
    return networkData.interfaces.filter(iface => {
      if (iface.purpose === 'wan' && iface.type !== 'tailscale') {
        return true;
      }

      // Include Tailscale if it has exit node or accepting routes
      if (iface.type === 'tailscale') {
        const tsInterface = iface as TailscaleInterface;
        const hasExitNode = tsInterface.exitNode;
        const acceptingRoutes = tailscaleSettings?.acceptRoutes && tsInterface.state === 'up';
        return hasExitNode || acceptingRoutes;
      }

      return false;
    });
  }, [networkData, tailscaleSettings]);

  // Get device IP addresses
  const deviceIPs = useMemo(() => {
    if (!networkData?.interfaces) return [];
    return networkData.interfaces
      .filter(
        (iface): iface is typeof iface & { ipAddress: string } =>
          iface.ipAddress !== undefined && iface.ipAddress !== null && iface.state === 'up'
      )
      .map(iface => ({ name: iface.name, ip: iface.ipAddress }));
  }, [networkData]);

  // Note: Loading state handled by parent Suspense boundary
  if (!networkData) {
    return (
      <div className='wa-stack wa-gap-m'>
        <wa-skeleton effect='sheen' style={{ width: '100%', height: '200px' }}></wa-skeleton>
      </div>
    );
  }

  return (
    <div
      className='wa-grid wa-gap-l'
      style={{ '--min-column-size': '18rem' } as React.CSSProperties}
    >
      {/* Left Column - LAN Interfaces */}
      <div className='wa-stack wa-gap-m'>
        <h3 className='wa-heading-s'>LAN</h3>
        {lanInterfaces.length === 0 ? (
          <wa-card appearance='outlined'>
            <div className='wa-stack wa-gap-xs'>
              <span className='wa-caption-s'>No LAN interfaces</span>
            </div>
          </wa-card>
        ) : (
          lanInterfaces.map(iface => {
            const title =
              iface.type === 'wifi' && 'ssid' in iface && iface.ssid
                ? `${iface.ssid} (${iface.name})`
                : iface.name;

            const tags: StatusCardTag[] = [];
            if (iface.ipAddress) {
              tags.push({
                label: 'IP',
                value: iface.ipAddress,
                icon: <FontAwesomeIcon icon={faGlobe} style={createIconStyle(ICON_STYLES.ipv4)} />,
                variant: 'neutral',
              });
            }

            const iconColor = getInterfaceIconColor(iface);
            let iconStyle;
            if (iconColor) {
              if (iface.type === 'wifi' || iface.type === 'hotspot') {
                iconStyle = createIconStyle(ICON_STYLES.wifi);
              } else if (iface.type === 'ethernet') {
                iconStyle = createIconStyle(ICON_STYLES.ethernet);
              } else if (iface.type === 'tailscale') {
                iconStyle = createIconStyle(ICON_STYLES.tailscale);
              } else {
                iconStyle = createIconStyle(ICON_STYLES.neutral);
              }
            }

            return (
              <StatusCard
                key={iface.name}
                type='callout'
                variant={iface.state === 'up' ? 'success' : 'danger'}
                layout='vertical'
                icon={
                  <FontAwesomeIcon
                    icon={getInterfaceIcon(iface)}
                    size='lg'
                    style={{ ...iconStyle, maxWidth: '2rem' }}
                  />
                }
                title={title}
                tags={tags}
                className='interface-callout'
                detailsContent={<InterfaceDetailsPopup iface={iface} />}
              />
            );
          })
        )}
      </div>

      {/* Middle Column - Router/Device */}
      <div className='wa-stack wa-gap-m'>
        <h3 className='wa-heading-s'>&nbsp;</h3>
        <StatusCard
          type='card'
          layout='vertical'
          icon={
            <FontAwesomeIcon
              icon={faServer}
              size='lg'
              style={
                {
                  '--fa-primary-color': COLORS.ui.device,
                  maxWidth: '2rem',
                } as React.CSSProperties
              }
            />
          }
          title='This Device'
          tags={deviceIPs
            .filter(({ name }) => !name.startsWith('br'))
            .map(({ name, ip }) => ({
              label: name,
              value: ip,
              variant: 'neutral' as const,
            }))}
        />
      </div>

      {/* Right Column - WAN Interfaces with ISP Information */}
      <div className='wa-stack wa-gap-m'>
        <h3 className='wa-heading-s'>Internet</h3>
        {wanInterfaces.length === 0 ? (
          <wa-card appearance='outlined'>
            <div className='wa-stack wa-gap-xs'>
              <span className='wa-caption-s'>No internet connection</span>
            </div>
          </wa-card>
        ) : (
          wanInterfaces.map(iface => {
            const title =
              iface.type === 'wifi' && 'ssid' in iface && iface.ssid
                ? `${iface.ssid} (${iface.name})`
                : iface.name;

            const tags: StatusCardTag[] = [];
            if (iface.ipAddress) {
              tags.push({
                label: 'IP',
                value: iface.ipAddress,
                icon: (
                  <FontAwesomeIcon
                    icon={faGlobe}
                    style={{ ...createIconStyle(ICON_STYLES.ipv4), maxWidth: '2rem' }}
                  />
                ),
                variant: 'neutral',
              });
            }
            if (iface.gateway) {
              tags.push({
                label: 'Gateway',
                value: iface.gateway,
                icon: (
                  <FontAwesomeIcon icon={faRouter} style={createIconStyle(ICON_STYLES.gateway)} />
                ),
                variant: 'neutral',
              });
            }

            // Add Tailscale-specific tags and action button
            let tailscaleActionButton: React.ReactNode | undefined;
            if (iface.type === 'tailscale') {
              const tsInterface = iface as TailscaleInterface;

              // Add exit node tag if using one
              if (tsInterface.exitNode && tailscaleSettings?.exitNode) {
                // Find the exit node name from settings
                const exitNodeName = tailscaleSettings.exitNode;
                tags.push({
                  label: 'Exit Node',
                  value: exitNodeName,
                  icon: (
                    <FontAwesomeIcon
                      icon={faArrowRightFromBracket}
                      style={createIconStyle(ICON_STYLES.tailscale)}
                    />
                  ),
                  variant: 'neutral',
                });
              }

              // Add accepted subnet route tags from peers
              if (tailscaleSettings?.acceptRoutes && tailscalePeers) {
                // Collect all subnet routes from peers
                const subnetRoutes = new Set<string>();
                tailscalePeers.forEach(peer => {
                  if (peer.subnetRoutes && peer.subnetRoutes.length > 0) {
                    peer.subnetRoutes.forEach(route => subnetRoutes.add(route));
                  }
                });

                // Add tags for each unique subnet route
                subnetRoutes.forEach(route => {
                  tags.push({
                    label: route,
                    icon: (
                      <FontAwesomeIcon
                        icon={faNetworkWired}
                        style={createIconStyle(ICON_STYLES.routes)}
                      />
                    ),
                    variant: 'neutral',
                  });
                });
              }

              // Add gear button for Tailscale settings
              tailscaleActionButton = (
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
                  <wa-button appearance='plain' size='small' style={{ pointerEvents: 'none' }}>
                    <FontAwesomeIcon icon={faGear} style={createIconStyle(ICON_STYLES.settings)} />
                  </wa-button>
                </div>
              );
            }

            // Build ISP tags
            const ispTags: StatusCardTag[] = [];
            if (iface.ispName) {
              ispTags.push({
                label: 'ISP',
                value: iface.ispName,
                variant: 'neutral',
              });
            }
            if (iface.publicIpv4) {
              ispTags.push({
                label: 'IPv4',
                value: iface.publicIpv4,
                icon: (
                  <FontAwesomeIcon
                    icon={faGlobe}
                    style={{ ...createIconStyle(ICON_STYLES.ipv4), maxWidth: '2rem' }}
                  />
                ),
                variant: 'neutral',
              });
            }
            if (iface.publicIpv6) {
              ispTags.push({
                label: 'IPv6',
                value: iface.publicIpv6,
                icon: (
                  <FontAwesomeIcon
                    icon={faGlobe}
                    style={{ ...createIconStyle(ICON_STYLES.ipv6), maxWidth: '2rem' }}
                  />
                ),
                variant: 'neutral',
              });
            }

            return (
              <div key={iface.name} className='wa-stack wa-gap-m'>
                {/* WAN Interface Card */}
                <StatusCard
                  type='callout'
                  variant={iface.state === 'up' ? 'success' : 'danger'}
                  layout='vertical'
                  icon={
                    <FontAwesomeIcon
                      icon={getInterfaceIcon(iface)}
                      size='lg'
                      style={{ ...createIconStyle(ICON_STYLES[iface.type]), maxWidth: '2rem' }}
                    />
                  }
                  title={title}
                  tags={tags}
                  actionButton={tailscaleActionButton}
                  className='interface-callout'
                  detailsContent={<InterfaceDetailsPopup iface={iface} />}
                />

                {/* Vertical Ellipsis Separator */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    minHeight: '2rem',
                    color: 'var(--wa-color-text-secondary)',
                    fontSize: '1.5rem',
                    fontWeight: 'bold',
                  }}
                >
                  ⋮
                </div>

                {/* Internet/ISP Card */}
                <StatusCard
                  type='callout'
                  variant={iface.state === 'up' ? 'success' : 'danger'}
                  layout='vertical'
                  icon={
                    <FontAwesomeIcon
                      icon={faGlobe}
                      size='lg'
                      style={createIconStyle(ICON_STYLES.brand)}
                    />
                  }
                  title='Internet'
                  tags={
                    ispTags.length > 0
                      ? ispTags
                      : [{ label: 'No ISP information available', variant: 'neutral' }]
                  }
                  className='interface-callout'
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
