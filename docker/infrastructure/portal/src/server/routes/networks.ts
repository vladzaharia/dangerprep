import { Hono } from 'hono';
import { NetworkService } from '../services/NetworkService';

// Initialize service
const networkService = new NetworkService();

// Create router
const networks = new Hono();

/**
 * GET /api/networks
 * Get summary of all network interfaces
 * Query params:
 *   - detailed: Include detailed information for all interfaces (default: false)
 */
networks.get('/', async (c) => {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[NetworksRoute:${requestId}] GET /api/networks - Request started`);

  try {
    const detailed = c.req.query('detailed') === 'true';
    console.log(`[NetworksRoute:${requestId}] Query parameters: detailed=${detailed}`);

    if (detailed) {
      console.log(`[NetworksRoute:${requestId}] Fetching detailed interface information`);
      // Return detailed information for all interfaces
      const interfaces = await networkService.getAllInterfaces();
      console.log(`[NetworksRoute:${requestId}] Retrieved ${interfaces.length} interfaces`);

      return c.json({
        success: true,
        data: {
          interfaces,
          totalInterfaces: interfaces.length,
        },
        metadata: {
          timestamp: new Date().toISOString(),
          detailed: true,
        },
      });
    } else {
      console.log(`[NetworksRoute:${requestId}] Fetching network summary`);
      // Return network summary with special interface mappings
      const summary = await networkService.getNetworkSummary();
      console.log(`[NetworksRoute:${requestId}] Retrieved network summary with ${summary.totalInterfaces} interfaces`);

      return c.json({
        success: true,
        data: summary,
        metadata: {
          timestamp: new Date().toISOString(),
          detailed: false,
        },
      });
    }
  } catch (error) {
    console.error(`[NetworksRoute:${requestId}] Failed to get network interfaces:`, error);
    console.error(`[NetworksRoute:${requestId}] Error details:`, {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    return c.json(
      {
        success: false,
        error: 'Failed to retrieve network interfaces',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * Create default interface data for keywords when actual interface not found
 */
function createDefaultInterfaceData(keyword: string) {
  const baseInterface = {
    name: `${keyword}-default`,
    state: 'down' as const,
    ipAddress: undefined,
    gateway: undefined,
    netmask: undefined,
    dnsServers: undefined,
    macAddress: undefined,
    mtu: undefined,
  };

  switch (keyword) {
    case 'hotspot':
      return {
        ...baseInterface,
        type: 'wifi' as const,
        purpose: 'wlan' as const,
        ssid: process.env.WIFI_SSID || 'DangerPrep',
        security: 'WPA2',
        channel: 6,
        frequency: '2.4GHz',
        connectedClients: 0,
        mode: 'ap' as const,
      };

    case 'internet':
      return {
        ...baseInterface,
        type: 'ethernet' as const,
        purpose: 'wan' as const,
      };

    case 'tailscale':
      return {
        ...baseInterface,
        type: 'tailscale' as const,
        purpose: 'wan' as const,
        status: 'stopped',
        tailnetName: undefined,
        peers: [],
        exitNode: false,
      };

    default:
      return {
        ...baseInterface,
        type: 'unknown' as const,
        purpose: 'unknown' as const,
      };
  }
}

/**
 * GET /api/networks/:interface
 * Get detailed information for a specific network interface
 * Supports both actual interface names (e.g., eth0, wlan0) and keywords (hotspot, internet, tailscale)
 * For keywords, shows default data if actual interface not found
 */
networks.get('/:interface', async (c) => {
  const requestId = Math.random().toString(36).substring(7);
  const interfaceName = c.req.param('interface');
  console.log(`[NetworksRoute:${requestId}] GET /api/networks/${interfaceName} - Request started`);

  try {
    const isKeyword = ['hotspot', 'internet', 'tailscale'].includes(interfaceName);
    console.log(`[NetworksRoute:${requestId}] Interface '${interfaceName}' is keyword: ${isKeyword}`);

    let networkInterface;

    // Check if it's a keyword
    if (isKeyword) {
      console.log(`[NetworksRoute:${requestId}] Looking up keyword interface: ${interfaceName}`);
      networkInterface = await networkService.getInterfaceByKeyword(interfaceName as 'hotspot' | 'internet' | 'tailscale');

      // If keyword interface not found, return default data
      if (!networkInterface) {
        console.log(`[NetworksRoute:${requestId}] Keyword interface '${interfaceName}' not found, creating default data`);
        const defaultInterface = createDefaultInterfaceData(interfaceName);

        return c.json({
          success: true,
          data: {
            interface: defaultInterface,
            isKeyword: true,
            isDefault: true,
            requestedName: interfaceName,
          },
          metadata: {
            timestamp: new Date().toISOString(),
            interfaceType: defaultInterface.type,
            interfaceState: defaultInterface.state,
            source: 'default',
            message: `${interfaceName} interface not found, showing default configuration`,
          },
        });
      } else {
        console.log(`[NetworksRoute:${requestId}] Found keyword interface '${interfaceName}':`, {
          name: networkInterface.name,
          type: networkInterface.type,
          state: networkInterface.state
        });
      }
    } else {
      console.log(`[NetworksRoute:${requestId}] Looking up actual interface: ${interfaceName}`);
      // Treat as actual interface name
      networkInterface = await networkService.getInterface(interfaceName);

      // For actual interface names, return 404 if not found
      if (!networkInterface) {
        console.log(`[NetworksRoute:${requestId}] Actual interface '${interfaceName}' not found`);
        return c.json(
          {
            success: false,
            error: 'Interface Not Found',
            message: `Network interface '${interfaceName}' not found or not available`,
          },
          404
        );
      } else {
        console.log(`[NetworksRoute:${requestId}] Found actual interface '${interfaceName}':`, {
          name: networkInterface.name,
          type: networkInterface.type,
          state: networkInterface.state
        });
      }
    }

    // Return the interface with type-specific information (already included by NetworkService)
    console.log(`[NetworksRoute:${requestId}] Returning interface data for '${interfaceName}'`);
    return c.json({
      success: true,
      data: {
        interface: networkInterface,
        isKeyword,
        isDefault: false,
        requestedName: interfaceName,
      },
      metadata: {
        timestamp: new Date().toISOString(),
        interfaceType: networkInterface.type,
        interfaceState: networkInterface.state,
        source: 'system',
      },
    });
  } catch (error) {
    console.error(`[NetworksRoute:${requestId}] Failed to get interface ${interfaceName}:`, error);
    console.error(`[NetworksRoute:${requestId}] Error details:`, {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    return c.json(
      {
        success: false,
        error: 'Failed to retrieve interface information',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * POST /api/networks/refresh
 * Refresh the network interface cache
 */
networks.post('/refresh', async (c) => {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[NetworksRoute:${requestId}] POST /api/networks/refresh - Request started`);

  try {
    console.log(`[NetworksRoute:${requestId}] Clearing network service cache`);
    networkService.clearCache();

    console.log(`[NetworksRoute:${requestId}] Triggering cache refresh by fetching summary`);
    // Trigger a refresh by getting the summary
    const summary = await networkService.getNetworkSummary();
    console.log(`[NetworksRoute:${requestId}] Cache refreshed, found ${summary.totalInterfaces} interfaces`);

    return c.json({
      success: true,
      data: {
        message: 'Network interface cache refreshed successfully',
        interfaceCount: summary.totalInterfaces,
      },
      metadata: {
        timestamp: new Date().toISOString(),
        action: 'cache_refresh',
      },
    });
  } catch (error) {
    console.error(`[NetworksRoute:${requestId}] Failed to refresh network cache:`, error);
    console.error(`[NetworksRoute:${requestId}] Error details:`, {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    return c.json(
      {
        success: false,
        error: 'Failed to refresh network cache',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});







export default networks;
