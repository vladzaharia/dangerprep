import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import { serveStatic } from '@hono/node-server/serve-static';

// Import routes
import networks from './routes/networks';
import services from './routes/services';
import config from './routes/config';
import health from './routes/health';

// Create main app with optimized configuration
const app = new Hono();

// Environment-specific middleware
const isDevelopment = process.env.NODE_ENV === 'development';

// Global middleware with optimizations
if (isDevelopment) {
  app.use('*', logger());
  app.use('*', prettyJSON());
}

app.use('*', secureHeaders({
  // Modern security headers for 2025
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    scriptSrc: ["'self'"],
    imgSrc: ["'self'", "data:", "https:"],
    connectSrc: ["'self'"],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    frameSrc: ["'none'"],
  },
  crossOriginEmbedderPolicy: false, // Disable for compatibility
}));

app.use('*', cors({
  origin: isDevelopment ? '*' : ['https://portal.danger.diy', 'https://portal.argos.surf'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
}));

// Mount API routes
app.route('/api/health', health);
app.route('/api/networks', networks);
app.route('/api/services', services);
app.route('/api/config', config);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  // Serve static assets
  app.use('/assets/*', serveStatic({ root: './dist' }));
  app.use('/static/*', serveStatic({ root: './dist' }));
  
  // Serve index.html for all non-API routes (SPA routing)
  app.get('*', serveStatic({ path: './dist/index.html' }));
}

// 404 handler for API routes only (in development, Vite handles non-API routes)
app.notFound((c) => {
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
