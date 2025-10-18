import React, { Component } from 'react';
import type { ReactNode } from 'react';

import { ErrorDisplay } from './ErrorDisplay';
import type { ErrorDisplayVariant } from './ErrorDisplay';

/**
 * Props for ErrorBoundary component
 */
export interface ErrorBoundaryProps {
  /** Child components to wrap */
  children: ReactNode;
  /** Display variant for error UI */
  variant?: ErrorDisplayVariant;
  /** Custom fallback component (optional) */
  fallback?: ReactNode;
  /** Callback when error is reset */
  onReset?: () => void;
  /** Custom error title */
  title?: string;
  /** Custom error message */
  message?: string;
}

/**
 * State for ErrorBoundary component
 */
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary Component
 *
 * React Error Boundary implementation following React 19 best practices.
 * Catches errors in child components and displays a fallback UI.
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary variant="full-page">
 *   <App />
 * </ErrorBoundary>
 * ```
 *
 * @example
 * // Full-page error boundary
 * <ErrorBoundary variant="full-page">
 *   <App />
 * </ErrorBoundary>
 *
 * @example
 * // Content area error boundary
 * <ErrorBoundary variant="content">
 *   <Routes>
 *     <Route path="/" element={<HomePage />} />
 *   </Routes>
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  /**
   * Update state when an error is caught
   * This is called during the render phase, so side effects are not allowed
   */
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  /**
   * Log error information
   * This is called during the commit phase, so side effects are allowed
   */
  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    // In production, you could send this to an error reporting service
    // Example: logErrorToService(error, errorInfo);
  }

  /**
   * Reset error state
   */
  resetError = (): void => {
    this.setState({
      hasError: false,
      error: null,
    });

    // Call custom reset handler if provided
    if (this.props.onReset) {
      this.props.onReset();
    }

    // Reload the page to ensure clean state
    window.location.reload();
  };

  override render(): ReactNode {
    const { hasError, error } = this.state;
    const { children, variant = 'content', fallback, title, message } = this.props;

    if (hasError) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback;
      }

      // Build ErrorDisplay props conditionally
      const errorDisplayProps: {
        variant: ErrorDisplayVariant;
        error: Error | null;
        onReset: () => void;
        showHomeButton: boolean;
        title?: string;
        message?: string;
      } = {
        variant,
        error,
        onReset: this.resetError,
        showHomeButton: variant === 'content',
      };

      // Only add title and message if they're defined
      if (title !== undefined) {
        errorDisplayProps.title = title;
      }
      if (message !== undefined) {
        errorDisplayProps.message = message;
      }

      // Otherwise use ErrorDisplay component
      return <ErrorDisplay {...errorDisplayProps} />;
    }

    return children;
  }
}
