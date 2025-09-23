"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApiMiddleware = createApiMiddleware;
const express_1 = __importDefault(require("express"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const helmet_1 = __importDefault(require("helmet"));
const node_cache_1 = __importDefault(require("node-cache"));
const ServiceDiscoveryService_1 = require("./services/ServiceDiscoveryService.cjs");
// Initialize cache (TTL: 30 seconds)
const cache = new node_cache_1.default({ stdTTL: 30 });
// Initialize service discovery
const serviceDiscovery = new ServiceDiscoveryService_1.ServiceDiscoveryService();
/**
 * Create API middleware for Vite development server
 */
function createApiMiddleware() {
    const router = express_1.default.Router();
    // Security middleware
    router.use((0, helmet_1.default)({
        contentSecurityPolicy: false,
        crossOriginResourcePolicy: { policy: 'cross-origin' },
    }));
    // Rate limiting for API routes
    const apiLimiter = (0, express_rate_limit_1.default)({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // Limit each IP to 100 requests per windowMs
        message: { error: 'Too many requests', retry_after: '15 minutes' },
        standardHeaders: true,
        legacyHeaders: false,
    });
    router.use(apiLimiter);
    // JSON parsing
    router.use(express_1.default.json());
    // Health check endpoint
    router.get('/health', (_req, res) => {
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
    router.get('/services', async (req, res) => {
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
                baseDomain: domain,
                serviceType: type,
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
        }
        catch (error) {
            console.error('Failed to get services:', error);
            res.status(500).json({
                error: 'Failed to retrieve services',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
    // Error handling middleware
    router.use((err, _req, res, _next) => {
        console.error('API Error:', err);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'An unexpected error occurred',
        });
    });
    // 404 handler for API routes
    router.use((_req, res) => {
        res.status(404).json({
            error: 'Not Found',
            message: 'The requested API endpoint does not exist',
            available_endpoints: ['/api/health', '/api/services'],
        });
    });
    return router;
}
