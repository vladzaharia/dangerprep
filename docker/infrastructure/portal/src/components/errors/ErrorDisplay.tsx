import {
  faTriangleExclamation,
  faHouse,
  faArrowRotateRight,
  faFileSlash,
} from '@awesome.me/kit-a765fc5647/icons/duotone/solid';
import type WaPopup from '@awesome.me/webawesome/dist/components/popup/popup.js';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { createIconStyle, ICON_STYLES } from '../../utils/iconStyles';

/**
 * Error display variant types
 */
export type ErrorDisplayVariant = 'full-page' | 'content';

/**
 * Props for ErrorDisplay component
 */
export interface ErrorDisplayProps {
  /** Display variant - full-page or content area */
  variant: ErrorDisplayVariant;
  /** Error object (optional) */
  error?: Error | null;
  /** Custom error title */
  title?: string;
  /** Custom error message */
  message?: string;
  /** Callback when reset/refresh is clicked */
  onReset: () => void;
  /** Whether to show the home button (only for content variant) */
  showHomeButton?: boolean;
  /** Whether this is a 404 error */
  is404?: boolean;
}

/**
 * ErrorDisplay Component
 *
 * Displays error messages in two variants:
 * - full-page: Full-page centered card for catastrophic errors
 * - content: Content area error display with dark danger background
 */
export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  variant,
  error,
  title,
  message,
  onReset,
  showHomeButton = true,
  is404 = false,
}) => {
  const navigate = useNavigate();
  const [popupOpen, setPopupOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [popupElement, setPopupElement] = useState<WaPopup | null>(null);

  // Determine error title and message
  const errorTitle = title || (is404 ? 'Page Not Found' : 'Something Went Wrong');
  const errorMessage =
    message ||
    (is404
      ? "The page you're looking for doesn't exist or has been moved."
      : 'An unexpected error occurred. Please try refreshing the page.');

  // Show error details in development
  const showErrorDetails = !!error;

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

  // Handle mouseout to close popup
  const handleMouseLeave = () => {
    if (popupOpen) {
      setPopupOpen(false);
    }
  };

  const handleCardClick = () => {
    if (showErrorDetails) {
      setPopupOpen(!popupOpen);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showErrorDetails) return;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setPopupOpen(!popupOpen);
    } else if (e.key === 'Escape' && popupOpen) {
      setPopupOpen(false);
    }
  };

  const handleHome = () => {
    navigate('/');
  };

  const handleRefresh = () => {
    onReset();
  };

  // Icon to display
  const errorIcon = is404 ? faFileSlash : faTriangleExclamation;

  if (variant === 'full-page') {
    return (
      <div className='error-display-full-page'>
        <div className='wa-stack wa-gap-s'>
          <div
            ref={cardRef}
            onClick={handleCardClick}
            onKeyDown={handleKeyDown}
            onMouseLeave={handleMouseLeave}
            role={showErrorDetails ? 'button' : undefined}
            tabIndex={showErrorDetails ? 0 : undefined}
            aria-expanded={showErrorDetails ? popupOpen : undefined}
            style={{
              cursor: showErrorDetails ? 'pointer' : undefined,
              position: 'relative',
            }}
          >
            <wa-card appearance='outlined' className='error-card'>
              {/* Header with icon and title */}
              <div slot='header' style={{ width: '100%' }}>
                <div className='wa-flank wa-gap-m wa-align-items-center'>
                  <FontAwesomeIcon
                    icon={errorIcon}
                    size='xl'
                    style={createIconStyle(ICON_STYLES.danger)}
                  />
                  <h1 className='wa-heading-l' style={{ margin: 0 }}>
                    {errorTitle}
                  </h1>
                </div>
              </div>

              {/* Body with error message */}
              <div className='wa-stack wa-gap-m wa-align-items-center'>
                <p style={{ textAlign: 'center', margin: 0, maxWidth: '500px' }}>{errorMessage}</p>
                {showErrorDetails && (
                  <p className='wa-caption-s' style={{ textAlign: 'center', margin: 0 }}>
                    Click card to view error details
                  </p>
                )}
              </div>
            </wa-card>

            {/* Popup for error details */}
            {showErrorDetails && cardRef.current && (
              <wa-popup
                ref={setPopupElement}
                anchor={cardRef.current}
                placement='bottom'
                distance={4}
                active={popupOpen}
                shift
              >
                <div onMouseLeave={handleMouseLeave}>
                  <wa-card appearance='outlined' style={{ width: '100%', maxWidth: '600px' }}>
                    <div className='wa-stack wa-gap-m'>
                      <div className='wa-body-s' style={{ fontWeight: 600 }}>
                        Error Details
                      </div>
                      <div className='wa-stack wa-gap-xs'>
                        <div>
                          <strong>Error:</strong> {error.message}
                        </div>
                        {error.stack && (
                          <pre
                            style={{
                              fontSize: '0.75rem',
                              overflow: 'auto',
                              maxWidth: '100%',
                              padding: 'var(--wa-space-m)',
                              backgroundColor: 'var(--wa-color-neutral-100)',
                              borderRadius: 'var(--wa-border-radius-m)',
                            }}
                          >
                            {error.stack}
                          </pre>
                        )}
                      </div>
                    </div>
                  </wa-card>
                </div>
              </wa-popup>
            )}
          </div>

          {/* Actions below card */}
          <div
            className='wa-cluster wa-gap-m error-display-actions'
            style={{ justifyContent: 'center' }}
          >
            <div
              onClick={handleRefresh}
              style={{ cursor: 'pointer' }}
              role='button'
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleRefresh();
                }
              }}
              aria-label='Refresh Page'
            >
              <wa-button variant='brand' style={{ pointerEvents: 'none' }}>
                <FontAwesomeIcon
                  icon={faArrowRotateRight}
                  style={{ marginRight: 'var(--wa-space-xs)' }}
                />
                Refresh Page
              </wa-button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Content variant
  return (
    <div className='error-display-content'>
      <div className='wa-stack wa-gap-s'>
        <div
          ref={cardRef}
          onClick={handleCardClick}
          onKeyDown={handleKeyDown}
          onMouseLeave={handleMouseLeave}
          role={showErrorDetails ? 'button' : undefined}
          tabIndex={showErrorDetails ? 0 : undefined}
          aria-expanded={showErrorDetails ? popupOpen : undefined}
          style={{
            cursor: showErrorDetails ? 'pointer' : undefined,
            position: 'relative',
          }}
        >
          <wa-card appearance='outlined'>
            {/* Header with icon and title */}
            <div slot='header' style={{ width: '100%' }}>
              <div className='wa-flank wa-gap-m wa-align-items-center'>
                <FontAwesomeIcon
                  icon={errorIcon}
                  size='xl'
                  style={createIconStyle(ICON_STYLES.danger)}
                />
                <h2 className='wa-heading-m' style={{ margin: 0 }}>
                  {errorTitle}
                </h2>
              </div>
            </div>

            {/* Body with error message */}
            <div className='wa-stack wa-gap-m wa-align-items-center'>
              <p style={{ textAlign: 'center', margin: 0, maxWidth: '500px' }}>{errorMessage}</p>
              {showErrorDetails && (
                <p className='wa-caption-s' style={{ textAlign: 'center', margin: 0 }}>
                  Click card to view error details
                </p>
              )}
            </div>
          </wa-card>

          {/* Popup for error details */}
          {showErrorDetails && cardRef.current && (
            <wa-popup
              ref={setPopupElement}
              anchor={cardRef.current}
              placement='bottom'
              distance={4}
              active={popupOpen}
              shift
            >
              <div onMouseLeave={handleMouseLeave}>
                <wa-card appearance='outlined' style={{ width: '100%', maxWidth: '600px' }}>
                  <div className='wa-stack wa-gap-m'>
                    <div className='wa-body-s' style={{ fontWeight: 600 }}>
                      Error Details
                    </div>
                    <div className='wa-stack wa-gap-xs'>
                      <div>
                        <strong>Error:</strong> {error.message}
                      </div>
                      {error.stack && (
                        <pre
                          style={{
                            fontSize: '0.75rem',
                            overflow: 'auto',
                            maxWidth: '100%',
                            padding: 'var(--wa-space-m)',
                            backgroundColor: 'var(--wa-color-neutral-100)',
                            borderRadius: 'var(--wa-border-radius-m)',
                          }}
                        >
                          {error.stack}
                        </pre>
                      )}
                    </div>
                  </div>
                </wa-card>
              </div>
            </wa-popup>
          )}
        </div>

        {/* Actions below card */}
        <div
          className='wa-cluster wa-gap-m error-display-actions'
          style={{ justifyContent: 'center' }}
        >
          <div
            onClick={handleRefresh}
            style={{ cursor: 'pointer' }}
            role='button'
            tabIndex={0}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleRefresh();
              }
            }}
            aria-label='Refresh'
          >
            <wa-button variant='neutral' appearance='outlined' style={{ pointerEvents: 'none' }}>
              <FontAwesomeIcon
                icon={faArrowRotateRight}
                style={{ marginRight: 'var(--wa-space-xs)' }}
              />
              Refresh
            </wa-button>
          </div>
          {showHomeButton && (
            <div
              onClick={handleHome}
              style={{ cursor: 'pointer' }}
              role='button'
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleHome();
                }
              }}
              aria-label='Go Home'
            >
              <wa-button variant='brand' style={{ pointerEvents: 'none' }}>
                <FontAwesomeIcon icon={faHouse} style={{ marginRight: 'var(--wa-space-xs)' }} />
                Go Home
              </wa-button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
