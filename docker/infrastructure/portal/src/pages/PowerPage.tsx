import {
  faRotate,
  faPowerOff,
  faArrowsRotate,
  faDesktop,
  faWindowRestore,
} from '@awesome.me/kit-a765fc5647/icons/duotone/solid';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import React, { useState } from 'react';

import { SettingsCard } from '../components/cards';
import { ICON_STYLES } from '../utils/iconStyles';

interface PowerAction {
  id: string;
  label: string;
  icon?: IconDefinition;
  stackedIcon?: { base: IconDefinition; overlay: IconDefinition };
  endpoint: string;
  confirmMessage: string;
  variant: 'brand' | 'danger' | 'warning' | 'success';
}

const powerActions: PowerAction[] = [
  {
    id: 'kiosk-restart',
    label: 'Restart Browser',
    stackedIcon: {
      base: faWindowRestore,
      overlay: faRotate,
    },
    endpoint: '/api/power/kiosk/restart',
    confirmMessage: 'Are you sure you want to restart the kiosk browser?',
    variant: 'brand',
  },
  {
    id: 'reboot',
    label: 'Reboot System',
    icon: faArrowsRotate,
    endpoint: '/api/power/reboot',
    confirmMessage:
      'Are you sure you want to reboot the system? This will restart the entire device.',
    variant: 'warning',
  },
  {
    id: 'shutdown',
    label: 'Shutdown System',
    icon: faPowerOff,
    endpoint: '/api/power/shutdown',
    confirmMessage:
      'Are you sure you want to shutdown the system? You will need to manually power it back on.',
    variant: 'danger',
  },
  {
    id: 'desktop',
    label: 'Exit to Desktop',
    icon: faDesktop,
    endpoint: '/api/power/desktop',
    confirmMessage: 'Are you sure you want to exit kiosk mode and switch to desktop?',
    variant: 'success',
  },
];

export const PowerPage: React.FC = () => {
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handlePowerAction = async (action: PowerAction) => {
    // Show confirmation dialog
    const confirmed = window.confirm(action.confirmMessage);
    if (!confirmed) {
      return;
    }

    setLoading(action.id);
    setMessage(null);

    try {
      const response = await fetch(action.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (data.success) {
        setMessage({ type: 'success', text: data.message || 'Action completed successfully' });
      } else {
        setMessage({ type: 'error', text: data.message || 'Action failed' });
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'An error occurred',
      });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className='wa-stack wa-gap-xl'>
      <h2>Power Management</h2>

      {/* Status message */}
      {message && (
        <wa-callout variant={message.type === 'success' ? 'success' : 'danger'}>
          {message.text}
        </wa-callout>
      )}

      {/* Power action buttons grid */}
      <div
        className='wa-grid wa-gap-m'
        style={{ '--min-column-size': '250px' } as React.CSSProperties}
      >
        {powerActions.map(action => (
          <SettingsCard
            key={action.id}
            {...(action.icon ? { icon: action.icon } : {})}
            {...(action.stackedIcon ? { stackedIcon: action.stackedIcon } : {})}
            iconStyle={ICON_STYLES[action.variant]}
            title={action.label}
            description={action.confirmMessage}
            loading={loading === action.id}
            footerSlot={
              <div
                onClick={() => loading === null && handlePowerAction(action)}
                style={{ cursor: loading === null ? 'pointer' : 'not-allowed' }}
                role='button'
                tabIndex={loading === null ? 0 : -1}
                onKeyDown={e => {
                  if (loading === null && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    handlePowerAction(action);
                  }
                }}
                aria-label={action.label}
              >
                <wa-button
                  appearance='filled'
                  variant={action.variant}
                  disabled={loading !== null}
                  style={{ width: '100%', pointerEvents: 'none' }}
                >
                  {action.label}
                </wa-button>
              </div>
            }
          />
        ))}
      </div>
    </div>
  );
};
