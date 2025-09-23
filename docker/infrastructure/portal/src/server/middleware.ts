import express, { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import NodeCache from 'node-cache';
import { ServiceDiscoveryService } from './services/ServiceDiscoveryService';

// Initialize cache (TTL: 30 seconds)
const cache = new NodeCache({ stdTTL: 30 });

// Initialize service discovery
const serviceDiscovery = new ServiceDiscoveryService();

/**
 * Create API middleware for Vite development server
 */
export function createApiMiddleware() {
  const router = express.Router();

  // Security middleware
  router.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  // Rate limiting for API routes
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests', retry_after: '15 minutes' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  router.use(apiLimiter);

  // JSON parsing
  router.use(express.json());

  // Health check endpoint
  router.get('/health', (_req: Request, res: Response) => {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cache_keys: cache.keys().length,
    };

    res.json(health);
  });

  // Service discovery endpoint
  router.get('/services', async (req: Request, res: Response) => {
    try {
      const { domain, type } = req.query;
      
      // Check cache first
      const cacheKey = `services_${domain || 'default'}_${type || 'all'}`;
      const cachedServices = cache.get(cacheKey);
      
      if (cachedServices) {
        res.json(cachedServices);
        return;
      }

      // Get services from discovery service
      const services = await serviceDiscovery.getServices({
        baseDomain: domain as string,
        serviceType: type as string,
      });

      const response = {
        services,
        metadata: {
          lastScan: new Date().toISOString(),
          totalServices: services.length,
          baseDomain: domain || serviceDiscovery.getDefaultDomain(),
          cached: false,
        },
      };

      // Cache the response
      cache.set(cacheKey, response);

      res.json(response);
    } catch (error) {
      console.error('Failed to get services:', error);
      res.status(500).json({ 
        error: 'Failed to retrieve services',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Error handling middleware
  router.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('API Error:', err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  });

  // 404 handler for API routes
  router.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      message: 'The requested API endpoint does not exist',
      available_endpoints: ['/api/health', '/api/services'],
    });
  });

  return router;
}
