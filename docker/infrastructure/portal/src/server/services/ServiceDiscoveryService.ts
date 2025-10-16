import Docker from 'dockerode';
import { LoggerFactory, LogLevel } from '@dangerprep/logging';

/**
 * Service metadata for portal display
 */
export interface ServiceMetadata {
  name: string;
  description: string;
  icon: string;
  url?: string;
  type: 'public' | 'private' | 'maintenance';
  status: 'healthy' | 'warning' | 'error';
  version?: string;
}

/**
 * Docker container information
 */
interface DockerContainer {
  name: string;
  labels: Record<string, string>;
  status: string;
  ports: string[];
}

/**
 * Service discovery options
 */
interface ServiceDiscoveryOptions {
  baseDomain?: string;
  serviceType?: string;
}

/**
 * Service discovery service for finding available DangerPrep services
 */
export class ServiceDiscoveryService {
  private services: ServiceMetadata[] = [];
  private lastScan = 0;
  private readonly scanInterval = 30000; // 30 seconds
  private docker: Docker;
  private logger = LoggerFactory.createStructuredLogger(
    'ServiceDiscoveryService',
    '/var/log/dangerprep/portal.log',
    process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO
  );

  constructor() {
    this.logger.info('Initializing service discovery');
    // Initialize Docker client with socket path
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
    this.logger.debug('Docker client initialized', {
      socketPath: '/var/run/docker.sock',
    });
    this.scanServices();
  }

  /**
   * Get all discovered services
   */
  async getServices(options: ServiceDiscoveryOptions = {}): Promise<ServiceMetadata[]> {
    this.logger.debug('getServices called', { options });

    // Refresh if cache is stale
    const cacheAge = Date.now() - this.lastScan;
    const isStale = cacheAge > this.scanInterval;
    this.logger.debug('Cache check', {
      age: `${cacheAge}ms`,
      stale: isStale,
      interval: `${this.scanInterval}ms`,
    });

    if (isStale) {
      this.logger.debug('Cache is stale, rescanning services');
      await this.scanServices(options.baseDomain);
    } else {
      this.logger.debug('Using cached services');
    }

    let services = this.services;
    this.logger.debug('Initial services count', { count: services.length });

    // Filter by service type if specified
    if (options.serviceType && options.serviceType !== 'all') {
      const originalCount = services.length;
      services = services.filter(service => service.type === options.serviceType);
      this.logger.debug('Filtered by type', {
        type: options.serviceType,
        before: originalCount,
        after: services.length,
      });
    }

    // Override domain if specified
    if (options.baseDomain) {
      this.logger.debug('Overriding domain', { domain: options.baseDomain });
      services = services.map(service => {
        const updatedService: ServiceMetadata = {
          ...service,
        };
        if (service.url && options.baseDomain) {
          const originalUrl = service.url;
          updatedService.url = this.replaceBaseDomain(service.url, options.baseDomain);
          this.logger.debug('Updated URL', {
            service: service.name,
            from: originalUrl,
            to: updatedService.url,
          });
        }
        return updatedService;
      });
    }

    this.logger.debug('Returning services', {
      count: services.length,
      services: services.map(s => ({
        name: s.name,
        type: s.type,
        status: s.status,
        url: s.url,
      })),
    });
    return services;
  }

  /**
   * Get default base domain from environment
   */
  getDefaultDomain(): string {
    const domain = process.env.VITE_BASE_DOMAIN || 'danger';
    this.logger.debug('Default domain', { domain });
    return domain;
  }

  /**
   * Scan Docker containers for service metadata
   */
  private async scanServices(overrideDomain?: string): Promise<void> {
    this.logger.debug('Starting service scan', {
      overrideDomain: overrideDomain || 'none',
    });

    try {
      const containers = await this.getDockerContainers();
      this.logger.debug('Found Docker containers', { count: containers.length });

      const discoveredServices: ServiceMetadata[] = [];

      for (const container of containers) {
        this.logger.debug('Processing container', {
          name: container.name,
          status: container.status,
          labels: container.labels,
        });

        const service = this.extractServiceMetadata(container, overrideDomain);
        if (service) {
          this.logger.debug('Extracted service metadata', { service });
          discoveredServices.push(service);
        } else {
          this.logger.debug('No service metadata found for container', {
            name: container.name,
          });
        }
      }

      this.services = discoveredServices.sort((a, b) => a.name.localeCompare(b.name));
      this.lastScan = Date.now();
      this.logger.debug('Scan complete', {
        count: discoveredServices.length,
        services: discoveredServices.map(s => s.name),
      });
    } catch (error) {
      this.logger.error('Failed to scan for services', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Keep existing services on error
      this.lastScan = Date.now();
      this.logger.debug('Keeping existing services after scan failure', {
        count: this.services.length,
      });
    }
  }

  /**
   * Get Docker containers with labels using Docker API
   */
  private async getDockerContainers(): Promise<DockerContainer[]> {
    this.logger.debug('Fetching Docker containers');

    try {
      const containers = await this.docker.listContainers();
      this.logger.debug('Docker API returned containers', { count: containers.length });

      const mappedContainers = containers.map(container => {
        const name = container.Names?.[0]?.replace(/^\//, '') || '';
        const status = container.Status || '';
        const ports =
          container.Ports?.map(port =>
            port.PublicPort ? `${port.PublicPort}:${port.PrivatePort}` : `${port.PrivatePort}`
          ) || [];
        const labels = container.Labels || {};

        this.logger.debug('Mapped container', {
          name,
          status,
          ports: ports.join(', '),
        });

        return {
          name,
          status,
          ports,
          labels,
        };
      });

      this.logger.debug('Successfully mapped containers', {
        count: mappedContainers.length,
      });
      return mappedContainers;
    } catch (error) {
      this.logger.error('Failed to get Docker containers', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return [];
    }
  }

  /**
   * Extract service metadata from Docker container
   */
  private extractServiceMetadata(
    container: DockerContainer,
    overrideDomain?: string
  ): ServiceMetadata | null {
    this.logger.debug('Extracting metadata for container', { name: container.name });
    const labels = container.labels;

    // Check if container has service metadata
    const serviceName = labels['service.name'];
    const serviceDescription = labels['service.description'];
    const serviceIcon = labels['service.icon'];
    const serviceType = labels['service.type'] as 'public' | 'private' | 'maintenance';

    this.logger.debug('Service labels found', {
      name: serviceName,
      description: serviceDescription,
      icon: serviceIcon,
      type: serviceType,
    });

    // Skip if missing required service metadata
    if (!serviceName || !serviceDescription || !serviceType) {
      this.logger.debug('Skipping container - missing required service metadata', {
        container: container.name,
        hasName: !!serviceName,
        hasDescription: !!serviceDescription,
        hasType: !!serviceType,
      });
      return null;
    }

    // Determine status based on container status
    let status: 'healthy' | 'warning' | 'error' = 'healthy';
    if (container.status.includes('Exited') || container.status.includes('Dead')) {
      status = 'error';
    } else if (container.status.includes('Restarting') || container.status.includes('Paused')) {
      status = 'warning';
    }
    this.logger.debug('Determined status', {
      service: serviceName,
      status,
      containerStatus: container.status,
    });

    // Build URL if service is web-accessible
    let url: string | undefined;
    const dnsRegister = labels['dns.register'];
    const traefikEnabled = labels['traefik.enable'] === 'true';

    this.logger.debug('URL building', {
      service: serviceName,
      dnsRegister,
      traefikEnabled,
      overrideDomain,
    });

    if (dnsRegister && traefikEnabled) {
      const baseDomain = overrideDomain || this.getDefaultDomain();
      url = `https://${dnsRegister}.${baseDomain}`;
      this.logger.debug('Built URL', { service: serviceName, url });
    } else {
      this.logger.debug('No URL built', {
        service: serviceName,
        hasDnsRegister: !!dnsRegister,
        traefikEnabled,
      });
    }

    const metadata: ServiceMetadata = {
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
      this.logger.debug('Added version', {
        version: labels['service.version'],
        service: serviceName,
      });
    }

    this.logger.debug('Created service metadata', {
      service: serviceName,
      metadata,
    });
    return metadata;
  }

  /**
   * Replace base domain in URL
   */
  private replaceBaseDomain(url: string, newBaseDomain: string): string {
    this.logger.debug('Replacing base domain in URL', {
      url,
      newBaseDomain,
    });

    try {
      const urlObj = new URL(url);
      const originalHostname = urlObj.hostname;
      const parts = urlObj.hostname.split('.');

      this.logger.debug('Original hostname parts', { parts });

      if (parts.length >= 2) {
        // Replace everything after the first part (subdomain)
        parts.splice(1);
        parts.push(newBaseDomain);
        urlObj.hostname = parts.join('.');

        this.logger.debug('Updated hostname', {
          from: originalHostname,
          to: urlObj.hostname,
        });
      }

      const newUrl = urlObj.toString();
      this.logger.debug('Final URL', { url: newUrl });
      return newUrl;
    } catch (error) {
      this.logger.error('Failed to parse URL', {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      return url; // Return original URL if parsing fails
    }
  }
}
