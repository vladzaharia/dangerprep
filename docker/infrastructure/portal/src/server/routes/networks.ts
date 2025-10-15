import { Hono } from 'hono';
import { NetworkService } from '../services/NetworkService';
import type { LoggerVariables } from '../middleware/logging';

// Initialize service
const networkService = new NetworkService();

// Create router with typed variables
const networks = new Hono<{ Variables: LoggerVariables }>();

/**
 * GET /api/networks
 * Get all network interfaces with full information
 */
networks.get('/', async c => {
  const logger = c.get('logger');

  try {
    logger.debug('Fetching network summary');
    // Return network summary with special interface mappings
    const summary = await networkService.getNetworkSummary();
    logger.info('Retrieved network summary', {
      totalInterfaces: summary.totalInterfaces,
    });

    return c.json({
      success: true,
      data: summary,
      metadata: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Failed to get network interfaces', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
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
networks.get('/:interface', async c => {
  const logger = c.get('logger');
  const interfaceName = c.req.param('interface');

  try {
    const isKeyword = ['hotspot', 'internet', 'tailscale'].includes(interfaceName);
    logger.debug('Interface lookup', { interfaceName, isKeyword });

    let networkInterface;

    // Check if it's a keyword
    if (isKeyword) {
      logger.debug('Looking up keyword interface', { interfaceName });
      networkInterface = await networkService.getInterfaceByKeyword(
        interfaceName as 'hotspot' | 'internet' | 'tailscale'
      );

      // If keyword interface not found, return default data
      if (!networkInterface) {
        logger.info('Keyword interface not found, creating default data', { interfaceName });
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
        logger.debug('Found keyword interface', {
          interfaceName,
          name: networkInterface.name,
          type: networkInterface.type,
          state: networkInterface.state,
        });
      }
    } else {
      logger.debug('Looking up actual interface', { interfaceName });
      // Treat as actual interface name
      networkInterface = await networkService.getInterface(interfaceName);

      // For actual interface names, return 404 if not found
      if (!networkInterface) {
        logger.warn('Actual interface not found', { interfaceName });
        return c.json(
          {
            success: false,
            error: 'Interface Not Found',
            message: `Network interface '${interfaceName}' not found or not available`,
          },
          404
        );
      } else {
        logger.debug('Found actual interface', {
          interfaceName,
          name: networkInterface.name,
          type: networkInterface.type,
          state: networkInterface.state,
        });
      }
    }

    // Return the interface with type-specific information (already included by NetworkService)
    // Log connected clients info if this is a WiFi interface
    if (networkInterface.type === 'wifi') {
      const wifiInterface = networkInterface as any;
      logger.info('Returning WiFi interface data', {
        interfaceName,
        mode: wifiInterface.mode,
        hasConnectedClients: !!wifiInterface.connectedClients,
        connectedClientsCount: wifiInterface.connectedClients?.length || 0,
      });
    } else {
      logger.debug('Returning interface data', { interfaceName, type: networkInterface.type });
    }

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
    logger.error('Failed to get interface', {
      interfaceName,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
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
 * GET /api/networks/hostapd/status
 * Get detailed hostapd status information
 */
networks.get('/hostapd/status', async c => {
  const logger = c.get('logger');

  try {
    logger.debug('Getting hostapd status');
    const hostapdStatus = await networkService.getHostapdStatus();
    logger.info('Hostapd status retrieved', {
      isConfigured: hostapdStatus.isConfigured,
      isRunning: hostapdStatus.isRunning,
      activeInterface: hostapdStatus.activeInterface,
      connectedClients: hostapdStatus.connectedClients,
    });

    return c.json({
      success: true,
      data: {
        hostapd: hostapdStatus,
      },
      metadata: {
        timestamp: new Date().toISOString(),
        source: 'hostapd',
      },
    });
  } catch (error) {
    logger.error('Failed to get hostapd status', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return c.json(
      {
        success: false,
        error: 'Failed to retrieve hostapd status',
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
networks.post('/refresh', async c => {
  const logger = c.get('logger');

  try {
    logger.debug('Clearing network service cache');
    networkService.clearCache();

    logger.debug('Triggering cache refresh by fetching summary');
    // Trigger a refresh by getting the summary
    const summary = await networkService.getNetworkSummary();
    logger.info('Cache refreshed', {
      interfaceCount: summary.totalInterfaces,
    });

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
    logger.error('Failed to refresh network cache', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
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
