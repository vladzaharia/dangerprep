import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { WifiConfigService } from '../services/WifiConfigService';

// Initialize service
const wifiService = new WifiConfigService();

// Create router
const wifi = new Hono();

/**
 * GET /api/wifi
 * Get WiFi configuration (SSID and password) with optional network information
 * Query params:
 *   - includeNetwork: Include network information (IP, gateway, DNS) if available
 */
wifi.get('/', async (c) => {
  try {
    const includeNetwork = c.req.query('includeNetwork') === 'true';

    if (includeNetwork) {
      // Get configuration with network information
      const configWithNetwork = await wifiService.getWifiConfigWithNetwork();
      return c.json({
        success: true,
        data: {
          ssid: configWithNetwork.ssid,
          password: configWithNetwork.password,
          network: configWithNetwork.network,
        },
        metadata: {
          source: configWithNetwork.source,
          timestamp: new Date().toISOString(),
          includesNetwork: true,
        },
      });
    } else {
      // Get basic configuration only (backward compatibility)
      const configWithMetadata = wifiService.getWifiConfigWithMetadata();
      return c.json({
        success: true,
        data: {
          ssid: configWithMetadata.ssid,
          password: configWithMetadata.password,
        },
        metadata: {
          source: configWithMetadata.source,
          timestamp: new Date().toISOString(),
          includesNetwork: false,
        },
      });
    }
  } catch (error) {
    console.error('Failed to get WiFi configuration:', error);
    return c.json(
      {
        success: false,
        error: 'Failed to retrieve WiFi configuration',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * PUT /api/wifi
 * Update WiFi configuration (placeholder for future implementation)
 */
const updateWifiSchema = z.object({
  ssid: z.string().min(1).max(32).optional(),
  password: z.string().min(8).max(63).optional(),
});

wifi.put('/', zValidator('json', updateWifiSchema), async (c) => {
  try {
    //const body = c.req.valid('json');
    
    // TODO: Implement WiFi configuration update
    // For now, return not implemented
    return c.json(
      {
        success: false,
        error: 'Not Implemented',
        message: 'WiFi configuration update is not yet implemented',
      },
      501
    );
  } catch (error) {
    console.error('Failed to update WiFi configuration:', error);
    return c.json(
      {
        success: false,
        error: 'Failed to update WiFi configuration',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

export default wifi;

