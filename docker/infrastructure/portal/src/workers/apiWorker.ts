/**
 * Generic Web Worker for background API data fetching
 * This worker polls any API endpoint at regular intervals and posts updates to the main thread
 */

// Types for worker messages
export interface WorkerConfigMessage {
  type: 'config';
  pollInterval?: number; // milliseconds
  endpoint?: string; // API endpoint to poll
  queryParams?: Record<string, string>; // Query parameters
}

export interface WorkerStartMessage {
  type: 'start';
}

export interface WorkerStopMessage {
  type: 'stop';
}

export interface WorkerRefreshMessage {
  type: 'refresh';
}

export type WorkerInboundMessage = 
  | WorkerConfigMessage 
  | WorkerStartMessage 
  | WorkerStopMessage 
  | WorkerRefreshMessage;

export interface DataUpdateMessage {
  type: 'data-update';
  data: any;
  timestamp: string;
  endpoint: string;
}

export interface WorkerErrorMessage {
  type: 'error';
  error: string;
  timestamp: string;
  endpoint: string;
}

export interface WorkerStatusMessage {
  type: 'status';
  status: 'started' | 'stopped' | 'polling';
  timestamp: string;
}

export type WorkerOutboundMessage = 
  | DataUpdateMessage 
  | WorkerErrorMessage 
  | WorkerStatusMessage;

// Worker state
let pollInterval = 5000; // Default: 5 seconds
let endpoint = '/api/networks'; // Default endpoint
let queryParams: Record<string, string> = {};
let isRunning = false;
let intervalId: number | null = null;

/**
 * Build URL with query parameters
 */
function buildUrl(baseEndpoint: string, params: Record<string, string>): string {
  const url = new URL(baseEndpoint, self.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });
  return url.toString();
}

/**
 * Fetch data from API endpoint
 */
async function fetchApiData(): Promise<any> {
  const url = buildUrl(endpoint, queryParams);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();

  // Handle both wrapped and unwrapped responses
  if (result.success !== undefined) {
    if (!result.success) {
      throw new Error(result.error || 'API request failed');
    }
    return result.data;
  }

  return result;
}

/**
 * Poll API data and post to main thread
 */
async function pollApiData() {
  try {
    const data = await fetchApiData();
    
    const message: DataUpdateMessage = {
      type: 'data-update',
      data,
      timestamp: new Date().toISOString(),
      endpoint,
    };
    
    self.postMessage(message);
  } catch (error) {
    const errorMessage: WorkerErrorMessage = {
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
      endpoint,
    };
    
    self.postMessage(errorMessage);
  }
}

/**
 * Start polling
 */
function startPolling() {
  if (isRunning) {
    return;
  }

  isRunning = true;
  
  const statusMessage: WorkerStatusMessage = {
    type: 'status',
    status: 'started',
    timestamp: new Date().toISOString(),
  };
  self.postMessage(statusMessage);

  // Fetch immediately
  pollApiData();

  // Then poll at intervals
  intervalId = self.setInterval(() => {
    pollApiData();
  }, pollInterval) as unknown as number;
}

/**
 * Stop polling
 */
function stopPolling() {
  if (!isRunning) {
    return;
  }

  isRunning = false;

  if (intervalId !== null) {
    self.clearInterval(intervalId);
    intervalId = null;
  }

  const statusMessage: WorkerStatusMessage = {
    type: 'status',
    status: 'stopped',
    timestamp: new Date().toISOString(),
  };
  self.postMessage(statusMessage);
}

/**
 * Handle messages from main thread
 */
self.addEventListener('message', (event: MessageEvent<WorkerInboundMessage>) => {
  const message = event.data;

  switch (message.type) {
    case 'config':
      if (message.pollInterval !== undefined) {
        pollInterval = message.pollInterval;
      }
      if (message.endpoint !== undefined) {
        endpoint = message.endpoint;
      }
      if (message.queryParams !== undefined) {
        queryParams = message.queryParams;
      }
      
      // Restart polling if running to apply new config
      if (isRunning) {
        stopPolling();
        startPolling();
      }
      break;

    case 'start':
      startPolling();
      break;

    case 'stop':
      stopPolling();
      break;

    case 'refresh':
      // Immediate refresh
      if (isRunning) {
        pollApiData();
      }
      break;

    default:
      console.warn('Unknown message type:', message);
  }
});

// Export empty object to make this a module
export {};

