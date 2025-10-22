import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import type { NavigationItem } from '../../types/navigation';
import { SettingsCard } from '../cards';

export interface CardPageProps {
  /** Page title */
  title: string;

  /** Card items to display */
  items: NavigationItem[];

  /** Optional callback for card actions (e.g., power actions) */
  onAction?: (item: NavigationItem) => Promise<void>;

  /** Whether actions require confirmation */
  requireConfirmation?: boolean;
}

/**
 * Generic card page component for displaying a grid of cards
 * Used for Settings and Power pages
 */
export const CardPage: React.FC<CardPageProps> = ({
  title,
  items,
  onAction,
  requireConfirmation = false,
}) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Helper function to preserve search params in navigation
  const getNavLinkTo = (path: string) => {
    const params = new URLSearchParams(searchParams);
    const queryString = params.toString();
    return queryString ? `${path}?${queryString}` : path;
  };

  const handleCardAction = async (item: NavigationItem) => {
    // If item has a path and no action callback, navigate
    if (item.path && !onAction) {
      navigate(getNavLinkTo(item.path));
      return;
    }

    // If item has an action callback, execute it
    if (onAction) {
      // Show confirmation dialog if required
      if (requireConfirmation && item.confirmMessage) {
        const confirmed = window.confirm(item.confirmMessage);
        if (!confirmed) {
          return;
        }
      }

      setLoading(item.id);
      setMessage(null);

      try {
        await onAction(item);
        setMessage({ type: 'success', text: 'Action completed successfully' });
      } catch (error) {
        setMessage({
          type: 'error',
          text: error instanceof Error ? error.message : 'An error occurred',
        });
      } finally {
        setLoading(null);
      }
    }
  };

  return (
    <div className='wa-stack wa-gap-xl'>
      <h2>{title}</h2>

      {/* Status message */}
      {message && (
        <wa-callout variant={message.type === 'success' ? 'success' : 'danger'}>
          {message.text}
        </wa-callout>
      )}

      {/* Cards grid */}
      <div
        className='wa-grid wa-gap-m'
        style={{ '--min-column-size': '250px' } as React.CSSProperties}
      >
        {items.map(item => (
          <SettingsCard
            key={item.id}
            {...(item.icon ? { icon: item.icon } : {})}
            {...(item.stackedIcon ? { stackedIcon: item.stackedIcon } : {})}
            iconStyle={item.iconStyle}
            {...(item.iconFlip ? { iconFlip: item.iconFlip } : {})}
            title={item.label}
            {...(item.description ? { description: item.description } : {})}
            loading={loading === item.id}
            footerSlot={
              <div
                onClick={() => loading === null && handleCardAction(item)}
                style={{ cursor: loading === null ? 'pointer' : 'not-allowed' }}
                role='button'
                tabIndex={loading === null ? 0 : -1}
                onKeyDown={e => {
                  if (loading === null && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    handleCardAction(item);
                  }
                }}
                aria-label={item.label}
              >
                <wa-button
                  appearance='filled'
                  variant={item.variant || 'brand'}
                  disabled={loading !== null}
                  style={{ width: '100%', pointerEvents: 'none' }}
                >
                  {onAction ? item.label : `Configure ${item.label}`}
                </wa-button>
              </div>
            }
          />
        ))}
      </div>
    </div>
  );
};
