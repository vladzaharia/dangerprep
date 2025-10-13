import { Suspense } from 'react';
import {
  useNetworkSummary,
  useHotspotInterface,
  useInternetInterface,
  useTailscaleInterface,
  useNetworkSummaryWithLoading,
  type NetworkInterface,
  type ConnectedClient
} from '../hooks/useNetworks';
import {
  useNetworkWorker,
  useHotspotFromWorker,
  useInternetFromWorker,
  useTailscaleFromWorker
} from '../hooks/useNetworkWorker';

/**
 * Component to display connected client details
 */
function ConnectedClientCard({ client }: { client: ConnectedClient }) {
  return (
    <div className="border border-gray-200 rounded p-2 bg-gray-50">
      <div className="text-xs space-y-1">
        <div className="font-mono">
          <strong>MAC:</strong> {client.macAddress}
        </div>
        {client.ipAddress && (
          <div>
            <strong>IP:</strong> {client.ipAddress}
          </div>
        )}
        {client.hostname && (
          <div>
            <strong>Hostname:</strong> {client.hostname}
          </div>
        )}
        {client.signalStrength && (
          <div>
            <strong>Signal:</strong> {client.signalStrength} dBm
          </div>
        )}
        <div className="flex gap-2">
          {client.txRate && (
            <div>
              <strong>TX:</strong> {client.txRate}
            </div>
          )}
          {client.rxRate && (
            <div>
              <strong>RX:</strong> {client.rxRate}
            </div>
          )}
        </div>
        {client.connectedTime && (
          <div className="text-gray-500">
            <strong>Last seen:</strong> {client.connectedTime}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Loading skeleton for network summary section
 */
function NetworkSummarySkeleton() {
  return (
    <div className="space-y-4">
      {/* Network Summary Card Skeleton */}
      <div className="bg-blue-50 p-4 rounded-lg">
        <wa-skeleton effect="sheen" style={{ width: '180px', height: '28px', marginBottom: '8px' }}></wa-skeleton>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <wa-skeleton effect="sheen" style={{ width: '120px', height: '16px' }}></wa-skeleton>
          </div>
          <div>
            <wa-skeleton effect="sheen" style={{ width: '100px', height: '16px' }}></wa-skeleton>
          </div>
          <div>
            <wa-skeleton effect="sheen" style={{ width: '110px', height: '16px' }}></wa-skeleton>
          </div>
          <div>
            <wa-skeleton effect="sheen" style={{ width: '130px', height: '16px' }}></wa-skeleton>
          </div>
        </div>
      </div>

      {/* Network Interface Cards Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="space-y-3">
              {/* Interface header with icon and name */}
              <div className="flex items-center space-x-3">
                <wa-skeleton effect="sheen" style={{ width: '24px', height: '24px', borderRadius: '4px' }}></wa-skeleton>
                <wa-skeleton effect="sheen" style={{ width: `${80 + (index * 20)}px`, height: '20px' }}></wa-skeleton>
              </div>

              {/* Interface details */}
              <div className="space-y-2">
                <wa-skeleton effect="sheen" style={{ width: '90%', height: '16px' }}></wa-skeleton>
                <wa-skeleton effect="sheen" style={{ width: '75%', height: '16px' }}></wa-skeleton>
                <wa-skeleton effect="sheen" style={{ width: '85%', height: '16px' }}></wa-skeleton>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Loading skeleton for special network interfaces
 */
function SpecialNetworkInterfacesSkeleton() {
  return (
    <div className="space-y-4">
      {/* Special interfaces section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="space-y-3">
              {/* Interface header */}
              <div className="flex items-center space-x-3">
                <wa-skeleton effect="sheen" style={{ width: '24px', height: '24px', borderRadius: '4px' }}></wa-skeleton>
                <wa-skeleton effect="sheen" style={{ width: `${100 + (index * 30)}px`, height: '20px' }}></wa-skeleton>
              </div>

              {/* Interface details */}
              <div className="space-y-2">
                <wa-skeleton effect="sheen" style={{ width: '95%', height: '16px' }}></wa-skeleton>
                <wa-skeleton effect="sheen" style={{ width: '80%', height: '16px' }}></wa-skeleton>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Component to display network interface information
 */
function NetworkInterfaceCard({ interface: networkInterface }: { interface: NetworkInterface }) {
  const getStatusColor = (state: string) => {
    switch (state) {
      case 'up': return 'text-green-600';
      case 'down': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'ethernet': return '🔌';
      case 'wifi': return '📶';
      case 'hotspot': return '📡';
      case 'tailscale': return '🔗';
      default: return '🌐';
    }
  };

  return (
    <div className="border rounded-lg p-4 bg-white shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold flex items-center gap-2">
          <span>{getTypeIcon(networkInterface.type)}</span>
          {networkInterface.name}
        </h3>
        <span className={`text-sm font-medium ${getStatusColor(networkInterface.state)}`}>
          {networkInterface.state.toUpperCase()}
        </span>
      </div>
      
      <div className="text-sm text-gray-600 space-y-1">
        <div><strong>Type:</strong> {networkInterface.type}</div>
        
        {networkInterface.ipAddress && (
          <div><strong>IP Address:</strong> {networkInterface.ipAddress}</div>
        )}
        
        {networkInterface.gateway && (
          <div><strong>Gateway:</strong> {networkInterface.gateway}</div>
        )}
        
        {networkInterface.netmask && (
          <div><strong>Netmask:</strong> {networkInterface.netmask}</div>
        )}
        
        {networkInterface.macAddress && (
          <div><strong>MAC Address:</strong> {networkInterface.macAddress}</div>
        )}

        {/* Type-specific information */}
        {networkInterface.type === 'ethernet' && 'speed' in networkInterface && networkInterface.speed && (
          <div><strong>Speed:</strong> {networkInterface.speed}</div>
        )}
        
        {networkInterface.type === 'wifi' && 'ssid' in networkInterface && networkInterface.ssid && (
          <div><strong>SSID:</strong> {networkInterface.ssid}</div>
        )}
        
        {networkInterface.type === 'hotspot' && 'ssid' in networkInterface && (
          <>
            <div><strong>SSID:</strong> {networkInterface.ssid}</div>
            {'connectedClients' in networkInterface && networkInterface.connectedClients !== undefined && (
              <div><strong>Connected Clients:</strong> {networkInterface.connectedClients}</div>
            )}
          </>
        )}

        {networkInterface.type === 'wifi' && 'mode' in networkInterface && networkInterface.mode === 'ap' && (
          <>
            {'ssid' in networkInterface && networkInterface.ssid && (
              <div><strong>SSID:</strong> {networkInterface.ssid}</div>
            )}
            {'connectedClientsCount' in networkInterface && networkInterface.connectedClientsCount !== undefined && (
              <div><strong>Connected Clients:</strong> {networkInterface.connectedClientsCount}</div>
            )}
            {'connectedClientsDetails' in networkInterface && networkInterface.connectedClientsDetails && networkInterface.connectedClientsDetails.length > 0 && (
              <div className="mt-3">
                <strong className="block mb-2">Client Details:</strong>
                <div className="space-y-2">
                  {networkInterface.connectedClientsDetails.map((client, index) => (
                    <ConnectedClientCard key={client.macAddress || index} client={client} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        
        {networkInterface.type === 'tailscale' && 'status' in networkInterface && (
          <>
            <div><strong>Status:</strong> {networkInterface.status}</div>
            {'tailnetName' in networkInterface && networkInterface.tailnetName && (
              <div><strong>Tailnet:</strong> {networkInterface.tailnetName}</div>
            )}
            {'peers' in networkInterface && networkInterface.peers && (
              <div><strong>Peers:</strong> {networkInterface.peers.length}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Component using React 19 Suspense for network summary
 */
function NetworkSummaryWithSuspense() {
  const summary = useNetworkSummary();
  
  return (
    <div className="space-y-4">
      <div className="bg-blue-50 p-4 rounded-lg">
        <h2 className="text-lg font-semibold mb-2">Network Summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <strong>Total Interfaces:</strong> {summary.totalInterfaces}
          </div>
          <div>
            <strong>Internet:</strong> {summary.internetInterface || 'None'}
          </div>
          <div>
            <strong>Hotspot:</strong> {summary.hotspotInterface || 'None'}
          </div>
          <div>
            <strong>Tailscale:</strong> {summary.tailscaleInterface || 'None'}
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {summary.interfaces.map((networkInterface) => (
          <NetworkInterfaceCard 
            key={networkInterface.name} 
            interface={networkInterface} 
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Component using traditional loading states (fallback for non-Suspense usage)
 */
function NetworkSummaryWithLoading() {
  const { summary, loading, error, refresh } = useNetworkSummaryWithLoading();

  if (loading) {
    return <NetworkSummarySkeleton />;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="text-red-800 font-semibold">Error Loading Network Information</h3>
        <p className="text-red-600 text-sm mt-1">{error}</p>
        <button 
          onClick={refresh}
          className="mt-2 px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="text-gray-600 p-4">No network information available.</div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 p-4 rounded-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Network Summary</h2>
          <button 
            onClick={refresh}
            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            Refresh
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-2">
          <div>
            <strong>Total Interfaces:</strong> {summary.totalInterfaces}
          </div>
          <div>
            <strong>Internet:</strong> {summary.internetInterface || 'None'}
          </div>
          <div>
            <strong>Hotspot:</strong> {summary.hotspotInterface || 'None'}
          </div>
          <div>
            <strong>Tailscale:</strong> {summary.tailscaleInterface || 'None'}
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {summary.interfaces.map((networkInterface) => (
          <NetworkInterfaceCard 
            key={networkInterface.name} 
            interface={networkInterface} 
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Component showing special network interfaces
 */
function SpecialNetworkInterfaces() {
  const hotspot = useHotspotInterface();
  const internet = useInternetInterface();
  const tailscale = useTailscaleInterface();

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Special Network Interfaces</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded-lg p-4">
          <h3 className="font-semibold text-orange-600 mb-2">📡 Hotspot</h3>
          {hotspot ? (
            <NetworkInterfaceCard interface={hotspot} />
          ) : (
            <div className="text-gray-500 text-sm">No hotspot interface found</div>
          )}
        </div>
        
        <div className="border rounded-lg p-4">
          <h3 className="font-semibold text-green-600 mb-2">🌐 Internet</h3>
          {internet ? (
            <NetworkInterfaceCard interface={internet} />
          ) : (
            <div className="text-gray-500 text-sm">No internet interface found</div>
          )}
        </div>
        
        <div className="border rounded-lg p-4">
          <h3 className="font-semibold text-blue-600 mb-2">🔗 Tailscale</h3>
          {tailscale ? (
            <NetworkInterfaceCard interface={tailscale} />
          ) : (
            <div className="text-gray-500 text-sm">No Tailscale interface found</div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Network status component with real-time updates via Web Worker
 */
export function NetworkStatusWithWorker({
  pollInterval = 5000
}: {
  pollInterval?: number;
}) {
  const worker = useNetworkWorker({ pollInterval, autoStart: true });
  const hotspot = useHotspotFromWorker(worker.data);
  const internet = useInternetFromWorker(worker.data);
  const tailscale = useTailscaleFromWorker(worker.data);

  if (worker.loading && !worker.data) {
    return (
      <div className="space-y-6">
        <NetworkSummarySkeleton />
        <SpecialNetworkInterfacesSkeleton />
      </div>
    );
  }

  if (worker.error && !worker.data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="text-red-800 font-semibold mb-2">Error Loading Network Data</h3>
        <p className="text-red-600 text-sm">{worker.error}</p>
        <button
          onClick={worker.refresh}
          className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!worker.data) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Real-time indicator */}
      <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${worker.isPolling ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
          <span className="text-sm text-green-800">
            {worker.isPolling ? 'Live Updates Active' : 'Updates Paused'}
          </span>
          {worker.lastUpdate && (
            <span className="text-xs text-green-600">
              Last update: {new Date(worker.lastUpdate).toLocaleTimeString()}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={worker.refresh}
            className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
          >
            Refresh Now
          </button>
          {worker.isPolling ? (
            <button
              onClick={worker.stop}
              className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
            >
              Pause
            </button>
          ) : (
            <button
              onClick={worker.start}
              className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            >
              Resume
            </button>
          )}
        </div>
      </div>

      {/* Network Summary */}
      <div className="bg-blue-50 p-4 rounded-lg">
        <h2 className="text-lg font-semibold mb-2">Network Summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <strong>Total Interfaces:</strong> {worker.data.totalInterfaces}
          </div>
          <div>
            <strong>Internet:</strong> {worker.data.internetInterface || 'None'}
          </div>
          <div>
            <strong>Hotspot:</strong> {worker.data.hotspotInterface || 'None'}
          </div>
          <div>
            <strong>Tailscale:</strong> {worker.data.tailscaleInterface || 'None'}
          </div>
        </div>
      </div>

      {/* Special Interfaces */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded-lg p-4">
          <h3 className="font-semibold text-orange-600 mb-2">📡 Hotspot</h3>
          {hotspot ? (
            <NetworkInterfaceCard interface={hotspot} />
          ) : (
            <div className="text-gray-500 text-sm">No hotspot interface found</div>
          )}
        </div>

        <div className="border rounded-lg p-4">
          <h3 className="font-semibold text-green-600 mb-2">🌐 Internet</h3>
          {internet ? (
            <NetworkInterfaceCard interface={internet} />
          ) : (
            <div className="text-gray-500 text-sm">No internet interface found</div>
          )}
        </div>

        <div className="border rounded-lg p-4">
          <h3 className="font-semibold text-blue-600 mb-2">🔗 Tailscale</h3>
          {tailscale ? (
            <NetworkInterfaceCard interface={tailscale} />
          ) : (
            <div className="text-gray-500 text-sm">No Tailscale interface found</div>
          )}
        </div>
      </div>

      {/* All Interfaces */}
      <div>
        <h2 className="text-lg font-semibold mb-3">All Network Interfaces</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {worker.data.interfaces.map((networkInterface) => (
            <NetworkInterfaceCard
              key={networkInterface.name}
              interface={networkInterface}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Main NetworkStatus component with Suspense support
 */
export function NetworkStatus({
  useSuspense = true,
  useWorker = false,
  pollInterval = 5000
}: {
  useSuspense?: boolean;
  useWorker?: boolean;
  pollInterval?: number;
}) {
  // Use web worker for real-time updates
  if (useWorker) {
    return <NetworkStatusWithWorker pollInterval={pollInterval} />;
  }

  // Use Suspense-based approach
  if (useSuspense) {
    return (
      <div className="space-y-6">
        <Suspense fallback={<NetworkSummarySkeleton />}>
          <NetworkSummaryWithSuspense />
        </Suspense>

        <Suspense fallback={<SpecialNetworkInterfacesSkeleton />}>
          <SpecialNetworkInterfaces />
        </Suspense>
      </div>
    );
  }

  // Use traditional loading states
  return (
    <div className="space-y-6">
      <NetworkSummaryWithLoading />
      <Suspense fallback={<SpecialNetworkInterfacesSkeleton />}>
        <SpecialNetworkInterfaces />
      </Suspense>
    </div>
  );
}

export default NetworkStatus;
