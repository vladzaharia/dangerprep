import { Plugin } from 'vite';
import app from './app';

/**
 * Vite plugin that adds Hono API middleware to the dev server
 */
export function apiPlugin(): Plugin {
  return {
    name: 'hono-api-plugin',
    configureServer(server) {
      // Use Hono app as middleware for Vite dev server
      server.middlewares.use(async (req, res, next) => {
        // Only handle API routes with Hono
        if (req.url?.startsWith('/api')) {
          try {
            // Convert Node.js request to Web API Request
            const url = new URL(req.url, `http://${req.headers.host}`);
            const request = new Request(url, {
              method: req.method || 'GET',
              headers: req.headers as HeadersInit,
            });

            // Handle the request with Hono
            const response = await app.fetch(request);

            // Convert Web API Response to Node.js response
            res.statusCode = response.status;
            response.headers.forEach((value, key) => {
              res.setHeader(key, value);
            });

            const body = await response.text();
            res.end(body);
          } catch (error) {
            console.error('API Error:', error);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              success: false,
              error: 'Internal Server Error',
              message: error instanceof Error ? error.message : 'An unexpected error occurred',
            }));
          }
        } else {
          // Pass through to Vite for non-API routes
          next();
        }
      });

      console.log('🔌 Hono API middleware registered');
    },
  };
}
