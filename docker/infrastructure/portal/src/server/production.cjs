const express = require('express');
const path = require('path');
const { createApiMiddleware } = require('./middleware.cjs');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Trust proxy settings for reverse proxy (Traefik)
// This is required when running behind a reverse proxy to properly handle X-Forwarded-For headers
app.set('trust proxy', true);

// API routes
app.use('/api', createApiMiddleware());

// Serve static files from the dist directory
const distPath = path.join(__dirname, '../../dist');
app.use(express.static(distPath));

// Handle React Router - serve index.html for all non-API routes
app.get('*', (req, res) => {
  // Skip API routes
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  res.sendFile(path.join(distPath, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Portal server running on port ${PORT}`);
  console.log(`📱 Frontend: http://localhost:${PORT}`);
  console.log(`🔌 API: http://localhost:${PORT}/api`);
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
