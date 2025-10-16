import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import { serveStatic } from '@hono/node-server/serve-static';
import { requestId } from 'hono/request-id';

// Import middleware
import { structuredLogging } from './middleware/logging';

// Import routes
import networks from './routes/networks';
import services from './routes/services';
import config from './routes/config';
import health from './routes/health';
import power from './routes/power';

// Create main app with optimized configuration
const app = new Hono();

// Environment-specific middleware
const isDevelopment = process.env.NODE_ENV === 'development';

// Global middleware with optimizations
if (isDevelopment) {
  app.use('*', logger());
  app.use('*', prettyJSON());
}

// Request ID middleware (must come before structured logging)
app.use('*', requestId());

// Structured logging middleware
app.use('*', structuredLogging());

app.use(
  '*',
  secureHeaders({
    // Permissive security headers for all hosts as requested
    contentSecurityPolicy: {
      defaultSrc: ["'self'", '*'],
      styleSrc: ["'self'", "'unsafe-inline'", '*'],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", '*'],
      imgSrc: ["'self'", 'data:', 'https:', 'http:', '*'],
      connectSrc: ["'self'", '*'],
      fontSrc: ["'self'", 'data:', 'https:', 'http:', '*'],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", '*'],
      frameSrc: ["'self'", '*'],
      frameAncestors: ["'self'", '*'],
      baseUri: ["'self'", '*'],
      formAction: ["'self'", '*'],
    },
    crossOriginEmbedderPolicy: false, // Disable for compatibility
    crossOriginOpenerPolicy: false, // Disable to prevent HTTP/HTTPS issues
    crossOriginResourcePolicy: false, // Disable for compatibility
    originAgentCluster: false, // Disable to prevent agent cluster issues
  })
);

app.use(
  '*',
  cors({
    origin: '*', // Allow all hosts as requested
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD', 'PATCH'],
    allowHeaders: ['*'], // Allow all headers
    exposeHeaders: ['*'], // Expose all headers
    credentials: false,
    maxAge: 86400, // Cache preflight for 24 hours
  })
);

// Mount API routes
app.route('/api/health', health);
app.route('/api/networks', networks);
app.route('/api/services', services);
app.route('/api/config', config);
app.route('/api/power', power);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  // Serve static assets
  app.use('/assets/*', serveStatic({ root: './dist' }));
  app.use('/static/*', serveStatic({ root: './dist' }));

  // Serve index.html for all non-API routes (SPA routing)
  app.get('*', serveStatic({ path: './dist/index.html' }));
}

// 404 handler for API routes only (in development, Vite handles non-API routes)
app.notFound(c => {
  // Only return 404 JSON for API routes
  if (c.req.path.startsWith('/api')) {
    return c.json(
      {
        success: false,
        error: 'Not Found',
        message: 'The requested API endpoint does not exist',
      },
      404
    );
  }

  // For non-API routes in development, this won't be reached
  // because Vite dev server handles them
  return c.text('Not Found', 404);
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
