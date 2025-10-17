import { Hono } from 'hono';
import NodeCache from 'node-cache';

import type { LoggerVariables } from '../middleware/logging';
import { ServiceDiscoveryService } from '../services/ServiceDiscoveryService';

// Initialize cache (TTL: 30 seconds)
const cache = new NodeCache({ stdTTL: 30 });

// Initialize service
const serviceDiscovery = new ServiceDiscoveryService();

// Create router with typed variables
const services = new Hono<{ Variables: LoggerVariables }>();

/**
 * GET /api/services
 * Get discovered services with optional filtering
 * Query params:
 *   - domain: Override base domain
 *   - type: Filter by service type (public, private, maintenance, all)
 */
services.get('/', async c => {
  const logger = c.get('logger');

  try {
    const domain = c.req.query('domain');
    const type = c.req.query('type');

    logger.debug('Query parameters', { domain, type });

    // Check cache first
    const cacheKey = `services:${domain || 'default'}:${type || 'all'}`;
    logger.debug('Checking cache', { cacheKey });

    const cachedResult = cache.get(cacheKey);

    if (cachedResult) {
      logger.debug('Cache hit - returning cached result');
      return c.json(cachedResult);
    }

    logger.debug('Cache miss - fetching from service discovery');

    // Get services from discovery service
    const options: { baseDomain?: string; serviceType?: string } = {};
    if (domain) options.baseDomain = domain;
    if (type) options.serviceType = type;

    logger.debug('Service discovery options', options);
    const discoveredServices = await serviceDiscovery.getServices(options);
    logger.info('Service discovery completed', {
      serviceCount: discoveredServices.length,
    });

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

    logger.debug('Response metadata', response.metadata);

    // Cache the result
    cache.set(cacheKey, response);
    logger.debug('Result cached', { cacheKey });

    return c.json(response);
  } catch (error) {
    logger.error('Failed to get services', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
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
services.get('/:id', c => {
  const logger = c.get('logger');
  const id = c.req.param('id');

  logger.debug('Service detail endpoint called', { id });
  logger.warn('Service detail endpoint not yet implemented', { id });

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
