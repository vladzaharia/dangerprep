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
 * POST /api/tailscale/exit-node
 * Set exit node
 */
tailscale.post('/exit-node', async c => {
  const logger = c.get('logger');

  try {
    const body = await c.req.json();
    const { nodeId } = body;

    logger.debug('Setting exit node', { nodeId });
    const result = await tailscaleService.setExitNode(nodeId);

    if (result.success) {
      logger.info('Exit node set', { nodeId, message: result.message });
      return c.json({
        success: true,
        message: result.message,
        metadata: {
          timestamp: new Date().toISOString(),
          action: 'exit-node-set',
        },
      });
    } else {
      logger.error('Exit node set failed', { nodeId, message: result.message });
      return c.json(
        {
          success: false,
          error: 'Exit node set failed',
          message: result.message,
        },
        500
      );
    }
  } catch (error) {
    logger.error('Exit node set error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return c.json(
      {
        success: false,
        error: 'Failed to set exit node',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * POST /api/tailscale/accept-dns
 * Set accept DNS
 */
tailscale.post('/accept-dns', async c => {
  const logger = c.get('logger');

  try {
    const body = await c.req.json();
    const { accept } = body;

    logger.debug('Setting accept DNS', { accept });
    const result = await tailscaleService.setAcceptDNS(accept);

    if (result.success) {
      logger.info('Accept DNS set', { accept, message: result.message });
      return c.json({
        success: true,
        message: result.message,
        metadata: {
          timestamp: new Date().toISOString(),
          action: 'accept-dns-set',
        },
      });
    } else {
      logger.error('Accept DNS set failed', { accept, message: result.message });
      return c.json(
        {
          success: false,
          error: 'Accept DNS set failed',
          message: result.message,
        },
        500
      );
    }
  } catch (error) {
    logger.error('Accept DNS set error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return c.json(
      {
        success: false,
        error: 'Failed to set accept DNS',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * POST /api/tailscale/accept-routes
 * Set accept routes
 */
tailscale.post('/accept-routes', async c => {
  const logger = c.get('logger');

  try {
    const body = await c.req.json();
    const { accept } = body;

    logger.debug('Setting accept routes', { accept });
    const result = await tailscaleService.setAcceptRoutes(accept);

    if (result.success) {
      logger.info('Accept routes set', { accept, message: result.message });
      return c.json({
        success: true,
        message: result.message,
        metadata: {
          timestamp: new Date().toISOString(),
          action: 'accept-routes-set',
        },
      });
    } else {
      logger.error('Accept routes set failed', { accept, message: result.message });
      return c.json(
        {
          success: false,
          error: 'Accept routes set failed',
          message: result.message,
        },
        500
      );
    }
  } catch (error) {
    logger.error('Accept routes set error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return c.json(
      {
        success: false,
        error: 'Failed to set accept routes',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * POST /api/tailscale/ssh
 * Set SSH
 */
tailscale.post('/ssh', async c => {
  const logger = c.get('logger');

  try {
    const body = await c.req.json();
    const { enabled } = body;

    logger.debug('Setting SSH', { enabled });
    const result = await tailscaleService.setSSH(enabled);

    if (result.success) {
      logger.info('SSH set', { enabled, message: result.message });
      return c.json({
        success: true,
        message: result.message,
        metadata: {
          timestamp: new Date().toISOString(),
          action: 'ssh-set',
        },
      });
    } else {
      logger.error('SSH set failed', { enabled, message: result.message });
      return c.json(
        {
          success: false,
          error: 'SSH set failed',
          message: result.message,
        },
        500
      );
    }
  } catch (error) {
    logger.error('SSH set error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return c.json(
      {
        success: false,
        error: 'Failed to set SSH',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

export default tailscale;
