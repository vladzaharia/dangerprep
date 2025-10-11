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
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[ServicesRoute:${requestId}] GET /api/services - Request started`);

  try {
    const domain = c.req.query('domain');
    const type = c.req.query('type');

    console.log(`[ServicesRoute:${requestId}] Query parameters:`, { domain, type });

    // Check cache first
    const cacheKey = `services:${domain || 'default'}:${type || 'all'}`;
    console.log(`[ServicesRoute:${requestId}] Cache key: ${cacheKey}`);

    const cachedResult = cache.get(cacheKey);

    if (cachedResult) {
      console.log(`[ServicesRoute:${requestId}] Cache hit - returning cached result`);
      return c.json(cachedResult);
    }

    console.log(`[ServicesRoute:${requestId}] Cache miss - fetching from service discovery`);

    // Get services from discovery service
    const options: any = {};
    if (domain) options.baseDomain = domain;
    if (type) options.serviceType = type;

    console.log(`[ServicesRoute:${requestId}] Service discovery options:`, options);
    const discoveredServices = await serviceDiscovery.getServices(options);
    console.log(`[ServicesRoute:${requestId}] Service discovery returned ${discoveredServices.length} services`);

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

    console.log(`[ServicesRoute:${requestId}] Response metadata:`, response.metadata);

    // Cache the result
    cache.set(cacheKey, response);
    console.log(`[ServicesRoute:${requestId}] Result cached with key: ${cacheKey}`);

    console.log(`[ServicesRoute:${requestId}] Request completed successfully`);
    return c.json(response);
  } catch (error) {
    console.error(`[ServicesRoute:${requestId}] Failed to get services:`, error);
    console.error(`[ServicesRoute:${requestId}] Error details:`, {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

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
  const requestId = Math.random().toString(36).substring(7);
  const id = c.req.param('id');

  console.log(`[ServicesRoute:${requestId}] GET /api/services/${id} - Request started`);
  console.log(`[ServicesRoute:${requestId}] Service ID parameter: ${id}`);

  console.log(`[ServicesRoute:${requestId}] Returning 501 Not Implemented`);
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

