import {
  faGlobe,
  faRoute,
  faTerminal,
  faArrowRightFromBracket,
  faShield,
  faPowerOff,
  faGears,
  faNetworkWired,
} from '@awesome.me/kit-a765fc5647/icons/duotone/solid';
import { faWifi } from '@awesome.me/kit-a765fc5647/icons/utility-duo/semibold';
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

  const handleToggleSetting = async (settingName: string, currentValue: boolean) => {
    setLoading(settingName);
    setMessage(null);

    try {
      const response = await fetch('/api/tailscale/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [settingName]: !currentValue }),
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
      const response = await fetch('/api/tailscale/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exitNode: nodeId }),
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

      {/* Uncategorized Settings Grid */}
      <div
        className='wa-grid wa-gap-m'
        style={
          {
            '--min-column-size': '250px',
            '--max-columns': '3',
          } as React.CSSProperties
        }
      >
        {/* On/Off Control - Stateful based on running state */}
        <wa-card appearance='outlined'>
          <div className='wa-stack wa-gap-xl' style={{ padding: 'var(--wa-space-m)' }}>
            <div className='wa-stack wa-gap-s' style={{ alignItems: 'center' }}>
              <FontAwesomeIcon
                icon={faPowerOff}
                size='4x'
                style={createIconStyle(settings.running ? ICON_STYLES.success : ICON_STYLES.danger)}
              />
              <h3 className='wa-heading-s'>Tailscale Status</h3>
            </div>
            <div className='wa-stack wa-gap-m'>
              <p className='wa-body-s' style={{ textAlign: 'center' }}>
                {settings.running ? 'Tailscale is running' : 'Tailscale is stopped'}
              </p>
              {settings.running ? (
                <wa-button
                  appearance='outlined'
                  variant='danger'
                  {...({
                    onclick: async () => {
                      setLoading('tailscale-stop');
                      setMessage(null);
                      try {
                        const response = await fetch('/api/tailscale/stop', { method: 'POST' });
                        const result = await response.json();
                        if (result.success) {
                          setMessage({ type: 'success', text: result.message });
                          await mutateSettings();
                        } else {
                          setMessage({ type: 'error', text: result.message });
                        }
                      } catch (error) {
                        setMessage({
                          type: 'error',
                          text: error instanceof Error ? error.message : 'Failed to stop',
                        });
                      } finally {
                        setLoading(null);
                      }
                    },
                  } as Record<string, unknown>)}
                  disabled={loading !== null}
                >
                  Stop Tailscale
                </wa-button>
              ) : (
                <wa-button
                  appearance='outlined'
                  variant='success'
                  {...({
                    onclick: async () => {
                      setLoading('tailscale-start');
                      setMessage(null);
                      try {
                        const response = await fetch('/api/tailscale/start', { method: 'POST' });
                        const result = await response.json();
                        if (result.success) {
                          setMessage({ type: 'success', text: result.message });
                          await mutateSettings();
                        } else {
                          setMessage({ type: 'error', text: result.message });
                        }
                      } catch (error) {
                        setMessage({
                          type: 'error',
                          text: error instanceof Error ? error.message : 'Failed to start',
                        });
                      } finally {
                        setLoading(null);
                      }
                    },
                  } as Record<string, unknown>)}
                  disabled={loading !== null}
                >
                  Start Tailscale
                </wa-button>
              )}
              {(loading === 'tailscale-start' || loading === 'tailscale-stop') && (
                <div style={{ textAlign: 'center' }}>
                  <wa-spinner></wa-spinner>
                </div>
              )}
            </div>
          </div>
        </wa-card>

        {/* Exit Node Card */}
        <wa-card appearance='outlined'>
          <div className='wa-stack wa-gap-s wa-align-items-center'>
            <FontAwesomeIcon
              icon={faArrowRightFromBracket}
              size='4x'
              style={createIconStyle(ICON_STYLES.brand)}
            />
            <h3 className='wa-heading-s'>Exit Node</h3>
            <p className='wa-body-s' style={{ textAlign: 'center' }}>
              Route all traffic through another Tailscale node
            </p>
          </div>
          <div slot='footer' className='wa-stack wa-gap-m'>
            <wa-select
              value={settings.exitNode || ''}
              placeholder='No exit node'
              {...({ clearable: true } as Record<string, unknown>)}
              onchange={(e: Event) => {
                const target = e.target as HTMLSelectElement;
                handleSetExitNode(target.value || null);
              }}
              disabled={loading !== null || !settings.running}
            >
              {exitNodes?.map((node: TailscaleExitNode) => (
                <wa-option key={node.id} value={node.id}>
                  {node.name} {node.location ? `(${node.location})` : ''}
                  {node.suggested ? ' ⭐' : ''}
                </wa-option>
              ))}
            </wa-select>
            {loading === 'exitNode' && <wa-spinner></wa-spinner>}
          </div>
        </wa-card>
      </div>

      {/* Basic Settings Section */}
      <h3 className='wa-heading-m'>Basic Settings</h3>
      <div
        className='wa-grid wa-gap-m'
        style={
          {
            '--min-column-size': '250px',
            '--max-columns': '3',
          } as React.CSSProperties
        }
      >
        {/* DNS Card */}
        <wa-card appearance='outlined'>
          <wa-switch
            slot='header'
            checked={settings.acceptDNS}
            onchange={() => handleToggleSetting('acceptDNS', settings.acceptDNS)}
            disabled={loading !== null || !settings.running}
          ></wa-switch>
          <div className='wa-stack wa-gap-s wa-align-items-center'>
            <FontAwesomeIcon
              icon={faGlobe}
              size='4x'
              style={createIconStyle(ICON_STYLES.success)}
            />
            <h3 className='wa-heading-s'>Accept DNS</h3>
            <p className='wa-body-s' style={{ textAlign: 'center' }}>
              Use Tailscale's DNS settings including MagicDNS
            </p>
            {loading === 'acceptDNS' && <wa-spinner></wa-spinner>}
          </div>
        </wa-card>

        {/* Routes Card */}
        <wa-card appearance='outlined'>
          <wa-switch
            slot='header'
            checked={settings.acceptRoutes}
            onchange={() => handleToggleSetting('acceptRoutes', settings.acceptRoutes)}
            disabled={loading !== null || !settings.running}
          ></wa-switch>
          <div className='wa-stack wa-gap-s wa-align-items-center'>
            <FontAwesomeIcon
              icon={faRoute}
              size='4x'
              style={createIconStyle(ICON_STYLES.warning)}
            />
            <h3 className='wa-heading-s'>Accept Routes</h3>
            <p className='wa-body-s' style={{ textAlign: 'center' }}>
              Accept subnet routes advertised by other nodes
            </p>
            {loading === 'acceptRoutes' && <wa-spinner></wa-spinner>}
          </div>
        </wa-card>

        {/* SSH Card */}
        <wa-card appearance='outlined'>
          <wa-switch
            slot='header'
            checked={settings.ssh}
            onchange={() => handleToggleSetting('ssh', settings.ssh)}
            disabled={loading !== null || !settings.running}
          ></wa-switch>
          <div className='wa-stack wa-gap-s wa-align-items-center'>
            <FontAwesomeIcon
              icon={faTerminal}
              size='4x'
              style={createIconStyle(ICON_STYLES.tailscale)}
            />
            <h3 className='wa-heading-s'>Tailscale SSH</h3>
            <p className='wa-body-s' style={{ textAlign: 'center' }}>
              Enable SSH access via Tailscale
            </p>
            {loading === 'ssh' && <wa-spinner></wa-spinner>}
          </div>
        </wa-card>
      </div>

      {/* Advertise Settings Section */}
      <h3 className='wa-heading-m'>Advertise Settings</h3>
      <div
        className='wa-grid wa-gap-m'
        style={
          {
            '--min-column-size': '250px',
            '--max-columns': '3',
          } as React.CSSProperties
        }
      >
        {/* Advertise Exit Node Card */}
        <wa-card appearance='outlined'>
          <wa-switch
            slot='header'
            checked={settings.advertiseExitNode}
            onchange={() =>
              handleToggleSetting('advertiseExitNode', settings.advertiseExitNode)
            }
            disabled={loading !== null || !settings.running}
          ></wa-switch>
          <div className='wa-stack wa-gap-s wa-align-items-center'>
            <FontAwesomeIcon icon={faWifi} size='4x' style={createIconStyle(ICON_STYLES.brand)} />
            <h3 className='wa-heading-s'>Advertise Exit Node</h3>
            <p className='wa-body-s' style={{ textAlign: 'center' }}>
              Offer this device as an exit node for others
            </p>
            {loading === 'advertiseExitNode' && <wa-spinner></wa-spinner>}
          </div>
        </wa-card>

        {/* Advertise Subnets Card with Advanced Settings */}
        <wa-card appearance='outlined'>
          <div className='wa-stack wa-gap-s wa-align-items-center'>
            <FontAwesomeIcon
              icon={faNetworkWired}
              size='4x'
              style={createIconStyle(ICON_STYLES.warning)}
            />
            <h3 className='wa-heading-s'>Advertise Subnets</h3>
            <p className='wa-body-s' style={{ textAlign: 'center' }}>
              Expose subnet routes (comma-separated CIDRs)
            </p>
          </div>
          <div slot='footer' className='wa-stack wa-gap-m'>
            <wa-input
              value={settings.advertiseRoutes?.join(',') || ''}
              placeholder='192.168.1.0/24,10.0.0.0/8'
              {...({ disabled: loading !== null || !settings.running } as Record<
                string,
                unknown
              >)}
              onchange={async (e: Event) => {
                const target = e.target as HTMLInputElement;
                const routes = target.value
                  .split(',')
                  .map(r => r.trim())
                  .filter(r => r.length > 0);
                setLoading('advertiseRoutes');
                setMessage(null);
                try {
                  const response = await fetch('/api/tailscale/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ advertiseRoutes: routes }),
                  });
                  const result = await response.json();
                  if (result.success) {
                    setMessage({ type: 'success', text: result.message });
                    await mutateSettings();
                  } else {
                    setMessage({ type: 'error', text: result.message });
                  }
                } catch (error) {
                  setMessage({
                    type: 'error',
                    text: error instanceof Error ? error.message : 'Failed to update',
                  });
                } finally {
                  setLoading(null);
                }
              }}
            ></wa-input>
            {loading === 'advertiseRoutes' && <wa-spinner></wa-spinner>}
          </div>
        </wa-card>

        {/* Advertise Connector Card */}
        <wa-card appearance='outlined'>
          <wa-switch
            slot='header'
            checked={settings.advertiseConnector}
            onchange={() =>
              handleToggleSetting('advertiseConnector', settings.advertiseConnector)
            }
            disabled={loading !== null || !settings.running}
          ></wa-switch>
          <div className='wa-stack wa-gap-s wa-align-items-center'>
            <FontAwesomeIcon
              icon={faGears}
              size='4x'
              style={createIconStyle(ICON_STYLES.success)}
            />
            <h3 className='wa-heading-s'>Advertise Connector</h3>
            <p className='wa-body-s' style={{ textAlign: 'center' }}>
              Advertise this node as an app connector
            </p>
            {loading === 'advertiseConnector' && <wa-spinner></wa-spinner>}
          </div>
        </wa-card>
      </div>

      {/* Advanced Settings Section */}
      <h3 className='wa-heading-m'>Advanced Settings</h3>
      <div
        className='wa-grid wa-gap-m'
        style={
          {
            '--min-column-size': '250px',
            '--max-columns': '3',
          } as React.CSSProperties
        }
      >
        {/* Shields Up Card */}
        <wa-card appearance='outlined'>
          <wa-switch
            slot='header'
            checked={settings.shieldsUp}
            onchange={() => handleToggleSetting('shieldsUp', settings.shieldsUp)}
            disabled={loading !== null || !settings.running}
          ></wa-switch>
          <div className='wa-stack wa-gap-s wa-align-items-center'>
            <FontAwesomeIcon
              icon={faShield}
              size='4x'
              style={createIconStyle(ICON_STYLES.danger)}
            />
            <h3 className='wa-heading-s'>Shields Up</h3>
            <p className='wa-body-s' style={{ textAlign: 'center' }}>
              Block all incoming connections from Tailscale
            </p>
            {loading === 'shieldsUp' && <wa-spinner></wa-spinner>}
          </div>
        </wa-card>

        {/* Exit Node Allow LAN Card */}
        <wa-card appearance='outlined'>
          <wa-switch
            slot='header'
            checked={settings.exitNodeAllowLAN}
            onchange={() => handleToggleSetting('exitNodeAllowLAN', settings.exitNodeAllowLAN)}
            disabled={loading !== null || !settings.running}
          ></wa-switch>
          <div className='wa-stack wa-gap-s wa-align-items-center'>
            <FontAwesomeIcon
              icon={faGlobe}
              size='4x'
              style={createIconStyle(ICON_STYLES.success)}
            />
            <h3 className='wa-heading-s'>Exit Node LAN Access</h3>
            <p className='wa-body-s' style={{ textAlign: 'center' }}>
              Allow LAN access while using an exit node
            </p>
            {loading === 'exitNodeAllowLAN' && <wa-spinner></wa-spinner>}
          </div>
        </wa-card>

        {/* SNAT Subnet Routes Card */}
        <wa-card appearance='outlined'>
          <wa-switch
            slot='header'
            checked={settings.snatSubnetRoutes}
            onchange={() =>
              handleToggleSetting('snatSubnetRoutes', settings.snatSubnetRoutes)
            }
            disabled={loading !== null || !settings.running}
          ></wa-switch>
          <div className='wa-stack wa-gap-s wa-align-items-center'>
            <FontAwesomeIcon
              icon={faNetworkWired}
              size='4x'
              style={createIconStyle(ICON_STYLES.warning)}
            />
            <h3 className='wa-heading-s'>SNAT Subnet Routes</h3>
            <p className='wa-body-s' style={{ textAlign: 'center' }}>
              Apply source NAT to subnet traffic
            </p>
            {loading === 'snatSubnetRoutes' && <wa-spinner></wa-spinner>}
          </div>
        </wa-card>

        {/* Stateful Filtering Card */}
        <wa-card appearance='outlined'>
          <wa-switch
            slot='header'
            checked={settings.statefulFiltering}
            onchange={() =>
              handleToggleSetting('statefulFiltering', settings.statefulFiltering)
            }
            disabled={loading !== null || !settings.running}
          ></wa-switch>
          <div className='wa-stack wa-gap-s wa-align-items-center'>
            <FontAwesomeIcon
              icon={faShield}
              size='4x'
              style={createIconStyle(ICON_STYLES.brand)}
            />
            <h3 className='wa-heading-s'>Stateful Filtering</h3>
            <p className='wa-body-s' style={{ textAlign: 'center' }}>
              Enable stateful packet filtering for subnet routes
            </p>
            {loading === 'statefulFiltering' && <wa-spinner></wa-spinner>}
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
