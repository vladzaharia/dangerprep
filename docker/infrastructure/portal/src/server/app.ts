import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';

// Import routes
import wifi from './routes/wifi';
import services from './routes/services';
import config from './routes/config';
import health from './routes/health';

// Create main app
const app = new Hono();

// Global middleware
app.use('*', logger());
app.use('*', secureHeaders());
app.use('*', prettyJSON());
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Mount routes
app.route('/api/health', health);
app.route('/api/wifi', wifi);
app.route('/api/services', services);
app.route('/api/config', config);

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: 'DangerPrep Portal API',
    version: '2.0.0',
    framework: 'Hono',
    documentation: 'https://github.com/vladzaharia/dangerprep',
  });
});

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: 'Not Found',
      message: 'The requested endpoint does not exist',
    },
    404
  );
});

// Error handler
app.onError((err, c) => {
  console.error('API Error:', err);
  return c.json(
    {
      success: false,
      error: 'Internal Server Error',
      message: err.message || 'An unexpected error occurred',
    },
    500
  );
});

export default app;

