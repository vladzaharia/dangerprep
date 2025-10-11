import { Hono } from 'hono';
import { ServiceDiscoveryService } from '../services/ServiceDiscoveryService';
import NodeCache from 'node-cache';

// Initialize cache (TTL: 30 seconds)
const cache = new NodeCache({ stdTTL: 30 });

// Initialize service
const serviceDiscovery = new ServiceDiscoveryService();

// Create router
const services = new Hono();

/**
 * GET /api/services
 * Get discovered services with optional filtering
 * Query params:
 *   - domain: Override base domain
 *   - type: Filter by service type (public, private, maintenance, all)
 */
services.get('/', async (c) => {
  try {
    const domain = c.req.query('domain');
    const type = c.req.query('type');
    
    // Check cache first
    const cacheKey = `services:${domain || 'default'}:${type || 'all'}`;
    const cachedResult = cache.get(cacheKey);
    
    if (cachedResult) {
      return c.json(cachedResult);
    }

    // Get services from discovery service
    const options: any = {};
    if (domain) options.baseDomain = domain;
    if (type) options.serviceType = type;

    const discoveredServices = await serviceDiscovery.getServices(options);

    const response = {
      success: true,
      services: discoveredServices,
      metadata: {
        lastScan: new Date().toISOString(),
        totalServices: discoveredServices.length,
        baseDomain: domain || serviceDiscovery.getDefaultDomain(),
        cached: false,
      },
    };

    // Cache the result
    cache.set(cacheKey, response);

    return c.json(response);
  } catch (error) {
    console.error('Failed to get services:', error);
    return c.json(
      {
        success: false,
        error: 'Failed to retrieve services',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * GET /api/services/:id
 * Get a specific service by ID (placeholder for future implementation)
 */
services.get('/:id', (c) => {
  const id = c.req.param('id');
  
  return c.json(
    {
      success: false,
      error: 'Not Implemented',
      message: `Service detail endpoint for '${id}' is not yet implemented`,
    },
    501
  );
});

export default services;

