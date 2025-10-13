import { Hono } from 'hono';
import { ConfigService } from '../services/ConfigService';
import type { LoggerVariables } from '../middleware/logging';

// Initialize services
const configService = new ConfigService();

// Create router with typed variables
const config = new Hono<{ Variables: LoggerVariables }>();

/**
 * GET /api/config
 * Get application-level configuration (title, description, base domain, etc.)
 * This does NOT include WiFi or service-specific configuration
 */
config.get('/', (c) => {
  const logger = c.get('logger');

  try {
    logger.debug('Fetching app configuration');
    const appConfig = configService.getAppConfig();
    logger.debug('Retrieved app config', { appConfig });

    return c.json({
      success: true,
      data: appConfig,
    });
  } catch (error) {
    logger.error('Failed to get app configuration', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
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
  const logger = c.get('logger');
  logger.warn('Using deprecated endpoint /api/config/app - use /api/config instead');

  try {
    logger.debug('Fetching app configuration via deprecated endpoint');
    const appConfig = configService.getAppConfig();
    logger.debug('Retrieved app config via deprecated endpoint', { appConfig });

    return c.json({
      success: true,
      data: appConfig,
    });
  } catch (error) {
    logger.error('Failed to get app configuration via deprecated endpoint', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
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

