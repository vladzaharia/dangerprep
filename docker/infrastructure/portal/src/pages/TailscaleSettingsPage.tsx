import {
  faGlobe,
  faRoute,
  faTerminal,
  faArrowRightFromBracket,
} from '@awesome.me/kit-a765fc5647/icons/duotone/solid';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useState, Suspense } from 'react';

import { useTailscaleSettings, useTailscaleExitNodes } from '../hooks/useSWRData';
import type { TailscaleExitNode } from '../types/network';
import { createIconStyle, ICON_STYLES } from '../utils/iconStyles';

/**
 * Loading skeleton for settings page
 */
function TailscaleSettingsSkeleton() {
  return (
    <div className='wa-stack wa-gap-xl'>
      <wa-skeleton effect='sheen' style={{ width: '300px', height: '36px' }}></wa-skeleton>
      <div
        className='wa-grid wa-gap-m'
        style={{ '--min-column-size': '250px' } as React.CSSProperties}
      >
        {[1, 2, 3, 4].map(i => (
          <wa-skeleton
            key={i}
            effect='sheen'
            style={{ width: '100%', height: '200px' }}
          ></wa-skeleton>
        ))}
      </div>
    </div>
  );
}

/**
 * Tailscale Settings Page Content
 */
function TailscaleSettingsContent() {
  const { data: settings, mutate: mutateSettings } = useTailscaleSettings();
  const { data: exitNodes } = useTailscaleExitNodes();
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleToggleSetting = async (
    settingName: string,
    endpoint: string,
    currentValue: boolean
  ) => {
    setLoading(settingName);
    setMessage(null);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [settingName === 'ssh' ? 'enabled' : 'accept']: !currentValue }),
      });

      const result = await response.json();

      if (result.success) {
        setMessage({ type: 'success', text: result.message });
        // Refresh settings
        await mutateSettings();
      } else {
        setMessage({ type: 'error', text: result.message || 'Failed to update setting' });
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to update setting',
      });
    } finally {
      setLoading(null);
    }
  };

  const handleSetExitNode = async (nodeId: string | null) => {
    setLoading('exitNode');
    setMessage(null);

    try {
      const response = await fetch('/api/tailscale/exit-node', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId }),
      });

      const result = await response.json();

      if (result.success) {
        setMessage({ type: 'success', text: result.message });
        // Refresh settings
        await mutateSettings();
      } else {
        setMessage({ type: 'error', text: result.message || 'Failed to set exit node' });
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to set exit node',
      });
    } finally {
      setLoading(null);
    }
  };

  if (!settings) {
    return (
      <div className='wa-stack wa-gap-xl'>
        <h2>Tailscale Settings</h2>
        <wa-callout variant='neutral'>
          Tailscale is not configured or settings could not be loaded.
        </wa-callout>
      </div>
    );
  }

  return (
    <div className='wa-stack wa-gap-xl'>
      <h2>Tailscale Settings</h2>

      {/* Status message */}
      {message && (
        <wa-callout variant={message.type === 'success' ? 'success' : 'danger'}>
          {message.text}
        </wa-callout>
      )}

      {/* Settings cards grid */}
      <div
        className='wa-grid wa-gap-m'
        style={{ '--min-column-size': '250px' } as React.CSSProperties}
      >
        {/* Exit Node Card */}
        <wa-card appearance='outlined'>
          <div className='wa-stack wa-gap-xl' style={{ padding: 'var(--wa-space-m)' }}>
            <div className='wa-stack wa-gap-s' style={{ alignItems: 'center' }}>
              <FontAwesomeIcon
                icon={faArrowRightFromBracket}
                size='4x'
                style={createIconStyle(ICON_STYLES.brand)}
              />
              <h3 className='wa-heading-s'>Exit Node</h3>
            </div>
            <div className='wa-stack wa-gap-m'>
              <wa-select
                value={settings.exitNode || ''}
                onchange={(e: Event) => {
                  const target = e.target as HTMLSelectElement;
                  handleSetExitNode(target.value || null);
                }}
                disabled={loading !== null}
              >
                <option value=''>No Exit Node</option>
                {exitNodes?.map((node: TailscaleExitNode) => (
                  <option key={node.id} value={node.id}>
                    {node.name} {node.location ? `(${node.location})` : ''}
                    {node.suggested ? ' ⭐' : ''}
                  </option>
                ))}
              </wa-select>
              {loading === 'exitNode' && (
                <div style={{ textAlign: 'center' }}>
                  <wa-spinner></wa-spinner>
                </div>
              )}
            </div>
          </div>
        </wa-card>

        {/* DNS Card */}
        <wa-card appearance='outlined'>
          <div className='wa-stack wa-gap-xl' style={{ padding: 'var(--wa-space-m)' }}>
            <div className='wa-stack wa-gap-s' style={{ alignItems: 'center' }}>
              <FontAwesomeIcon
                icon={faGlobe}
                size='4x'
                style={createIconStyle(ICON_STYLES.success)}
              />
              <h3 className='wa-heading-s'>Accept DNS</h3>
            </div>
            <div className='wa-stack wa-gap-m'>
              <p className='wa-body-s' style={{ textAlign: 'center' }}>
                Use Tailscale's DNS settings including MagicDNS
              </p>
              <wa-switch
                checked={settings.acceptDNS}
                onchange={() =>
                  handleToggleSetting('acceptDNS', '/api/tailscale/accept-dns', settings.acceptDNS)
                }
                disabled={loading !== null}
              >
                {settings.acceptDNS ? 'Enabled' : 'Disabled'}
              </wa-switch>
              {loading === 'acceptDNS' && (
                <div style={{ textAlign: 'center' }}>
                  <wa-spinner></wa-spinner>
                </div>
              )}
            </div>
          </div>
        </wa-card>

        {/* Routes Card */}
        <wa-card appearance='outlined'>
          <div className='wa-stack wa-gap-xl' style={{ padding: 'var(--wa-space-m)' }}>
            <div className='wa-stack wa-gap-s' style={{ alignItems: 'center' }}>
              <FontAwesomeIcon
                icon={faRoute}
                size='4x'
                style={createIconStyle(ICON_STYLES.warning)}
              />
              <h3 className='wa-heading-s'>Accept Routes</h3>
            </div>
            <div className='wa-stack wa-gap-m'>
              <p className='wa-body-s' style={{ textAlign: 'center' }}>
                Accept subnet routes advertised by other nodes
              </p>
              <wa-switch
                checked={settings.acceptRoutes}
                onchange={() =>
                  handleToggleSetting(
                    'acceptRoutes',
                    '/api/tailscale/accept-routes',
                    settings.acceptRoutes
                  )
                }
                disabled={loading !== null}
              >
                {settings.acceptRoutes ? 'Enabled' : 'Disabled'}
              </wa-switch>
              {loading === 'acceptRoutes' && (
                <div style={{ textAlign: 'center' }}>
                  <wa-spinner></wa-spinner>
                </div>
              )}
            </div>
          </div>
        </wa-card>

        {/* SSH Card */}
        <wa-card appearance='outlined'>
          <div className='wa-stack wa-gap-xl' style={{ padding: 'var(--wa-space-m)' }}>
            <div className='wa-stack wa-gap-s' style={{ alignItems: 'center' }}>
              <FontAwesomeIcon
                icon={faTerminal}
                size='4x'
                style={createIconStyle(ICON_STYLES.tailscale)}
              />
              <h3 className='wa-heading-s'>Tailscale SSH</h3>
            </div>
            <div className='wa-stack wa-gap-m'>
              <p className='wa-body-s' style={{ textAlign: 'center' }}>
                Enable SSH access via Tailscale
              </p>
              <wa-switch
                checked={settings.ssh}
                onchange={() => handleToggleSetting('ssh', '/api/tailscale/ssh', settings.ssh)}
                disabled={loading !== null}
              >
                {settings.ssh ? 'Enabled' : 'Disabled'}
              </wa-switch>
              {loading === 'ssh' && (
                <div style={{ textAlign: 'center' }}>
                  <wa-spinner></wa-spinner>
                </div>
              )}
            </div>
          </div>
        </wa-card>
      </div>
    </div>
  );
}

/**
 * Tailscale Settings Page Component
 */
export const TailscaleSettingsPage: React.FC = () => {
  return (
    <Suspense fallback={<TailscaleSettingsSkeleton />}>
      <TailscaleSettingsContent />
    </Suspense>
  );
};
