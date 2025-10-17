import { Hono } from 'hono';

import type { LoggerVariables } from '../middleware/logging';
import { TailscaleService } from '../services/TailscaleService';

// Initialize service
const tailscaleService = new TailscaleService();

// Create router with typed variables
const tailscale = new Hono<{ Variables: LoggerVariables }>();

/**
 * GET /api/tailscale/settings
 * Get current Tailscale settings
 */
tailscale.get('/settings', async c => {
  const logger = c.get('logger');

  try {
    logger.debug('Getting Tailscale settings');
    const settings = await tailscaleService.getSettings();

    logger.info('Tailscale settings retrieved', { settings });

    return c.json({
      success: true,
      data: settings,
      metadata: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Failed to get Tailscale settings', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return c.json(
      {
        success: false,
        error: 'Failed to get Tailscale settings',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * POST /api/tailscale/settings
 * Update Tailscale settings (bulk update)
 */
tailscale.post('/settings', async c => {
  const logger = c.get('logger');

  try {
    const body = await c.req.json();
    logger.debug('Updating Tailscale settings', body);

    const result = await tailscaleService.updateSettings(body);

    if (result.success) {
      logger.info('Tailscale settings updated', { message: result.message });
      return c.json({
        success: true,
        message: result.message,
        metadata: {
          timestamp: new Date().toISOString(),
          action: 'settings-update',
        },
      });
    } else {
      logger.error('Tailscale settings update failed', { message: result.message });
      return c.json(
        {
          success: false,
          error: 'Settings update failed',
          message: result.message,
        },
        500
      );
    }
  } catch (error) {
    logger.error('Tailscale settings update error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return c.json(
      {
        success: false,
        error: 'Failed to update Tailscale settings',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * GET /api/tailscale/exit-nodes
 * Get available exit nodes
 */
tailscale.get('/exit-nodes', async c => {
  const logger = c.get('logger');

  try {
    logger.debug('Getting available exit nodes');
    const exitNodes = await tailscaleService.getExitNodes();

    logger.info('Exit nodes retrieved', { count: exitNodes.length });

    return c.json({
      success: true,
      data: exitNodes,
      metadata: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Failed to get exit nodes', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return c.json(
      {
        success: false,
        error: 'Failed to get exit nodes',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * GET /api/tailscale/exit-nodes/suggest
 * Get suggested exit node
 */
tailscale.get('/exit-nodes/suggest', async c => {
  const logger = c.get('logger');

  try {
    logger.debug('Getting suggested exit node');
    const suggestedNode = await tailscaleService.getSuggestedExitNode();

    logger.info('Suggested exit node retrieved', { suggestedNode });

    return c.json({
      success: true,
      data: suggestedNode,
      metadata: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Failed to get suggested exit node', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return c.json(
      {
        success: false,
        error: 'Failed to get suggested exit node',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * POST /api/tailscale/start
 * Start Tailscale
 */
tailscale.post('/start', async c => {
  const logger = c.get('logger');

  try {
    logger.info('Starting Tailscale');
    const result = await tailscaleService.startTailscale();

    if (result.success) {
      logger.info('Tailscale started', { message: result.message });
      return c.json({
        success: true,
        message: result.message,
        metadata: {
          timestamp: new Date().toISOString(),
          action: 'tailscale-start',
        },
      });
    } else {
      logger.error('Tailscale start failed', { message: result.message });
      return c.json(
        {
          success: false,
          error: 'Tailscale start failed',
          message: result.message,
        },
        500
      );
    }
  } catch (error) {
    logger.error('Tailscale start error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return c.json(
      {
        success: false,
        error: 'Failed to start Tailscale',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * POST /api/tailscale/stop
 * Stop Tailscale
 */
tailscale.post('/stop', async c => {
  const logger = c.get('logger');

  try {
    logger.warn('Stopping Tailscale');
    const result = await tailscaleService.stopTailscale();

    if (result.success) {
      logger.warn('Tailscale stopped', { message: result.message });
      return c.json({
        success: true,
        message: result.message,
        metadata: {
          timestamp: new Date().toISOString(),
          action: 'tailscale-stop',
        },
      });
    } else {
      logger.error('Tailscale stop failed', { message: result.message });
      return c.json(
        {
          success: false,
          error: 'Tailscale stop failed',
          message: result.message,
        },
        500
      );
    }
  } catch (error) {
    logger.error('Tailscale stop error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return c.json(
      {
        success: false,
        error: 'Failed to stop Tailscale',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

export default tailscale;
