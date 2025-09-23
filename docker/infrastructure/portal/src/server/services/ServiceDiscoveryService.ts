import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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

  constructor() {
    this.scanServices();
  }

  /**
   * Get all discovered services
   */
  async getServices(options: ServiceDiscoveryOptions = {}): Promise<ServiceMetadata[]> {
    // Refresh if cache is stale
    if (Date.now() - this.lastScan > this.scanInterval) {
      await this.scanServices(options.baseDomain);
    }

    let services = this.services;

    // Filter by service type if specified
    if (options.serviceType && options.serviceType !== 'all') {
      services = services.filter(service => service.type === options.serviceType);
    }

    // Override domain if specified
    if (options.baseDomain) {
      services = services.map(service => {
        const updatedService: ServiceMetadata = {
          ...service,
        };
        if (service.url && options.baseDomain) {
          updatedService.url = this.replaceBaseDomain(service.url, options.baseDomain);
        }
        return updatedService;
      });
    }

    return services;
  }

  /**
   * Get default base domain from environment
   */
  getDefaultDomain(): string {
    return process.env.VITE_BASE_DOMAIN || 'danger';
  }

  /**
   * Scan Docker containers for service metadata
   */
  private async scanServices(overrideDomain?: string): Promise<void> {
    try {
      const containers = await this.getDockerContainers();
      const discoveredServices: ServiceMetadata[] = [];

      for (const container of containers) {
        const service = this.extractServiceMetadata(container, overrideDomain);
        if (service) {
          discoveredServices.push(service);
        }
      }

      this.services = discoveredServices.sort((a, b) => a.name.localeCompare(b.name));
      this.lastScan = Date.now();
    } catch (error) {
      console.warn('Failed to scan for services:', error);
      // Keep existing services on error
      this.lastScan = Date.now();
    }
  }

  /**
   * Get Docker containers with labels
   */
  private async getDockerContainers(): Promise<DockerContainer[]> {
    try {
      const { stdout } = await execAsync(
        'docker ps --format "{{.Names}}|{{.Status}}|{{.Ports}}|{{.Labels}}"'
      );

      return stdout
        .trim()
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          const [name, status, ports, labelsStr] = line.split('|');
          const labels: Record<string, string> = {};

          // Parse labels
          if (labelsStr) {
            labelsStr.split(',').forEach(label => {
              const [key, value] = label.split('=', 2);
              if (key && value) {
                labels[key] = value;
              }
            });
          }

          return {
            name: name || '',
            status: status || '',
            ports: ports ? ports.split(',') : [],
            labels,
          };
        });
    } catch (error) {
      console.warn('Failed to get Docker containers:', error);
      return [];
    }
  }

  /**
   * Extract service metadata from Docker container
   */
  private extractServiceMetadata(container: DockerContainer, overrideDomain?: string): ServiceMetadata | null {
    const labels = container.labels;

    // Check if container has service metadata
    const serviceName = labels['service.name'];
    const serviceDescription = labels['service.description'];
    const serviceIcon = labels['service.icon'];
    const serviceType = labels['service.type'] as 'public' | 'private' | 'maintenance';

    // Skip if missing required service metadata
    if (!serviceName || !serviceDescription || !serviceType) {
      return null;
    }

    // Determine status based on container status
    let status: 'healthy' | 'warning' | 'error' = 'healthy';
    if (container.status.includes('Exited') || container.status.includes('Dead')) {
      status = 'error';
    } else if (container.status.includes('Restarting') || container.status.includes('Paused')) {
      status = 'warning';
    }

    // Build URL if service is web-accessible
    let url: string | undefined;
    const dnsRegister = labels['dns.register'];
    const traefikEnabled = labels['traefik.enable'] === 'true';
    
    if (dnsRegister && traefikEnabled) {
      const baseDomain = overrideDomain || this.getDefaultDomain();
      url = `https://${dnsRegister}.${baseDomain}`;
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
    }

    return metadata;
  }

  /**
   * Replace base domain in URL
   */
  private replaceBaseDomain(url: string, newBaseDomain: string): string {
    try {
      const urlObj = new URL(url);
      const parts = urlObj.hostname.split('.');
      if (parts.length >= 2) {
        // Replace everything after the first part (subdomain)
        parts.splice(1);
        parts.push(newBaseDomain);
        urlObj.hostname = parts.join('.');
      }
      return urlObj.toString();
    } catch {
      return url; // Return original URL if parsing fails
    }
  }
}
