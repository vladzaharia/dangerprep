import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';

// Import routes
import networks from './routes/networks';
import services from './routes/services';
import config from './routes/config';
import health from './routes/health';

// Create main app
const app = new Hono();

// Global middleware
app.use('*', logger());
app.use('*', secureHeaders({
  // Permissive security headers for all hosts as requested
  contentSecurityPolicy: {
    defaultSrc: ["'self'", "*"],
    styleSrc: ["'self'", "'unsafe-inline'", "*"],
    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "*"],
    imgSrc: ["'self'", "data:", "https:", "http:", "*"],
    connectSrc: ["'self'", "*"],
    fontSrc: ["'self'", "data:", "https:", "http:", "*"],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'", "*"],
    frameSrc: ["'self'", "*"],
    frameAncestors: ["'self'", "*"],
    baseUri: ["'self'", "*"],
    formAction: ["'self'", "*"],
  },
  crossOriginEmbedderPolicy: false, // Disable for compatibility
  crossOriginOpenerPolicy: false, // Disable to prevent HTTP/HTTPS issues
  crossOriginResourcePolicy: false, // Disable for compatibility
  originAgentCluster: false, // Disable to prevent agent cluster issues
}));
app.use('*', prettyJSON());
app.use('*', cors({
  origin: '*', // Allow all hosts as requested
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD', 'PATCH'],
  allowHeaders: ['*'], // Allow all headers
  exposeHeaders: ['*'], // Expose all headers
  credentials: false,
  maxAge: 86400, // Cache preflight for 24 hours
}));

// Mount routes
app.route('/api/health', health);
app.route('/api/networks', networks);
app.route('/api/services', services);
app.route('/api/config', config);

// Note: Root endpoint removed - now handled by Vite dev server for frontend
// API routes are mounted under /api prefix

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

