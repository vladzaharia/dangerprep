import { Hono } from 'hono';

// Create router
const health = new Hono();

/**
 * GET /api/health
 * Health check endpoint
 */
health.get('/', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    nodeVersion: process.version,
  });
});

export default health;

