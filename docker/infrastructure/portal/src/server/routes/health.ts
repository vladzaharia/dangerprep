import { Hono } from 'hono';

// Create router
const health = new Hono();

/**
 * GET /api/health
 * Health check endpoint
 */
health.get('/', (c) => {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[HealthRoute:${requestId}] GET /api/health - Request started`);

  const healthData = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    nodeVersion: process.version,
  };

  console.log(`[HealthRoute:${requestId}] Health check data:`, JSON.stringify(healthData, null, 2));
  console.log(`[HealthRoute:${requestId}] Request completed successfully`);

  return c.json(healthData);
});

export default health;

