"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceDiscoveryService = void 0;
const dockerode_1 = __importDefault(require("dockerode"));
const index_1 = require("../../../../../../packages/logging/dist/index");
/**
 * Service discovery service for finding available DangerPrep services
 */
class ServiceDiscoveryService {
    constructor() {
        this.services = [];
        this.lastScan = 0;
        this.scanInterval = 30000; // 30 seconds
        this.logger = index_1.LoggerFactory.createStructuredLogger('ServiceDiscoveryService', '/var/log/dangerprep/portal.log', process.env.NODE_ENV === 'development' ? index_1.LogLevel.DEBUG : index_1.LogLevel.INFO);
        this.logger.info('Initializing service discovery');
        // Initialize Docker client with socket path
        this.docker = new dockerode_1.default({ socketPath: '/var/run/docker.sock' });
        this.logger.debug('Docker client initialized', {
            socketPath: '/var/run/docker.sock'
        });
        this.scanServices();
    }
    /**
     * Get all discovered services
     */
    async getServices(options = {}) {
        console.log('[ServiceDiscovery] getServices called with options:', JSON.stringify(options));
        // Refresh if cache is stale
        const cacheAge = Date.now() - this.lastScan;
        const isStale = cacheAge > this.scanInterval;
        console.log(`[ServiceDiscovery] Cache age: ${cacheAge}ms, stale: ${isStale}, interval: ${this.scanInterval}ms`);
        if (isStale) {
            console.log('[ServiceDiscovery] Cache is stale, rescanning services...');
            await this.scanServices(options.baseDomain);
        }
        else {
            console.log('[ServiceDiscovery] Using cached services');
        }
        let services = this.services;
        console.log(`[ServiceDiscovery] Initial services count: ${services.length}`);
        // Filter by service type if specified
        if (options.serviceType && options.serviceType !== 'all') {
            const originalCount = services.length;
            services = services.filter(service => service.type === options.serviceType);
            console.log(`[ServiceDiscovery] Filtered by type '${options.serviceType}': ${originalCount} -> ${services.length} services`);
        }
        // Override domain if specified
        if (options.baseDomain) {
            console.log(`[ServiceDiscovery] Overriding domain to: ${options.baseDomain}`);
            services = services.map(service => {
                const updatedService = {
                    ...service,
                };
                if (service.url && options.baseDomain) {
                    const originalUrl = service.url;
                    updatedService.url = this.replaceBaseDomain(service.url, options.baseDomain);
                    console.log(`[ServiceDiscovery] Updated URL for ${service.name}: ${originalUrl} -> ${updatedService.url}`);
                }
                return updatedService;
            });
        }
        console.log(`[ServiceDiscovery] Returning ${services.length} services:`, services.map(s => ({ name: s.name, type: s.type, status: s.status, url: s.url })));
        return services;
    }
    /**
     * Get default base domain from environment
     */
    getDefaultDomain() {
        const domain = process.env.VITE_BASE_DOMAIN || 'danger';
        console.log(`[ServiceDiscovery] Default domain: ${domain}`);
        return domain;
    }
    /**
     * Scan Docker containers for service metadata
     */
    async scanServices(overrideDomain) {
        console.log(`[ServiceDiscovery] Starting service scan${overrideDomain ? ` with override domain: ${overrideDomain}` : ''}`);
        try {
            const containers = await this.getDockerContainers();
            console.log(`[ServiceDiscovery] Found ${containers.length} Docker containers`);
            const discoveredServices = [];
            for (const container of containers) {
                console.log(`[ServiceDiscovery] Processing container: ${container.name}`);
                console.log(`[ServiceDiscovery] Container status: ${container.status}`);
                console.log(`[ServiceDiscovery] Container labels:`, JSON.stringify(container.labels, null, 2));
                const service = this.extractServiceMetadata(container, overrideDomain);
                if (service) {
                    console.log(`[ServiceDiscovery] Extracted service metadata:`, JSON.stringify(service, null, 2));
                    discoveredServices.push(service);
                }
                else {
                    console.log(`[ServiceDiscovery] No service metadata found for container: ${container.name}`);
                }
            }
            this.services = discoveredServices.sort((a, b) => a.name.localeCompare(b.name));
            this.lastScan = Date.now();
            console.log(`[ServiceDiscovery] Scan complete. Discovered ${discoveredServices.length} services:`, discoveredServices.map(s => s.name));
        }
        catch (error) {
            console.error('[ServiceDiscovery] Failed to scan for services:', error);
            console.error('[ServiceDiscovery] Error details:', {
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
            });
            // Keep existing services on error
            this.lastScan = Date.now();
            console.log(`[ServiceDiscovery] Keeping ${this.services.length} existing services after scan failure`);
        }
    }
    /**
     * Get Docker containers with labels using Docker API
     */
    async getDockerContainers() {
        console.log('[ServiceDiscovery] Fetching Docker containers...');
        try {
            const containers = await this.docker.listContainers();
            console.log(`[ServiceDiscovery] Docker API returned ${containers.length} containers`);
            const mappedContainers = containers.map(container => {
                const name = container.Names?.[0]?.replace(/^\//, '') || '';
                const status = container.Status || '';
                const ports = container.Ports?.map(port => port.PublicPort ? `${port.PublicPort}:${port.PrivatePort}` : `${port.PrivatePort}`) || [];
                const labels = container.Labels || {};
                console.log(`[ServiceDiscovery] Mapped container: ${name}, status: ${status}, ports: [${ports.join(', ')}]`);
                return {
                    name,
                    status,
                    ports,
                    labels,
                };
            });
            console.log(`[ServiceDiscovery] Successfully mapped ${mappedContainers.length} containers`);
            return mappedContainers;
        }
        catch (error) {
            console.error('[ServiceDiscovery] Failed to get Docker containers:', error);
            console.error('[ServiceDiscovery] Docker API error details:', {
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
            });
            return [];
        }
    }
    /**
     * Extract service metadata from Docker container
     */
    extractServiceMetadata(container, overrideDomain) {
        console.log(`[ServiceDiscovery] Extracting metadata for container: ${container.name}`);
        const labels = container.labels;
        // Check if container has service metadata
        const serviceName = labels['service.name'];
        const serviceDescription = labels['service.description'];
        const serviceIcon = labels['service.icon'];
        const serviceType = labels['service.type'];
        console.log(`[ServiceDiscovery] Service labels found:`, {
            name: serviceName,
            description: serviceDescription,
            icon: serviceIcon,
            type: serviceType
        });
        // Skip if missing required service metadata
        if (!serviceName || !serviceDescription || !serviceType) {
            console.log(`[ServiceDiscovery] Skipping container ${container.name} - missing required service metadata`);
            console.log(`[ServiceDiscovery] Required fields: name=${!!serviceName}, description=${!!serviceDescription}, type=${!!serviceType}`);
            return null;
        }
        // Determine status based on container status
        let status = 'healthy';
        if (container.status.includes('Exited') || container.status.includes('Dead')) {
            status = 'error';
        }
        else if (container.status.includes('Restarting') || container.status.includes('Paused')) {
            status = 'warning';
        }
        console.log(`[ServiceDiscovery] Determined status for ${serviceName}: ${status} (container status: ${container.status})`);
        // Build URL if service is web-accessible
        let url;
        const dnsRegister = labels['dns.register'];
        const traefikEnabled = labels['traefik.enable'] === 'true';
        console.log(`[ServiceDiscovery] URL building for ${serviceName}:`, {
            dnsRegister,
            traefikEnabled,
            overrideDomain
        });
        if (dnsRegister && traefikEnabled) {
            const baseDomain = overrideDomain || this.getDefaultDomain();
            url = `https://${dnsRegister}.${baseDomain}`;
            console.log(`[ServiceDiscovery] Built URL for ${serviceName}: ${url}`);
        }
        else {
            console.log(`[ServiceDiscovery] No URL built for ${serviceName} - dnsRegister: ${!!dnsRegister}, traefikEnabled: ${traefikEnabled}`);
        }
        const metadata = {
            name: serviceName,
            description: serviceDescription,
            icon: serviceIcon || 'question-circle',
            type: serviceType,
            status,
        };
        // Add URL if available
        if (url) {
            metadata.url = url;
        }
        // Add version if available
        if (labels['service.version']) {
            metadata.version = labels['service.version'];
            console.log(`[ServiceDiscovery] Added version ${labels['service.version']} to ${serviceName}`);
        }
        console.log(`[ServiceDiscovery] Created service metadata for ${serviceName}:`, JSON.stringify(metadata, null, 2));
        return metadata;
    }
    /**
     * Replace base domain in URL
     */
    replaceBaseDomain(url, newBaseDomain) {
        console.log(`[ServiceDiscovery] Replacing base domain in URL: ${url} -> ${newBaseDomain}`);
        try {
            const urlObj = new URL(url);
            const originalHostname = urlObj.hostname;
            const parts = urlObj.hostname.split('.');
            console.log(`[ServiceDiscovery] Original hostname parts:`, parts);
            if (parts.length >= 2) {
                // Replace everything after the first part (subdomain)
                parts.splice(1);
                parts.push(newBaseDomain);
                urlObj.hostname = parts.join('.');
                console.log(`[ServiceDiscovery] Updated hostname: ${originalHostname} -> ${urlObj.hostname}`);
            }
            const newUrl = urlObj.toString();
            console.log(`[ServiceDiscovery] Final URL: ${newUrl}`);
            return newUrl;
        }
        catch (error) {
            console.error(`[ServiceDiscovery] Failed to parse URL ${url}:`, error);
            return url; // Return original URL if parsing fails
        }
    }
}
exports.ServiceDiscoveryService = ServiceDiscoveryService;
