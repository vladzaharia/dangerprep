import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import { requestId } from 'hono/request-id';

// Import routes
import networks from './routes/networks';
import services from './routes/services';
import config from './routes/config';
import health from './routes/health';

// Import custom middleware
import { structuredLogging, type LoggerVariables } from './middleware/logging';

// Create main app with typed variables
const app = new Hono<{ Variables: LoggerVariables }>();

// Global middleware
// Request ID must come first for proper request tracking
app.use('*', requestId());
// Structured logging middleware (uses requestId from context)
app.use('*', structuredLogging());
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
  const logger = c.get('logger');
  const requestId = c.get('requestId');

  // Log error with structured metadata
  logger.error('API Error', {
    error: err.message,
    stack: err.stack,
    requestId,
    path: c.req.path,
    method: c.req.method,
  });

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

