import type { Logger } from '@dangerprep/logging';

import { ServiceRegistry } from './registry.js';
import type { ServiceRegistration, ServiceDependency, ServiceDiscoveryQuery } from './types.js';

/**
 * Service discovery patterns and utilities
 *
 * Provides common patterns for service discovery including:
 * - Service lookup by name, type, or capabilities
 * - Health-aware service selection
 * - Dependency resolution and startup ordering
 * - Cross-service communication patterns
 */
export class ServiceDiscoveryPatterns {
  /**
   * Find the best available service instance for a given service name
   */
  static findBestService(
    registry: ServiceRegistry,
    serviceName: string,
    options: {
      /** Prefer healthy services */
      preferHealthy?: boolean;
      /** Required capabilities */
      requiredCapabilities?: string[];
      /** Metadata filters */
      metadata?: Record<string, unknown>;
    } = {}
  ): ServiceRegistration | undefined {
    const { preferHealthy = true, requiredCapabilities, metadata } = options;

    const query: ServiceDiscoveryQuery = {
      serviceName,
      healthyOnly: preferHealthy,
      ...(requiredCapabilities && { requiredCapabilities }),
      ...(metadata && { metadata }),
    };

    const services = registry.findServices(query);

    if (services.length === 0) {
      // If no healthy services found and we were preferring healthy, try again without health filter
      if (preferHealthy) {
        return this.findBestService(registry, serviceName, {
          ...options,
          preferHealthy: false,
        });
      }
      return undefined;
    }

    // Return the most recently seen service
    return services.sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime())[0];
  }

  /**
   * Find all services of a specific type
   */
  static findServicesByType(
    registry: ServiceRegistry,
    serviceType: string,
    options: {
      /** Only return healthy services */
      healthyOnly?: boolean;
      /** Required capabilities */
      requiredCapabilities?: string[];
      /** Maximum number of results */
      limit?: number;
    } = {}
  ): ServiceRegistration[] {
    const { healthyOnly = false, requiredCapabilities, limit } = options;

    const query: ServiceDiscoveryQuery = {
      serviceType,
      healthyOnly,
      ...(requiredCapabilities && { requiredCapabilities }),
      ...(limit && { limit }),
    };

    const services = registry.findServices(query);

    // Sort by health status (healthy first) and then by last seen
    return services.sort((a, b) => {
      const aHealth = registry.getServiceHealth(a.serviceId);
      const bHealth = registry.getServiceHealth(b.serviceId);

      // Healthy services first
      if (aHealth?.status === 'healthy' && bHealth?.status !== 'healthy') return -1;
      if (bHealth?.status === 'healthy' && aHealth?.status !== 'healthy') return 1;

      // Then by most recently seen
      return b.lastSeen.getTime() - a.lastSeen.getTime();
    });
  }

  /**
   * Find services with specific capabilities
   */
  static findServicesByCapability(
    registry: ServiceRegistry,
    capabilityName: string,
    options: {
      /** Minimum capability version */
      minVersion?: string;
      /** Only return healthy services */
      healthyOnly?: boolean;
      /** Maximum number of results */
      limit?: number;
    } = {}
  ): ServiceRegistration[] {
    const { minVersion, healthyOnly = false, limit } = options;

    const query: ServiceDiscoveryQuery = {
      requiredCapabilities: [capabilityName],
      healthyOnly,
      ...(limit && { limit }),
    };

    let services = registry.findServices(query);

    // Filter by minimum version if specified
    if (minVersion) {
      services = services.filter(service => {
        const capabilities = registry.getServiceCapabilities(service.serviceId);
        const capability = capabilities.find(cap => cap.name === capabilityName);
        return capability && this.compareVersions(capability.version, minVersion) >= 0;
      });
    }

    return services.sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime());
  }

  /**
   * Get service dependency chain in startup order
   */
  static getStartupOrder(
    registry: ServiceRegistry,
    serviceIds?: string[],
    logger?: Logger
  ): string[] {
    try {
      return registry.resolveDependencyOrder(serviceIds);
    } catch (error) {
      logger?.error(
        `Failed to resolve dependency order: ${error instanceof Error ? error.message : String(error)}`
      );
      // Return services in registration order as fallback
      return serviceIds || registry.getAllServices().map(s => s.serviceId);
    }
  }

  /**
   * Check if all dependencies for a service are available and healthy
   */
  static checkDependencies(
    registry: ServiceRegistry,
    serviceId: string,
    options: {
      /** Require dependencies to be healthy */
      requireHealthy?: boolean;
      /** Check transitive dependencies */
      recursive?: boolean;
    } = {}
  ): {
    satisfied: boolean;
    missing: ServiceDependency[];
    unhealthy: ServiceDependency[];
    available: ServiceDependency[];
  } {
    const { requireHealthy = true, recursive = false } = options;
    const dependencies = registry.getServiceDependencies(serviceId);

    const missing: ServiceDependency[] = [];
    const unhealthy: ServiceDependency[] = [];
    const available: ServiceDependency[] = [];

    for (const dep of dependencies) {
      const depService = registry.getService(dep.serviceId);

      if (!depService) {
        missing.push(dep);
        continue;
      }

      if (requireHealthy) {
        const health = registry.getServiceHealth(dep.serviceId);
        if (!health || health.status !== 'healthy') {
          unhealthy.push(dep);
          continue;
        }
      }

      available.push(dep);

      // Check transitive dependencies if recursive
      if (recursive) {
        const transitive = this.checkDependencies(registry, dep.serviceId, options);
        if (!transitive.satisfied) {
          missing.push(...transitive.missing);
          unhealthy.push(...transitive.unhealthy);
        }
      }
    }

    return {
      satisfied: missing.length === 0 && unhealthy.length === 0,
      missing,
      unhealthy,
      available,
    };
  }

  /**
   * Find services that depend on a given service
   */
  static findDependentServices(
    registry: ServiceRegistry,
    serviceId: string
  ): ServiceRegistration[] {
    const allServices = registry.getAllServices();
    const dependents: ServiceRegistration[] = [];

    for (const service of allServices) {
      const dependencies = registry.getServiceDependencies(service.serviceId);
      if (dependencies.some(dep => dep.serviceId === serviceId)) {
        dependents.push(service);
      }
    }

    return dependents;
  }

  /**
   * Create a service endpoint URL
   */
  static createServiceUrl(service: ServiceRegistration, path?: string): string | undefined {
    if (!service.endpoint) {
      return undefined;
    }

    const { protocol, host, port, path: basePath } = service.endpoint;
    const fullPath = basePath && path ? `${basePath}${path}` : path || basePath || '';

    return `${protocol}://${host}:${port}${fullPath}`;
  }

  /**
   * Wait for a service to become available
   */
  static async waitForService(
    registry: ServiceRegistry,
    serviceName: string,
    options: {
      /** Maximum wait time in milliseconds */
      timeoutMs?: number;
      /** Check interval in milliseconds */
      intervalMs?: number;
      /** Require service to be healthy */
      requireHealthy?: boolean;
      /** Required capabilities */
      requiredCapabilities?: string[];
    } = {},
    logger?: Logger
  ): Promise<ServiceRegistration | undefined> {
    const {
      timeoutMs = 30000, // 30 seconds
      intervalMs = 1000, // 1 second
      requireHealthy = true,
      requiredCapabilities,
    } = options;

    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const service = this.findBestService(registry, serviceName, {
        preferHealthy: requireHealthy,
        ...(requiredCapabilities && { requiredCapabilities }),
      });

      if (service) {
        logger?.info(`Service ${serviceName} is now available`);
        return service;
      }

      logger?.debug(`Waiting for service ${serviceName}...`);
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    logger?.warn(`Timeout waiting for service ${serviceName} after ${timeoutMs}ms`);
    return undefined;
  }

  /**
   * Get service load balancing candidates
   */
  static getLoadBalancingCandidates(
    registry: ServiceRegistry,
    serviceName: string,
    options: {
      /** Only include healthy services */
      healthyOnly?: boolean;
      /** Required capabilities */
      requiredCapabilities?: string[];
      /** Maximum number of candidates */
      maxCandidates?: number;
    } = {}
  ): ServiceRegistration[] {
    const { healthyOnly = true, requiredCapabilities, maxCandidates } = options;

    const query: ServiceDiscoveryQuery = {
      serviceName,
      healthyOnly,
      ...(requiredCapabilities && { requiredCapabilities }),
      ...(maxCandidates && { limit: maxCandidates }),
    };

    const services = registry.findServices(query);

    // Sort by health and load (for now, just use last seen as a proxy)
    return services.sort((a, b) => {
      const aHealth = registry.getServiceHealth(a.serviceId);
      const bHealth = registry.getServiceHealth(b.serviceId);

      // Healthy services first
      if (aHealth?.status === 'healthy' && bHealth?.status !== 'healthy') return -1;
      if (bHealth?.status === 'healthy' && aHealth?.status !== 'healthy') return 1;

      // Then by most recently seen (assuming less loaded services update more frequently)
      return b.lastSeen.getTime() - a.lastSeen.getTime();
    });
  }

  /**
   * Compare semantic versions
   */
  private static compareVersions(version1: string, version2: string): number {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);
    const maxLength = Math.max(v1Parts.length, v2Parts.length);

    for (let i = 0; i < maxLength; i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;

      if (v1Part > v2Part) return 1;
      if (v1Part < v2Part) return -1;
    }

    return 0;
  }
}
