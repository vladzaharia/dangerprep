import { useEffect, useState, useRef, useCallback } from 'react';
import type { WorkerInboundMessage, WorkerOutboundMessage } from '../workers/apiWorker';

export interface ApiWorkerOptions {
  endpoint: string; // API endpoint to poll
  pollInterval?: number; // milliseconds, default: 5000
  queryParams?: Record<string, string>; // Query parameters
  autoStart?: boolean; // auto-start polling on mount, default: true
}

export interface ApiWorkerState<T = any> {
  data: T | null;
  loading: boolean;
  error: string | null;
  lastUpdate: string | null;
  isPolling: boolean;
}

export interface ApiWorkerControls {
  start: () => void;
  stop: () => void;
  refresh: () => void;
  configure: (options: Partial<ApiWorkerOptions>) => void;
}

/**
 * Generic hook to manage API data fetching via Web Worker
 * Provides real-time API updates in the background
 *
 * @example
 * // Fetch network data
 * const network = useApiWorker<NetworkSummary>({
 *   endpoint: '/api/networks',
 *   pollInterval: 5000
 * });
 *
 * @example
 * // Fetch services data
 * const services = useApiWorker<Service[]>({
 *   endpoint: '/api/services',
 *   pollInterval: 10000
 * });
 */
export function useApiWorker<T = any>(
  options: ApiWorkerOptions
): ApiWorkerState<T> & ApiWorkerControls {
  const { endpoint, pollInterval = 5000, queryParams = {}, autoStart = true } = options;

  const [state, setState] = useState<ApiWorkerState<T>>({
    data: null,
    loading: true,
    error: null,
    lastUpdate: null,
    isPolling: false,
  });

  const workerRef = useRef<Worker | null>(null);
  const optionsRef = useRef({ endpoint, pollInterval, queryParams });

  // Update options ref when they change
  useEffect(() => {
    optionsRef.current = { endpoint, pollInterval, queryParams };
  }, [endpoint, pollInterval, queryParams]);

  // Initialize worker
  useEffect(() => {
    // Create worker
    const worker = new Worker(new URL('../workers/apiWorker.ts', import.meta.url), {
      type: 'module',
    });

    workerRef.current = worker;

    // Handle messages from worker
    worker.addEventListener('message', (event: MessageEvent<WorkerOutboundMessage>) => {
      const message = event.data;

      switch (message.type) {
        case 'data-update':
          setState(prev => ({
            ...prev,
            data: message.data,
            loading: false,
            error: null,
            lastUpdate: message.timestamp,
          }));
          break;

        case 'error':
          setState(prev => ({
            ...prev,
            loading: false,
            error: message.error,
            lastUpdate: message.timestamp,
          }));
          break;

        case 'status':
          setState(prev => ({
            ...prev,
            isPolling: message.status === 'started' || message.status === 'polling',
          }));
          break;

        default:
          console.warn('Unknown worker message:', message);
      }
    });

    // Handle worker errors
    worker.addEventListener('error', error => {
      console.error('Worker error:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: error.message || 'Worker error occurred',
      }));
    });

    // Configure worker
    const configMessage: WorkerInboundMessage = {
      type: 'config',
      endpoint: optionsRef.current.endpoint,
      pollInterval: optionsRef.current.pollInterval,
      queryParams: optionsRef.current.queryParams,
    };
    worker.postMessage(configMessage);

    // Auto-start if enabled
    if (autoStart) {
      const startMessage: WorkerInboundMessage = { type: 'start' };
      worker.postMessage(startMessage);
    }

    // Cleanup on unmount
    return () => {
      const stopMessage: WorkerInboundMessage = { type: 'stop' };
      worker.postMessage(stopMessage);
      worker.terminate();
      workerRef.current = null;
    };
  }, []); // Only run once on mount

  // Update worker config when options change
  useEffect(() => {
    if (workerRef.current) {
      const configMessage: WorkerInboundMessage = {
        type: 'config',
        endpoint: optionsRef.current.endpoint,
        pollInterval: optionsRef.current.pollInterval,
        queryParams: optionsRef.current.queryParams,
      };
      workerRef.current.postMessage(configMessage);
    }
  }, [endpoint, pollInterval, queryParams]);

  // Control functions
  const start = useCallback(() => {
    if (workerRef.current) {
      const message: WorkerInboundMessage = { type: 'start' };
      workerRef.current.postMessage(message);
    }
  }, []);

  const stop = useCallback(() => {
    if (workerRef.current) {
      const message: WorkerInboundMessage = { type: 'stop' };
      workerRef.current.postMessage(message);
    }
  }, []);

  const refresh = useCallback(() => {
    if (workerRef.current) {
      const message: WorkerInboundMessage = { type: 'refresh' };
      workerRef.current.postMessage(message);
    }
  }, []);

  const configure = useCallback((newOptions: Partial<ApiWorkerOptions>) => {
    if (workerRef.current) {
      const message: WorkerInboundMessage = {
        type: 'config',
        ...(newOptions.endpoint !== undefined && { endpoint: newOptions.endpoint }),
        ...(newOptions.pollInterval !== undefined && { pollInterval: newOptions.pollInterval }),
        ...(newOptions.queryParams !== undefined && { queryParams: newOptions.queryParams }),
      };
      workerRef.current.postMessage(message);
    }
  }, []);

  return {
    ...state,
    start,
    stop,
    refresh,
    configure,
  };
}
