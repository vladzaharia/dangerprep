const { serve } = require('@hono/node-server');
const { serveStatic } = require('@hono/node-server/serve-static');
const path = require('path');
const fs = require('fs');

// Import the Hono app (compiled from TypeScript)
const { default: app } = require('./app.cjs');

const PORT = parseInt(process.env.PORT || '3000', 10);

// Serve static files from the dist directory for non-API routes
const distPath = path.join(__dirname, '../../dist');

// Add static file serving middleware for the frontend
app.use('/*', serveStatic({ root: distPath }));

// Fallback to index.html for client-side routing (must be after API routes)
app.get('*', (c) => {
  // Skip API routes
  if (c.req.path.startsWith('/api')) {
    return c.json({ error: 'API endpoint not found' }, 404);
  }

  // Serve index.html for all other routes (React Router)
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    return c.html(fs.readFileSync(indexPath, 'utf8'));
  }

  return c.text('Frontend not found', 404);
});

// Start server
console.log('🚀 Starting DangerPrep Portal server...');
serve({
  fetch: app.fetch,
  port: PORT,
  hostname: '0.0.0.0',
}, (info) => {
  console.log(`🚀 Portal server running on port ${info.port}`);
  console.log(`📱 Frontend: http://localhost:${info.port}`);
  console.log(`🔌 API: http://localhost:${info.port}/api`);
  console.log(`⚡ Powered by Hono`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  process.exit(0);
});
