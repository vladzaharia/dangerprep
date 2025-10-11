import { Hono } from 'hono';
import { ConfigService } from '../services/ConfigService';

// Initialize services
const configService = new ConfigService();

// Create router
const config = new Hono();

/**
 * GET /api/config
 * Get application-level configuration (title, description, base domain, etc.)
 * This does NOT include WiFi or service-specific configuration
 */
config.get('/', (c) => {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[ConfigRoute:${requestId}] GET /api/config - Request started`);

  try {
    console.log(`[ConfigRoute:${requestId}] Fetching app configuration`);
    const appConfig = configService.getAppConfig();
    console.log(`[ConfigRoute:${requestId}] Retrieved app config:`, JSON.stringify(appConfig, null, 2));

    return c.json({
      success: true,
      data: appConfig,
    });
  } catch (error) {
    console.error(`[ConfigRoute:${requestId}] Failed to get app configuration:`, error);
    console.error(`[ConfigRoute:${requestId}] Error details:`, {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    return c.json(
      {
        success: false,
        error: 'Failed to retrieve app configuration',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * GET /api/config/app
 * Alias for /api/config for backward compatibility
 * @deprecated Use /api/config instead
 */
config.get('/app', (c) => {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[ConfigRoute:${requestId}] GET /api/config/app - Request started (deprecated endpoint)`);

  try {
    console.log(`[ConfigRoute:${requestId}] Fetching app configuration via deprecated endpoint`);
    const appConfig = configService.getAppConfig();
    console.log(`[ConfigRoute:${requestId}] Retrieved app config via deprecated endpoint:`, JSON.stringify(appConfig, null, 2));

    return c.json({
      success: true,
      data: appConfig,
    });
  } catch (error) {
    console.error(`[ConfigRoute:${requestId}] Failed to get app configuration via deprecated endpoint:`, error);
    console.error(`[ConfigRoute:${requestId}] Error details:`, {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    return c.json(
      {
        success: false,
        error: 'Failed to retrieve app configuration',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

export default config;

