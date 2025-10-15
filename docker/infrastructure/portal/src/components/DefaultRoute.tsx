import React from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';

/**
 * DefaultRoute component that intelligently redirects based on kiosk mode
 *
 * - In kiosk mode (?kiosk): redirects to /qr (QR code display)
 * - In non-kiosk mode: redirects to /services (service listing)
 *
 * Preserves all search parameters in the redirect to maintain kiosk mode state
 */
export const DefaultRoute: React.FC = () => {
  const [searchParams] = useSearchParams();
  const isKioskMode = searchParams.has('kiosk');

  // Preserve search params in redirect
  const queryString = searchParams.toString();
  const searchParamString = queryString ? `?${queryString}` : '';

  // Redirect based on kiosk mode
  const redirectPath = isKioskMode ? `/qr${searchParamString}` : `/services${searchParamString}`;

  return <Navigate to={redirectPath} replace />;
};
