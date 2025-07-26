import type { HealthCheckResult } from '@dangerprep/health';
import { HealthStatus, ComponentStatus } from '@dangerprep/health';
import type { Logger } from '@dangerprep/logging';
import type { NotificationManager } from '@dangerprep/notifications';

import type {
  ServiceRegistryConfig,
  ServiceRegistration,
  ServiceDependency,
  ServiceCapability,
  ServiceDiscoveryQuery,
  ServiceRegistryStatus,
} from './types.js';

/**
 * Service registry for service discovery and coordination
 *
 * Features:
 * - Service registration/deregistration with metadata
 * - Health status tracking across services
 * - Service dependency management and resolution
 * - Event-driven service coordination
 * - Service lookup by name, type, or capabilities
 * - Health-aware service selection
 */
export class ServiceRegistry {
  private readonly logger: Logger;
  private readonly notificationManager: NotificationManager;
  private readonly config: ServiceRegistryConfig;

  private services = new Map<string, ServiceRegistration>();
  private healthStatus = new Map<string, HealthCheckResult>();
  private dependencies = new Map<string, ServiceDependency[]>();
  private capabilities = new Map<string, ServiceCapability[]>();
  private healthCheckInterval: NodeJS.Timeout | undefined;

  constructor(
    logger: Logger,
    notificationManager: NotificationManager,
    config: ServiceRegistryConfig = {}
  ) {
    this.logger = logger;
    this.notificationManager = notificationManager;
    this.config = {
      enableHealthMonitoring: true,
      healthCheckIntervalMs: 30000, // 30 seconds
      enableEventNotifications: true,
      autoCleanupOfflineServices: true,
      offlineTimeoutMs: 120000, // 2 minutes
      ...config,
    };

    // Start health monitoring if enabled
    if (this.config.enableHealthMonitoring) {
      this.startHealthMonitoring();
    }
  }

  /**
   * Register a service with the registry
   */
  async registerService(registration: ServiceRegistration): Promise<void> {
    const { serviceId, serviceName, serviceType, version, metadata } = registration;

    this.logger.info(`Registering service: ${serviceName} (${serviceId})`);

    // Store service registration
    this.services.set(serviceId, {
      ...registration,
      registeredAt: new Date(),
      lastSeen: new Date(),
    });

    // Store capabilities if provided
    if (registration.capabilities) {
      this.capabilities.set(serviceId, registration.capabilities);
    }

    // Store dependencies if provided
    if (registration.dependencies) {
      this.dependencies.set(serviceId, registration.dependencies);
    }

    // Send registration notification
    if (this.config.enableEventNotifications) {
      await this.notificationManager.info(`Service registered: ${serviceName}`, {
        source: 'ServiceRegistry',
        data: { serviceId, serviceName, serviceType, version, metadata },
      });
    }

    this.logger.info(`Service registered successfully: ${serviceName} (${serviceId})`);
  }

  /**
   * Deregister a service from the registry
   */
  async deregisterService(serviceId: string): Promise<boolean> {
    const service = this.services.get(serviceId);
    if (!service) {
      this.logger.warn(`Attempted to deregister unknown service: ${serviceId}`);
      return false;
    }

    this.logger.info(`Deregistering service: ${service.serviceName} (${serviceId})`);

    // Remove from all maps
    this.services.delete(serviceId);
    this.healthStatus.delete(serviceId);
    this.dependencies.delete(serviceId);
    this.capabilities.delete(serviceId);

    // Send deregistration notification
    if (this.config.enableEventNotifications) {
      await this.notificationManager.info(`Service deregistered: ${service.serviceName}`, {
        source: 'ServiceRegistry',
        data: { serviceId, serviceName: service.serviceName },
      });
    }

    this.logger.info(`Service deregistered successfully: ${service.serviceName} (${serviceId})`);
    return true;
  }

  /**
   * Update service health status
   */
  async updateServiceHealth(serviceId: string, healthResult: HealthCheckResult): Promise<void> {
    const service = this.services.get(serviceId);
    if (!service) {
      this.logger.warn(`Attempted to update health for unknown service: ${serviceId}`);
      return;
    }

    const previousHealth = this.healthStatus.get(serviceId);
    this.healthStatus.set(serviceId, healthResult);

    // Update last seen timestamp
    service.lastSeen = new Date();

    // Check if health status changed
    if (previousHealth && previousHealth.status !== healthResult.status) {
      this.logger.info(
        `Service health changed: ${service.serviceName} (${serviceId}) - ${previousHealth.status} -> ${healthResult.status}`
      );

      // Send health change notification
      if (this.config.enableEventNotifications) {
        await this.notificationManager.info(
          `Service health changed: ${service.serviceName} - ${healthResult.status}`,
          {
            source: 'ServiceRegistry',
            data: {
              serviceId,
              serviceName: service.serviceName,
              previousStatus: previousHealth.status,
              currentStatus: healthResult.status,
            },
          }
        );
      }
    }
  }

  /**
   * Find services by discovery query
   */
  findServices(query: ServiceDiscoveryQuery): ServiceRegistration[] {
    const results: ServiceRegistration[] = [];

    for (const [serviceId, service] of this.services.entries()) {
      let matches = true;

      // Filter by service name
      if (query.serviceName && service.serviceName !== query.serviceName) {
        matches = false;
      }

      // Filter by service type
      if (query.serviceType && service.serviceType !== query.serviceType) {
        matches = false;
      }

      // Filter by health status
      if (query.healthyOnly) {
        const health = this.healthStatus.get(serviceId);
        if (!health || health.status !== 'healthy') {
          matches = false;
        }
      }

      // Filter by capabilities
      if (query.requiredCapabilities && query.requiredCapabilities.length > 0) {
        const serviceCapabilities = this.capabilities.get(serviceId) || [];
        const hasAllCapabilities = query.requiredCapabilities.every(required =>
          serviceCapabilities.some(cap => cap.name === required)
        );
        if (!hasAllCapabilities) {
          matches = false;
        }
      }

      // Filter by metadata
      if (query.metadata) {
        for (const [key, value] of Object.entries(query.metadata)) {
          if (service.metadata?.[key] !== value) {
            matches = false;
            break;
          }
        }
      }

      if (matches) {
        results.push(service);
      }
    }

    return results;
  }

  /**
   * Get a specific service by ID
   */
  getService(serviceId: string): ServiceRegistration | undefined {
    return this.services.get(serviceId);
  }

  /**
   * Get all registered services
   */
  getAllServices(): ServiceRegistration[] {
    return Array.from(this.services.values());
  }

  /**
   * Get service health status
   */
  getServiceHealth(serviceId: string): HealthCheckResult | undefined {
    return this.healthStatus.get(serviceId);
  }

  /**
   * Get service dependencies
   */
  getServiceDependencies(serviceId: string): ServiceDependency[] {
    return this.dependencies.get(serviceId) || [];
  }

  /**
   * Get service capabilities
   */
  getServiceCapabilities(serviceId: string): ServiceCapability[] {
    return this.capabilities.get(serviceId) || [];
  }

  /**
   * Resolve service dependencies and return startup order
   */
  resolveDependencyOrder(serviceIds?: string[]): string[] {
    const servicesToOrder = serviceIds || Array.from(this.services.keys());
    const resolved: string[] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const visit = (serviceId: string): void => {
      if (visited.has(serviceId)) return;
      if (visiting.has(serviceId)) {
        throw new Error(`Circular dependency detected involving service: ${serviceId}`);
      }

      visiting.add(serviceId);

      const deps = this.dependencies.get(serviceId) || [];
      for (const dep of deps) {
        if (servicesToOrder.includes(dep.serviceId)) {
          visit(dep.serviceId);
        }
      }

      visiting.delete(serviceId);
      visited.add(serviceId);
      resolved.push(serviceId);
    };

    for (const serviceId of servicesToOrder) {
      visit(serviceId);
    }

    return resolved;
  }

  /**
   * Get registry status
   */
  getStatus(): ServiceRegistryStatus {
    const totalServices = this.services.size;
    const healthyServices = Array.from(this.healthStatus.values()).filter(
      health => health.status === HealthStatus.HEALTHY
    ).length;
    const unhealthyServices = Array.from(this.healthStatus.values()).filter(
      health => health.status !== HealthStatus.HEALTHY
    ).length;

    return {
      totalServices,
      healthyServices,
      unhealthyServices,
      unknownHealthServices: totalServices - healthyServices - unhealthyServices,
      services: Array.from(this.services.values()).map(service => ({
        serviceId: service.serviceId,
        serviceName: service.serviceName,
        serviceType: service.serviceType,
        health: this.healthStatus.get(service.serviceId)?.status || 'unknown',
        registeredAt: service.registeredAt,
        lastSeen: service.lastSeen,
      })),
    };
  }

  /**
   * Cleanup and shutdown the registry
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up service registry');

    // Stop health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    // Clear all data
    this.services.clear();
    this.healthStatus.clear();
    this.dependencies.clear();
    this.capabilities.clear();

    this.logger.info('Service registry cleanup completed');
  }

  /**
   * Start health monitoring for registered services
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, this.config.healthCheckIntervalMs);
  }

  /**
   * Perform health checks on all registered services
   */
  private async performHealthChecks(): Promise<void> {
    const now = new Date();

    for (const [serviceId, service] of this.services.entries()) {
      try {
        // Check if service has been offline too long
        if (this.config.autoCleanupOfflineServices && this.config.offlineTimeoutMs) {
          const timeSinceLastSeen = now.getTime() - service.lastSeen.getTime();
          if (timeSinceLastSeen > this.config.offlineTimeoutMs) {
            this.logger.warn(
              `Service ${service.serviceName} (${serviceId}) has been offline for ${timeSinceLastSeen}ms, removing from registry`
            );
            await this.deregisterService(serviceId);
            continue;
          }
        }

        // If service provides a health check endpoint, we could call it here
        // For now, we'll just mark services as healthy if they've been seen recently
        const timeSinceLastSeen = now.getTime() - service.lastSeen.getTime();
        const isHealthy = timeSinceLastSeen < (this.config.healthCheckIntervalMs || 30000) * 2;

        const healthResult: HealthCheckResult = {
          status: isHealthy ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY,
          timestamp: now,
          service: service.serviceName,
          version: service.version,
          components: [
            {
              name: 'last_seen',
              status: isHealthy ? ComponentStatus.UP : ComponentStatus.DOWN,
              message: isHealthy
                ? 'Service recently active'
                : `Service not seen for ${timeSinceLastSeen}ms`,
              lastChecked: now,
            },
          ],
          duration: 0,
          errors: isHealthy ? [] : [`Service not seen for ${timeSinceLastSeen}ms`],
          warnings: [],
        };

        await this.updateServiceHealth(serviceId, healthResult);
      } catch (error) {
        this.logger.error(
          `Error during health check for service ${service.serviceName} (${serviceId}): ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  }
}
