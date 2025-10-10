import { Plugin } from 'vite';
import { ServiceDiscoveryService } from './services/ServiceDiscoveryService';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load environment variables from .env file
function loadEnvFile(): Record<string, string> {
  try {
    const envPath = resolve(__dirname, '../../.env');
    const envContent = readFileSync(envPath, 'utf8');
    const envVars: Record<string, string> = {};

    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          envVars[key.trim()] = valueParts.join('=').trim();
        }
      }
    });

    return envVars;
  } catch (error) {
    console.warn('Could not load .env file:', error);
    return {};
  }
}

// Load environment variables
const envVars = loadEnvFile();

// Initialize service discovery
const serviceDiscovery = new ServiceDiscoveryService();

// Simple in-memory cache
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 30000; // 30 seconds

function getFromCache(key: string) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: any) {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Vite plugin that adds API middleware to the dev server
 */
export function apiPlugin(): Plugin {
  return {
    name: 'api-plugin',
    configureServer(server) {
      // Add API middleware directly to Vite's connect server
      server.middlewares.use('/api', async (req, res, _next) => {
        // Set CORS headers for development
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 200;
          res.end();
          return;
        }

        try {
          const url = new URL(req.url!, `http://${req.headers.host}`);
          const pathname = url.pathname;

          // Health check endpoint
          if (pathname === '/health') {
            const healthData = {
              status: 'healthy',
              timestamp: new Date().toISOString(),
              uptime: process.uptime(),
              memory: process.memoryUsage(),
              cache_keys: cache.size,
            };

            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            res.end(JSON.stringify(healthData));
            return;
          }

          // Environment variables endpoint
          if (pathname === '/config') {
            // Helper function to get env var with fallbacks
            const getEnvVar = (key: string, fallback: string) => {
              return process.env[key] || envVars[key] || fallback;
            };



            const configData = {
              wifi: {
                ssid: getEnvVar('WIFI_SSID', 'DangerPrep'),
                password: getEnvVar('WIFI_PASSWORD', 'change_me'),
              },
              services: {
                baseDomain: getEnvVar('BASE_DOMAIN', 'danger.diy'),
                jellyfin: getEnvVar('JELLYFIN_SUBDOMAIN', 'media'),
                kiwix: getEnvVar('KIWIX_SUBDOMAIN', 'kiwix'),
                romm: getEnvVar('ROMM_SUBDOMAIN', 'retro'),
                docmost: getEnvVar('DOCMOST_SUBDOMAIN', 'docmost'),
                onedev: getEnvVar('ONEDEV_SUBDOMAIN', 'onedev'),
                traefik: getEnvVar('TRAEFIK_SUBDOMAIN', 'traefik'),
                komodo: getEnvVar('KOMODO_SUBDOMAIN', 'docker'),
              },
              app: {
                title: getEnvVar('VITE_APP_TITLE', 'DangerPrep Portal'),
                description: getEnvVar('VITE_APP_DESCRIPTION', 'Your portable hotspot services portal'),
              },
              metadata: {
                lastUpdated: new Date().toISOString(),
                nodeEnv: process.env.NODE_ENV || 'production',
              },
            };

            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            res.end(JSON.stringify(configData));
            return;
          }

          // Service discovery endpoint
          if (pathname === '/services') {
            const domain = url.searchParams.get('domain');
            const type = url.searchParams.get('type');
            const cacheKey = `services:${domain || 'default'}:${type || 'all'}`;

            // Check cache first
            const cachedResult = getFromCache(cacheKey);
            if (cachedResult) {
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify(cachedResult));
              return;
            }

            // Get services from discovery service
            const options: any = {};
            if (domain) options.baseDomain = domain;
            if (type) options.serviceType = type;

            const services = await serviceDiscovery.getServices(options);

            const response = {
              services,
              metadata: {
                lastScan: new Date().toISOString(),
                totalServices: services.length,
                baseDomain: domain || serviceDiscovery.getDefaultDomain(),
                cached: false,
              },
            };

            // Cache the result
            setCache(cacheKey, response);

            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            res.end(JSON.stringify(response));
            return;
          }

          // 404 for unknown API endpoints
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 404;
          res.end(JSON.stringify({
            error: 'API endpoint not found',
            message: 'The requested API endpoint does not exist',
          }));

        } catch (error) {
          console.error('API Error:', error);
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 500;
          res.end(JSON.stringify({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An unexpected error occurred',
          }));
        }
      });

      console.log('🔌 API middleware registered at /api');
    },
  };
}
