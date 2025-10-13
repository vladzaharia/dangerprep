import { Hono } from 'hono';
import type { LoggerVariables } from '../middleware/logging';

// Create router with typed variables
const health = new Hono<{ Variables: LoggerVariables }>();

/**
 * GET /api/health
 * Health check endpoint
 */
health.get('/', (c) => {
  const logger = c.get('logger');

  const healthData = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    nodeVersion: process.version,
  };

  logger.debug('Health check data', healthData);

  return c.json(healthData);
});

export default health;

