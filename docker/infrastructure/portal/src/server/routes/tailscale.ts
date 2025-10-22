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
 * Returns available settings, omitting any that cannot be retrieved
 */
tailscale.get('/settings', async c => {
  const logger = c.get('logger');

  logger.debug('Getting Tailscale settings');
  const settings = await tailscaleService.getSettings();

  if (!settings) {
    logger.warn('Tailscale settings unavailable');
    return c.json({
      success: true,
      data: null,
      metadata: {
        timestamp: new Date().toISOString(),
        available: false,
      },
    });
  }

  logger.info('Tailscale settings retrieved', { settings });

  return c.json({
    success: true,
    data: settings,
    metadata: {
      timestamp: new Date().toISOString(),
      available: true,
    },
  });
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
 * Returns empty array if unavailable
 */
tailscale.get('/exit-nodes', async c => {
  const logger = c.get('logger');

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
});

/**
 * GET /api/tailscale/exit-nodes/suggest
 * Get suggested exit node
 * Returns null if unavailable
 */
tailscale.get('/exit-nodes/suggest', async c => {
  const logger = c.get('logger');

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

/**
 * GET /api/tailscale/status
 * Get full Tailscale status
 * Returns null if unavailable
 */
tailscale.get('/status', async c => {
  const logger = c.get('logger');

  logger.debug('Getting Tailscale status');
  const status = await tailscaleService.getStatus();

  logger.info('Tailscale status retrieved', { available: !!status });

  return c.json({
    success: true,
    data: status,
    metadata: {
      timestamp: new Date().toISOString(),
      available: !!status,
    },
  });
});

/**
 * GET /api/tailscale/peers
 * Get Tailscale peers
 * Returns empty array if unavailable
 */
tailscale.get('/peers', async c => {
  const logger = c.get('logger');

  logger.debug('Getting Tailscale peers');
  const peers = await tailscaleService.getPeers();

  logger.info('Tailscale peers retrieved', { count: peers.length });

  return c.json({
    success: true,
    data: peers,
    metadata: {
      timestamp: new Date().toISOString(),
      count: peers.length,
    },
  });
});

export default tailscale;
