import { Hono } from 'hono';

import type { LoggerVariables } from '../middleware/logging';
import { PowerService } from '../services/PowerService';

// Initialize service
const powerService = new PowerService();

// Create router with typed variables
const power = new Hono<{ Variables: LoggerVariables }>();

/**
 * POST /api/power/kiosk/restart
 * Restart the Firefox kiosk browser
 */
power.post('/kiosk/restart', async c => {
  const logger = c.get('logger');

  try {
    logger.info('Kiosk restart requested');
    const result = await powerService.restartKiosk();

    if (result.success) {
      logger.info('Kiosk restart successful', { message: result.message });
      return c.json({
        success: true,
        message: result.message,
        metadata: {
          timestamp: new Date().toISOString(),
          action: 'kiosk-restart',
        },
      });
    } else {
      logger.error('Kiosk restart failed', { message: result.message });
      return c.json(
        {
          success: false,
          error: 'Kiosk restart failed',
          message: result.message,
        },
        500
      );
    }
  } catch (error) {
    logger.error('Kiosk restart error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return c.json(
      {
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * POST /api/power/reboot
 * Reboot the system
 */
power.post('/reboot', async c => {
  const logger = c.get('logger');

  try {
    logger.warn('System reboot requested');
    const result = await powerService.rebootSystem();

    if (result.success) {
      logger.warn('System reboot initiated', { message: result.message });
      return c.json({
        success: true,
        message: result.message,
        metadata: {
          timestamp: new Date().toISOString(),
          action: 'system-reboot',
        },
      });
    } else {
      logger.error('System reboot failed', { message: result.message });
      return c.json(
        {
          success: false,
          error: 'System reboot failed',
          message: result.message,
        },
        500
      );
    }
  } catch (error) {
    logger.error('System reboot error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return c.json(
      {
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * POST /api/power/shutdown
 * Shutdown the system
 */
power.post('/shutdown', async c => {
  const logger = c.get('logger');

  try {
    logger.warn('System shutdown requested');
    const result = await powerService.shutdownSystem();

    if (result.success) {
      logger.warn('System shutdown initiated', { message: result.message });
      return c.json({
        success: true,
        message: result.message,
        metadata: {
          timestamp: new Date().toISOString(),
          action: 'system-shutdown',
        },
      });
    } else {
      logger.error('System shutdown failed', { message: result.message });
      return c.json(
        {
          success: false,
          error: 'System shutdown failed',
          message: result.message,
        },
        500
      );
    }
  } catch (error) {
    logger.error('System shutdown error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return c.json(
      {
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * POST /api/power/desktop
 * Switch from kiosk mode to desktop mode
 */
power.post('/desktop', async c => {
  const logger = c.get('logger');

  try {
    logger.info('Desktop mode switch requested');
    const result = await powerService.switchToDesktop();

    if (result.success) {
      logger.info('Desktop mode switch initiated', { message: result.message });
      return c.json({
        success: true,
        message: result.message,
        metadata: {
          timestamp: new Date().toISOString(),
          action: 'desktop-mode-switch',
        },
      });
    } else {
      logger.error('Desktop mode switch failed', { message: result.message });
      return c.json(
        {
          success: false,
          error: 'Desktop mode switch failed',
          message: result.message,
        },
        500
      );
    }
  } catch (error) {
    logger.error('Desktop mode switch error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return c.json(
      {
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * GET /api/power/kiosk/status
 * Get current kiosk status
 */
power.get('/kiosk/status', async c => {
  const logger = c.get('logger');

  try {
    logger.debug('Kiosk status requested');
    const status = await powerService.getKioskStatus();

    logger.debug('Kiosk status retrieved', status);

    return c.json({
      success: true,
      data: status,
      metadata: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Kiosk status error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return c.json(
      {
        success: false,
        error: 'Failed to get kiosk status',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

export default power;
