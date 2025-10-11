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
  try {
    const appConfig = configService.getAppConfig();
    return c.json({
      success: true,
      data: appConfig,
    });
  } catch (error) {
    console.error('Failed to get app configuration:', error);
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
  try {
    const appConfig = configService.getAppConfig();
    return c.json({
      success: true,
      data: appConfig,
    });
  } catch (error) {
    console.error('Failed to get app configuration:', error);
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

