import { faTerminal, faRoute } from '@awesome.me/kit-a765fc5647/icons/duotone/solid';
import {
  faArrowRightFromBracket,
  faTag,
  faComputerClassic,
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

  // Build mini-tags for the flank
  const miniTags: React.ReactNode[] = [];

  // OS tag (icon only)
  miniTags.push(
    <wa-tag key='os' variant='neutral' size='small'>
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
      <wa-tag key='exit-node' variant={peer.exitNode ? 'brand' : 'neutral'} size='small'>
        <FontAwesomeIcon
          icon={faArrowRightFromBracket}
          style={
            {
              '--fa-primary-color': '#fb923c',
              '--fa-primary-opacity': 0.9,
              '--fa-secondary-opacity': 0.8,
              fontSize: '0.875em',
            } as React.CSSProperties
          }
          title={peer.exitNode ? 'Active Exit Node' : 'Exit Node'}
        />
      </wa-tag>
    );
  }

  // Subnet routes tag (icon only)
  if (peer.subnetRoutes && peer.subnetRoutes.length > 0) {
    miniTags.push(
      <wa-tag key='subnets' variant='neutral' size='small'>
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
      <wa-tag key='ssh' variant='neutral' size='small'>
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
            {/* Computer Icon with OS color */}
            <div style={{ maxWidth: '3rem', flexShrink: 0 }}>
              <FontAwesomeIcon
                icon={faComputerClassic}
                size='2x'
                style={
                  {
                    '--fa-primary-color': osInfo.color,
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
              <div className='wa-cluster wa-gap-3xs' style={{ justifyContent: 'flex-end' }}>{miniTags}</div>
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
                  <wa-tag variant='neutral' size='small'>
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

                  {peer.exitNodeOption && (
                    <wa-tag variant='neutral' size='small'>
                      <div className='wa-flank wa-gap-xs'>
                        <FontAwesomeIcon icon={faArrowRightFromBracket} />
                        <span>Exit Node</span>
                      </div>
                    </wa-tag>
                  )}

                  {/* SSH with label */}
                  {peer.sshEnabled && (
                    <wa-tag variant='neutral' size='small'>
                      <div className='wa-flank wa-gap-xs'>
                        <FontAwesomeIcon icon={faTerminal} />
                        <span>SSH</span>
                      </div>
                    </wa-tag>
                  )}

                  {/* Subnet routes with labels */}
                  {peer.subnetRoutes &&
                    peer.subnetRoutes.map((route, idx) => (
                      <wa-tag key={`route-${idx}`} variant='neutral' size='small'>
                        <div className='wa-flank wa-gap-xs'>
                          <FontAwesomeIcon icon={faRoute} />
                          <span>{route}</span>
                        </div>
                      </wa-tag>
                    ))}

                  {/* Tailscale tags */}
                  {peer.tags &&
                    peer.tags.map((tag, idx) => {
                      const tagName = tag.replace('tag:', '');
                      if (tagName === 'exit-node') return null;

                      return (
                        <wa-tag key={`tag-${idx}`} variant='neutral' size='small'>
                          <div className='wa-flank wa-gap-xs'>
                            <FontAwesomeIcon icon={faTag} />
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
