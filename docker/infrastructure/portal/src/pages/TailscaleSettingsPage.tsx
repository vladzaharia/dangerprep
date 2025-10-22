import {
  faGlobe,
  faRoute,
  faTerminal,
  faArrowRightFromBracket,
  faShield,
  faPowerOff,
  faGears,
  faNetworkWired,
  faArrowTurnDownLeft,
  faRainbowHalf,
} from '@awesome.me/kit-a765fc5647/icons/duotone/solid';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useState, Suspense } from 'react';

import { SettingsCard } from '../components/cards';
import { useTailscaleSettings, useTailscaleExitNodes } from '../hooks/useSWRData';
import type { TailscaleExitNode } from '../types/network';
import { ICON_STYLES } from '../utils/iconStyles';

/**
 * Loading skeleton for Tailscale settings page
 * Matches the SettingsCard layout with icon, title, description, and footer
 */
function TailscaleSettingsSkeleton() {
  return (
    <div className='wa-stack wa-gap-xl'>
      {/* Page title */}
      <h2>Tailscale Settings</h2>

      {/* Version/Health info skeleton */}
      <div className='wa-cluster wa-gap-s'>
        <wa-skeleton
          effect='sheen'
          style={{ width: '120px', height: '24px', borderRadius: '4px' }}
        ></wa-skeleton>
        <wa-skeleton
          effect='sheen'
          style={{ width: '140px', height: '24px', borderRadius: '4px' }}
        ></wa-skeleton>
      </div>

      {/* Settings cards grid */}
      <div
        className='wa-grid wa-gap-m'
        style={{ '--min-column-size': '250px', '--max-columns': '3' } as React.CSSProperties}
      >
        {Array.from({ length: 6 }, (_, index) => (
          <wa-card key={index} appearance='outlined' className='card settings-card'>
            <div
              className='wa-stack wa-gap-s wa-align-items-center'
              style={{ justifyContent: 'center', padding: 'var(--wa-space-m)' }}
            >
              {/* Icon skeleton */}
              <wa-skeleton
                effect='sheen'
                style={{ width: '64px', height: '64px', borderRadius: '6px' }}
              ></wa-skeleton>
              {/* Title skeleton */}
              <wa-skeleton
                effect='sheen'
                style={{ width: `${120 + index * 15}px`, height: '20px' }}
              ></wa-skeleton>
              {/* Description skeleton */}
              <wa-skeleton
                effect='sheen'
                style={{ width: `${160 + index * 10}px`, height: '16px' }}
              ></wa-skeleton>
            </div>
            {/* Footer button skeleton */}
            <div slot='footer' style={{ width: '100%' }}>
              <wa-skeleton
                effect='sheen'
                style={{ width: '100%', height: '36px', borderRadius: '4px' }}
              ></wa-skeleton>
            </div>
          </wa-card>
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
        <SettingsCard
          icon={faPowerOff}
          iconStyle={settings.running ? ICON_STYLES.success : ICON_STYLES.danger}
          title='Tailscale Status'
          description={
            settings.backendState
              ? `Backend State: ${settings.backendState}`
              : settings.running
                ? 'Tailscale is running'
                : 'Tailscale is stopped'
          }
          loading={loading === 'tailscale-start' || loading === 'tailscale-stop'}
          footerSlot={
            settings.running ? (
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
            )
          }
        >
          {/* Version and Health Information */}
          {(settings.version || settings.health?.length) && (
            <div className='wa-stack wa-gap-s'>
              {settings.version && (
                <div className='wa-cluster wa-gap-s'>
                  <wa-tag variant='neutral' size='small'>
                    Version: {settings.version}
                  </wa-tag>
                  {settings.latestVersion && settings.version !== settings.latestVersion && (
                    <wa-tag variant='warning' size='small'>
                      Update available: {settings.latestVersion}
                    </wa-tag>
                  )}
                </div>
              )}
              {settings.health && settings.health.length > 0 && (
                <wa-callout variant='warning'>
                  <strong>Health Issues:</strong>
                  <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                    {settings.health.map((issue, idx) => (
                      <li key={idx}>{issue}</li>
                    ))}
                  </ul>
                </wa-callout>
              )}
            </div>
          )}
        </SettingsCard>

        {/* Exit Node Card */}
        <SettingsCard
          icon={faArrowRightFromBracket}
          iconStyle={ICON_STYLES.brand}
          title='Exit Node'
          description='Route all traffic through another Tailscale node'
          loading={loading === 'exitNode'}
          footerSlot={
            <wa-select
              value={settings?.exitNode || ''}
              placeholder='No exit node'
              {...({ clearable: true } as Record<string, unknown>)}
              onchange={(e: Event) => {
                const target = e.target as HTMLSelectElement;
                handleSetExitNode(target.value || null);
              }}
              disabled={loading !== null || !settings?.running}
            >
              {exitNodes?.map((node: TailscaleExitNode) => (
                <wa-option key={node.id} value={node.id} disabled={!node.online}>
                  {node.name} {node.location ? `(${node.location})` : ''}
                  {node.suggested ? ' ⭐' : ''}
                  {!node.online ? ' (Offline)' : ''}
                </wa-option>
              ))}
            </wa-select>
          }
        />
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
        <SettingsCard
          icon={faGlobe}
          iconStyle={ICON_STYLES.success}
          title='Accept DNS'
          description="Use Tailscale's DNS settings including MagicDNS"
          loading={loading === 'acceptDNS'}
          headerSlot={
            <wa-switch
              defaultChecked={settings.acceptDNS}
              onchange={() => handleToggleSetting('acceptDNS', settings.acceptDNS)}
              disabled={loading !== null || !settings.running}
            ></wa-switch>
          }
        />

        {/* Routes Card */}
        <SettingsCard
          icon={faRoute}
          iconStyle={ICON_STYLES.warning}
          title='Accept Routes'
          description='Accept subnet routes advertised by other nodes'
          loading={loading === 'acceptRoutes'}
          headerSlot={
            <wa-switch
              defaultChecked={settings.acceptRoutes}
              onchange={() => handleToggleSetting('acceptRoutes', settings.acceptRoutes)}
              disabled={loading !== null || !settings.running}
            ></wa-switch>
          }
        />

        {/* SSH Card */}
        <SettingsCard
          icon={faTerminal}
          iconStyle={ICON_STYLES.tailscale}
          title='Tailscale SSH'
          description='Enable SSH access via Tailscale'
          loading={loading === 'ssh'}
          headerSlot={
            <wa-switch
              defaultChecked={settings.ssh}
              onchange={() => handleToggleSetting('ssh', settings.ssh)}
              disabled={loading !== null || !settings.running}
            ></wa-switch>
          }
        />
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
        <SettingsCard
          icon={faRainbowHalf}
          iconFlip='horizontal'
          iconStyle={ICON_STYLES.brand}
          title='Advertise Exit Node'
          description='Offer this device as an exit node for others'
          loading={loading === 'advertiseExitNode'}
          headerSlot={
            <wa-switch
              defaultChecked={settings.advertiseExitNode}
              onchange={() => handleToggleSetting('advertiseExitNode', settings.advertiseExitNode)}
              disabled={loading !== null || !settings.running}
            ></wa-switch>
          }
        />

        {/* Advertise Subnets Card with Advanced Settings */}
        <SettingsCard
          icon={faNetworkWired}
          iconStyle={ICON_STYLES.warning}
          title='Advertise Subnets'
          description='Expose subnet routes (comma-separated CIDRs)'
          loading={loading === 'advertiseRoutes'}
          footerSlot={
            <wa-input
              value={settings.advertiseRoutes?.join(',') || ''}
              placeholder='192.168.1.0/24,10.0.0.0/8'
              {...({
                disabled: loading !== null || !settings.running,
                onkeydown: async (e: KeyboardEvent) => {
                  if (e.key === 'Enter') {
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
                  }
                },
              } as Record<string, unknown>)}
            >
              <span slot='end' style={{ opacity: 0.5, fontSize: '0.875rem' }}>
                <FontAwesomeIcon icon={faArrowTurnDownLeft} />
              </span>
            </wa-input>
          }
        />

        {/* Advertise Connector Card */}
        <SettingsCard
          icon={faGears}
          iconStyle={ICON_STYLES.success}
          title='Advertise Connector'
          description='Advertise this node as an app connector'
          loading={loading === 'advertiseConnector'}
          headerSlot={
            <wa-switch
              defaultChecked={settings.advertiseConnector}
              disabled={true}
              title={
                settings.advertiseConnector
                  ? 'Please disable this by removing the `connector` tag.'
                  : 'Please enable this by adding the `connector` tag.'
              }
            ></wa-switch>
          }
        />
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
        <SettingsCard
          icon={faShield}
          iconStyle={ICON_STYLES.danger}
          title='Shields Up'
          description='Block all incoming connections from Tailscale'
          loading={loading === 'shieldsUp'}
          headerSlot={
            <wa-switch
              defaultChecked={settings.shieldsUp}
              onchange={() => handleToggleSetting('shieldsUp', settings.shieldsUp)}
              disabled={loading !== null || !settings.running}
            ></wa-switch>
          }
        />

        {/* Exit Node Allow LAN Card */}
        <SettingsCard
          icon={faGlobe}
          iconStyle={ICON_STYLES.success}
          title='Exit Node LAN Access'
          description='Allow LAN access while using an exit node'
          loading={loading === 'exitNodeAllowLAN'}
          headerSlot={
            <wa-switch
              defaultChecked={settings.exitNodeAllowLAN}
              onchange={() => handleToggleSetting('exitNodeAllowLAN', settings.exitNodeAllowLAN)}
              disabled={loading !== null || !settings.running}
            ></wa-switch>
          }
        />

        {/* SNAT Subnet Routes Card */}
        <SettingsCard
          icon={faNetworkWired}
          iconStyle={ICON_STYLES.warning}
          title='SNAT Subnet Routes'
          description='Apply source NAT to subnet traffic'
          loading={loading === 'snatSubnetRoutes'}
          headerSlot={
            <wa-switch
              defaultChecked={settings.snatSubnetRoutes}
              onchange={() => handleToggleSetting('snatSubnetRoutes', settings.snatSubnetRoutes)}
              disabled={loading !== null || !settings.running}
            ></wa-switch>
          }
        />

        {/* Stateful Filtering Card */}
        <SettingsCard
          stackedIcon={{ base: faNetworkWired, overlay: faShield }}
          iconStyle={ICON_STYLES.brand}
          title='Stateful Filtering'
          description='Enable stateful packet filtering for subnet routes'
          loading={loading === 'statefulFiltering'}
          headerSlot={
            <wa-switch
              defaultChecked={settings.statefulFiltering}
              onchange={() => handleToggleSetting('statefulFiltering', settings.statefulFiltering)}
              disabled={loading !== null || !settings.running}
            ></wa-switch>
          }
        />
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
