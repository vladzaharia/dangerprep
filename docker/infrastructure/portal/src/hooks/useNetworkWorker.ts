import { useMemo } from 'react';
import { useApiWorker, type ApiWorkerOptions } from './useApiWorker';
import type { NetworkSummary, NetworkInterface } from './useNetworks';

export interface NetworkWorkerOptions {
  pollInterval?: number; // milliseconds, default: 5000
  autoStart?: boolean; // auto-start polling on mount, default: true
}

/**
 * Hook to manage network data fetching via Web Worker
 * Provides real-time network updates in the background
 *
 * This is a specialized wrapper around useApiWorker for network data
 *
 * @example
 * const network = useNetworkWorker({ pollInterval: 5000 });
 * const hotspot = useHotspotFromWorker(network.data);
 */
export function useNetworkWorker(options: NetworkWorkerOptions = {}) {
  const {
    pollInterval = 5000,
    autoStart = true,
  } = options;

  const apiOptions: ApiWorkerOptions = useMemo(() => ({
    endpoint: '/api/networks',
    pollInterval,
    queryParams: {},
    autoStart,
  }), [pollInterval, autoStart]);

  return useApiWorker<NetworkSummary>(apiOptions);
}

/**
 * Hook to get specific interface from worker data
 */
export function useNetworkInterfaceFromWorker(
  workerData: NetworkSummary | null,
  interfaceName: string
): NetworkInterface | null {
  return useMemo(() => {
    if (!workerData) return null;
    return workerData.interfaces.find((iface) => iface.name === interfaceName) || null;
  }, [workerData, interfaceName]);
}

/**
 * Hook to get hotspot interface from worker data
 */
export function useHotspotFromWorker(workerData: NetworkSummary | null): NetworkInterface | null {
  return useMemo(() => {
    if (!workerData) return null;
    return workerData.interfaces.find((iface) => iface.purpose === 'wlan') || null;
  }, [workerData]);
}

/**
 * Hook to get internet interface from worker data
 */
export function useInternetFromWorker(workerData: NetworkSummary | null): NetworkInterface | null {
  return useMemo(() => {
    if (!workerData) return null;
    return workerData.interfaces.find((iface) => iface.purpose === 'wan') || null;
  }, [workerData]);
}

/**
 * Hook to get Tailscale interface from worker data
 */
export function useTailscaleFromWorker(workerData: NetworkSummary | null): NetworkInterface | null {
  return useMemo(() => {
    if (!workerData) return null;
    return workerData.interfaces.find((iface) => iface.type === 'tailscale') || null;
  }, [workerData]);
}
