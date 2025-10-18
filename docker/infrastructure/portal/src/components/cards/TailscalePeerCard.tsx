import {
  faTerminal,
  faRoute,
  faPlugCircleBolt,
} from '@awesome.me/kit-a765fc5647/icons/duotone/solid';
import {
  faArrowRightFromBracket,
  faTag,
  faComputerClassic,
  faGlobe,
} from '@awesome.me/kit-a765fc5647/icons/utility-duo/semibold';
import type WaPopup from '@awesome.me/webawesome/dist/components/popup/popup.js';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useState, useRef, useEffect } from 'react';

import type { TailscalePeer } from '../../types/network';

interface TailscalePeerCardProps {
  peer: TailscalePeer;
}

/**
 * Get OS color and brand icon based on OS string
 */
const getOSInfo = (os: string): { icon: string; color: string; family: 'brands' } => {
  const osLower = os.toLowerCase();

  if (osLower.includes('linux')) {
    return { icon: 'linux', color: '#FCC624', family: 'brands' }; // Linux yellow-orange
  } else if (osLower.includes('android')) {
    return { icon: 'android', color: '#3DDC84', family: 'brands' }; // Android green
  } else if (osLower.includes('windows')) {
    return { icon: 'windows', color: '#0078D4', family: 'brands' }; // Windows blue
  } else if (osLower.includes('mac') || osLower.includes('ios') || osLower.includes('ipad')) {
    return { icon: 'apple', color: '#A855F7', family: 'brands' }; // Apple purple
  }

  // Default fallback
  return { icon: 'computer', color: '#6b7280', family: 'brands' };
};

/**
 * Tailscale Peer Card with expandable popup
 */
export const TailscalePeerCard: React.FC<TailscalePeerCardProps> = ({ peer }) => {
  const [popupOpen, setPopupOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [popupElement, setPopupElement] = useState<WaPopup | null>(null);

  const osInfo = getOSInfo(peer.os);

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popupOpen &&
        cardRef.current &&
        popupElement &&
        !cardRef.current.contains(event.target as Node) &&
        !popupElement.contains(event.target as Node)
      ) {
        setPopupOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [popupOpen, popupElement]);

  const handleCardClick = () => {
    setPopupOpen(!popupOpen);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setPopupOpen(!popupOpen);
    } else if (e.key === 'Escape' && popupOpen) {
      setPopupOpen(false);
    }
  };

  // Check if this peer is an app connector
  const isAppConnector = peer.tags?.some(tag => tag === 'tag:connector') || false;

  // Build mini-tags for the flank
  const miniTags: React.ReactNode[] = [];

  // OS tag (icon only)
  miniTags.push(
    <wa-tag key='os' variant='success' size='small'>
      <wa-icon
        family='brands'
        name={osInfo.icon}
        style={{ color: osInfo.color, fontSize: '1em' }}
        label={peer.os}
      />
    </wa-tag>
  );

  // Exit node tag (icon only)
  if (peer.exitNode || peer.exitNodeOption) {
    miniTags.push(
      <wa-tag key='exit-node' variant={peer.exitNode ? 'warning' : 'neutral'} size='small'>
        <FontAwesomeIcon
          icon={faArrowRightFromBracket}
          style={
            {
              '--fa-primary-color': peer.exitNode ? '#fb923c' : '#6b7280',
              '--fa-primary-opacity': 0.9,
              '--fa-secondary-opacity': 0.8,
              fontSize: '0.875em',
            } as React.CSSProperties
          }
          title={peer.exitNode ? 'Active Exit Node' : 'Exit Node Available'}
        />
      </wa-tag>
    );
  }

  // App connector tag (icon only)
  if (isAppConnector) {
    miniTags.push(
      <wa-tag key='app-connector' variant='brand' size='small'>
        <FontAwesomeIcon
          icon={faPlugCircleBolt}
          style={
            {
              '--fa-primary-color': '#8b5cf6',
              '--fa-primary-opacity': 0.9,
              fontSize: '0.875em',
            } as React.CSSProperties
          }
          title='App Connector'
        />
      </wa-tag>
    );
  }

  // Subnet routes tag (icon only)
  if (peer.subnetRoutes && peer.subnetRoutes.length > 0) {
    miniTags.push(
      <wa-tag key='subnets' variant='success' size='small'>
        <FontAwesomeIcon
          icon={faRoute}
          style={
            {
              '--fa-primary-color': '#10b981',
              '--fa-primary-opacity': 0.9,
              fontSize: '0.875em',
            } as React.CSSProperties
          }
          title={`Subnets: ${peer.subnetRoutes.join(', ')}`}
        />
      </wa-tag>
    );
  }

  // SSH tag (icon only)
  if (peer.sshEnabled) {
    miniTags.push(
      <wa-tag key='ssh' variant='brand' size='small'>
        <FontAwesomeIcon
          icon={faTerminal}
          style={
            {
              '--fa-primary-color': '#a855f7',
              '--fa-primary-opacity': 0.9,
              fontSize: '0.875em',
            } as React.CSSProperties
          }
          title='SSH Enabled'
        />
      </wa-tag>
    );
  }

  return (
    <>
      <div
        ref={cardRef}
        className='tailscale-peer-card'
        onClick={handleCardClick}
        onKeyDown={handleKeyDown}
        role='button'
        tabIndex={0}
        aria-expanded={popupOpen}
        aria-label={`${peer.hostname} - ${peer.online ? 'Online' : 'Offline'}`}
        style={{
          cursor: 'pointer',
          position: 'relative',
        }}
      >
        <wa-callout
          appearance='outlined'
          variant={peer.online ? 'success' : 'neutral'}
          style={{ pointerEvents: 'none' }}
        >
          <div className='wa-flank wa-gap-m wa-align-items-center'>
            {/* Computer Icon with status color */}
            <div style={{ maxWidth: '3rem', flexShrink: 0 }}>
              <FontAwesomeIcon
                icon={faComputerClassic}
                size='2x'
                style={
                  {
                    '--fa-primary-color': peer.online ? '#10b981' : '#6b7280',
                    '--fa-primary-opacity': 1,
                    '--fa-secondary-opacity': 0.7,
                  } as React.CSSProperties
                }
              />
            </div>

            {/* Hostname and IP - takes remaining space */}
            <div className='wa-stack wa-gap-3xs' style={{ flex: 1, minWidth: 0 }}>
              <span className='wa-body-s' style={{ fontWeight: 600 }}>
                {peer.hostname || peer.ipAddress}
              </span>
              <span className='wa-caption-s'>{peer.ipAddress}</span>
            </div>

            {/* Mini-tags cluster - right-aligned */}
            <div style={{ maxWidth: '8rem', flexShrink: 0 }}>
              <div className='wa-cluster wa-gap-3xs' style={{ justifyContent: 'flex-end' }}>
                {miniTags}
              </div>
            </div>
          </div>
        </wa-callout>

        {/* Popup for additional details */}
        {cardRef.current && (
          <wa-popup
            ref={setPopupElement}
            anchor={cardRef.current}
            placement='bottom'
            distance={0}
            active={popupOpen}
            shift
          >
            <wa-card appearance='outlined' style={{ width: '100%' }}>
              <div className='wa-stack wa-gap-s' style={{ padding: 'var(--wa-space-s)' }}>
                {/* Status and last seen */}
                {!peer.online && peer.lastSeen && (
                  <div className='wa-caption-s'>
                    Last seen: {new Date(peer.lastSeen).toLocaleDateString()}
                  </div>
                )}

                {/* Detailed tags */}
                <div className='wa-cluster wa-gap-xs'>
                  {/* OS tag with label */}
                  <wa-tag variant='success' size='small'>
                    <div className='wa-flank wa-gap-xs'>
                      <wa-icon family='brands' name={osInfo.icon} style={{ color: osInfo.color }} />
                      <span>
                        {peer.os
                          .replace('linux', 'Linux')
                          .replace('windows', 'Windows')
                          .replace('android', 'Android')
                          .replace('macOS', 'macOS')
                          .replace('iOS', 'iOS')}
                      </span>
                    </div>
                  </wa-tag>

                  {/* IPv6 address if available */}
                  {peer.tailscaleIPs &&
                    peer.tailscaleIPs
                      .filter(ip => ip.includes(':'))
                      .map((ipv6, idx) => (
                        <wa-tag key={`ipv6-${idx}`} variant='brand' size='small'>
                          <div className='wa-flank wa-gap-xs'>
                            <FontAwesomeIcon
                              icon={faGlobe}
                              style={
                                {
                                  '--fa-primary-color': '#8b5cf6',
                                  '--fa-primary-opacity': 0.9,
                                } as React.CSSProperties
                              }
                            />
                            <span>{ipv6}</span>
                          </div>
                        </wa-tag>
                      ))}

                  {peer.exitNodeOption && (
                    <wa-tag variant={peer.exitNode ? 'warning' : 'neutral'} size='small'>
                      <div className='wa-flank wa-gap-xs'>
                        <FontAwesomeIcon
                          icon={faArrowRightFromBracket}
                          style={
                            {
                              '--fa-primary-color': peer.exitNode ? '#fb923c' : '#6b7280',
                              '--fa-primary-opacity': 0.9,
                            } as React.CSSProperties
                          }
                        />
                        <span>{peer.exitNode ? 'Active Exit Node' : 'Exit Node Available'}</span>
                      </div>
                    </wa-tag>
                  )}

                  {/* App connector tag */}
                  {isAppConnector && (
                    <wa-tag variant='brand' size='small'>
                      <div className='wa-flank wa-gap-xs'>
                        <FontAwesomeIcon
                          icon={faPlugCircleBolt}
                          style={
                            {
                              '--fa-primary-color': '#8b5cf6',
                              '--fa-primary-opacity': 0.9,
                            } as React.CSSProperties
                          }
                        />
                        <span>App Connector</span>
                      </div>
                    </wa-tag>
                  )}

                  {/* SSH with label */}
                  {peer.sshEnabled && (
                    <wa-tag variant='brand' size='small'>
                      <div className='wa-flank wa-gap-xs'>
                        <FontAwesomeIcon
                          icon={faTerminal}
                          style={
                            {
                              '--fa-primary-color': '#a855f7',
                              '--fa-primary-opacity': 0.9,
                            } as React.CSSProperties
                          }
                        />
                        <span>SSH</span>
                      </div>
                    </wa-tag>
                  )}

                  {/* Subnet routes with labels */}
                  {peer.subnetRoutes &&
                    peer.subnetRoutes.map((route, idx) => (
                      <wa-tag key={`route-${idx}`} variant='success' size='small'>
                        <div className='wa-flank wa-gap-xs'>
                          <FontAwesomeIcon
                            icon={faRoute}
                            style={
                              {
                                '--fa-primary-color': '#10b981',
                                '--fa-primary-opacity': 0.9,
                              } as React.CSSProperties
                            }
                          />
                          <span>{route}</span>
                        </div>
                      </wa-tag>
                    ))}

                  {/* Tailscale tags (excluding connector and exit-node) */}
                  {peer.tags &&
                    peer.tags.map((tag, idx) => {
                      const tagName = tag.replace('tag:', '');
                      // Skip connector and exit-node tags as they're shown separately
                      if (tagName === 'exit-node' || tagName === 'connector') return null;

                      return (
                        <wa-tag key={`tag-${idx}`} variant='brand' size='small'>
                          <div className='wa-flank wa-gap-xs'>
                            <FontAwesomeIcon
                              icon={faTag}
                              style={
                                {
                                  '--fa-primary-color': '#6366f1',
                                  '--fa-primary-opacity': 0.9,
                                } as React.CSSProperties
                              }
                            />
                            <span>{tagName}</span>
                          </div>
                        </wa-tag>
                      );
                    })}

                  {/* Expired warning */}
                  {peer.expired && (
                    <wa-tag variant='danger' size='small'>
                      Expired
                    </wa-tag>
                  )}
                </div>
              </div>
            </wa-card>
          </wa-popup>
        )}
      </div>
    </>
  );
};
