import React from 'react';

import { ErrorDisplay } from '../components/errors';

/**
 * NotFoundPage Component
 *
 * Displays a 404 error page when a route is not found.
 * Uses the ErrorDisplay component with content variant for consistent styling.
 */
export const NotFoundPage: React.FC = () => {
  const handleReset = () => {
    // For 404 pages, refresh doesn't make much sense, but we provide it anyway
    window.location.reload();
  };

  return (
    <ErrorDisplay
      variant='content'
      title='Page Not Found'
      message="The page you're looking for doesn't exist or has been moved."
      onReset={handleReset}
      showHomeButton={true}
      is404={true}
    />
  );
};
