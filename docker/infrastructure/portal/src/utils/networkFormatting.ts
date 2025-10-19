/**
 * Utility functions for formatting network data for display
 */

/**
 * Format bytes to human-readable format
 */
export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || bytes === null) return 'N/A';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Format uptime in seconds to human-readable format
 */
export function formatUptime(seconds: number | undefined): string {
  if (seconds === undefined || seconds === null) return 'N/A';

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

/**
 * Format latency in milliseconds
 */
export function formatLatency(ms: number | undefined): string {
  if (ms === undefined || ms === null) return 'N/A';
  return `${ms.toFixed(2)}ms`;
}

/**
 * Format packet loss percentage
 */
export function formatPacketLoss(percentage: number | undefined): string {
  if (percentage === undefined || percentage === null) return 'N/A';
  return `${percentage.toFixed(2)}%`;
}

/**
 * Format number with commas
 */
export function formatNumber(num: number | undefined): string {
  if (num === undefined || num === null) return 'N/A';
  return num.toLocaleString();
}

/**
 * Format boolean as Yes/No
 */
export function formatBoolean(value: boolean | undefined): string {
  if (value === undefined || value === null) return 'N/A';
  return value ? 'Yes' : 'No';
}

/**
 * Format offload features object
 */
export function formatOffloadFeatures(
  features:
    | {
        tso?: boolean;
        gso?: boolean;
        gro?: boolean;
        lro?: boolean;
        rxvlan?: boolean;
        txvlan?: boolean;
      }
    | undefined
): string {
  if (!features) return 'N/A';

  const enabled = Object.entries(features)
    .filter(([, value]) => value)
    .map(([key]) => key.toUpperCase());

  return enabled.length > 0 ? enabled.join(', ') : 'None';
}

/**
 * Format interface flags
 */
export function formatInterfaceFlags(
  flags:
    | {
        up?: boolean;
        broadcast?: boolean;
        running?: boolean;
        multicast?: boolean;
        loopback?: boolean;
        pointToPoint?: boolean;
        noarp?: boolean;
        promisc?: boolean;
        allmulti?: boolean;
        master?: boolean;
        slave?: boolean;
        debug?: boolean;
        dormant?: boolean;
        simplex?: boolean;
        lower_up?: boolean;
        lower_down?: boolean;
      }
    | undefined
): string {
  if (!flags) return 'N/A';

  const enabled = Object.entries(flags)
    .filter(([, value]) => value)
    .map(([key]) => {
      // Convert camelCase to UPPERCASE with underscores
      return key
        .replace(/([A-Z])/g, '_$1')
        .toUpperCase()
        .replace(/^_/, '');
    });

  return enabled.length > 0 ? enabled.join(', ') : 'None';
}
