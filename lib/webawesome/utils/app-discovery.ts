import { exec } from 'child_process';
import { promisify } from 'util';
import type { AppMetadata } from './template-renderer.js';

const execAsync = promisify(exec);

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
 * App discovery service for finding available DangerPrep microapps
 */
export class AppDiscoveryService {
  private apps: AppMetadata[] = [];
  private lastScan = 0;
  private readonly scanInterval = 30000; // 30 seconds

  constructor() {
    this.scanApps();
  }

  /**
   * Get all discovered apps
   */
  async getApps(): Promise<AppMetadata[]> {
    // Refresh if cache is stale
    if (Date.now() - this.lastScan > this.scanInterval) {
      await this.scanApps();
    }
    
    return this.apps;
  }

  /**
   * Get apps by category
   */
  async getAppsByCategory(category: string): Promise<AppMetadata[]> {
    const apps = await this.getApps();
    return apps.filter(app => app.category === category);
  }

  /**
   * Get app by name
   */
  async getApp(name: string): Promise<AppMetadata | undefined> {
    const apps = await this.getApps();
    return apps.find(app => app.name === name);
  }

  /**
   * Scan Docker containers for app metadata
   */
  private async scanApps(): Promise<void> {
    try {
      const containers = await this.getDockerContainers();
      const discoveredApps: AppMetadata[] = [];

      for (const container of containers) {
        const app = this.extractAppMetadata(container);
        if (app) {
          discoveredApps.push(app);
        }
      }

      // Add default apps if not discovered
      const defaultApps = this.getDefaultApps();
      for (const defaultApp of defaultApps) {
        if (!discoveredApps.find(app => app.name === defaultApp.name)) {
          discoveredApps.push(defaultApp);
        }
      }

      this.apps = discoveredApps.sort((a, b) => a.name.localeCompare(b.name));
      this.lastScan = Date.now();
    } catch (error) {
      console.warn('Failed to scan for apps:', error);
      // Fallback to default apps
      this.apps = this.getDefaultApps();
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
            labels
          };
        });
    } catch (error) {
      console.warn('Failed to get Docker containers:', error);
      return [];
    }
  }

  /**
   * Extract app metadata from Docker container
   */
  private extractAppMetadata(container: DockerContainer): AppMetadata | null {
    const labels = container.labels;

    // Check if container has app registration
    if (!labels['app.register'] || labels['app.register'] !== 'true') {
      return null;
    }

    const name = labels['app.name'];
    const description = labels['app.description'];
    const icon = labels['app.icon'];
    const category = labels['app.category'];
    const url = labels['app.url'];

    if (!name || !description || !icon || !category || !url) {
      console.warn(`Container ${container.name} has incomplete app metadata`);
      return null;
    }

    // Determine status based on container status
    let status: 'healthy' | 'warning' | 'error' = 'healthy';
    if (container.status.includes('Exited') || container.status.includes('Dead')) {
      status = 'error';
    } else if (container.status.includes('Restarting') || container.status.includes('Paused')) {
      status = 'warning';
    }

    return {
      name,
      description,
      icon,
      url,
      category,
      version: labels['app.version'],
      status
    };
  }

  /**
   * Get default apps configuration
   */
  private getDefaultApps(): AppMetadata[] {
    return [
      {
        name: 'CDN Manager',
        description: 'Content Delivery Network Management',
        icon: 'rocket',
        url: 'https://cdn.danger',
        category: 'Infrastructure',
        status: 'healthy'
      },
      {
        name: 'Certificate Authority',
        description: 'SSL Certificate Management',
        icon: 'shield-check',
        url: 'https://ca.danger',
        category: 'Security',
        status: 'healthy'
      },
      {
        name: 'Media Server',
        description: 'Jellyfin Media Library',
        icon: 'play-circle',
        url: 'https://media.danger',
        category: 'Media',
        status: 'healthy'
      },
      {
        name: 'Knowledge Base',
        description: 'Kiwix Offline Content',
        icon: 'book',
        url: 'https://kiwix.danger',
        category: 'Content',
        status: 'healthy'
      },
      {
        name: 'Comics & Books',
        description: 'Komga Digital Library',
        icon: 'book-open',
        url: 'https://komga.danger',
        category: 'Content',
        status: 'healthy'
      },
      {
        name: 'Game Library',
        description: 'RomM Game Collection',
        icon: 'gamepad',
        url: 'https://romm.danger',
        category: 'Games',
        status: 'healthy'
      },
      {
        name: 'DNS Manager',
        description: 'AdGuard Home DNS',
        icon: 'globe',
        url: 'https://dns.danger',
        category: 'Infrastructure',
        status: 'healthy'
      },
      {
        name: 'Documentation',
        description: 'Docmost Knowledge Base',
        icon: 'file-text',
        url: 'https://docs.danger',
        category: 'Documentation',
        status: 'healthy'
      },
      {
        name: 'Development',
        description: 'OneDev Git Platform',
        icon: 'code-branch',
        url: 'https://dev.danger',
        category: 'Development',
        status: 'healthy'
      }
    ];
  }

  /**
   * Register a new app manually
   */
  registerApp(app: AppMetadata): void {
    const existingIndex = this.apps.findIndex(existing => existing.name === app.name);
    
    if (existingIndex >= 0) {
      this.apps[existingIndex] = app;
    } else {
      this.apps.push(app);
      this.apps.sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  /**
   * Unregister an app
   */
  unregisterApp(name: string): boolean {
    const index = this.apps.findIndex(app => app.name === name);
    
    if (index >= 0) {
      this.apps.splice(index, 1);
      return true;
    }
    
    return false;
  }

  /**
   * Get app categories
   */
  getCategories(): string[] {
    const categories = new Set(this.apps.map(app => app.category));
    return Array.from(categories).sort();
  }

  /**
   * Health check for app discovery service
   */
  getHealthStatus(): {
    status: 'healthy' | 'warning' | 'error';
    appsCount: number;
    lastScan: number;
    categories: string[];
  } {
    const now = Date.now();
    const timeSinceLastScan = now - this.lastScan;
    
    let status: 'healthy' | 'warning' | 'error' = 'healthy';
    
    if (timeSinceLastScan > this.scanInterval * 3) {
      status = 'error';
    } else if (timeSinceLastScan > this.scanInterval * 2) {
      status = 'warning';
    }

    return {
      status,
      appsCount: this.apps.length,
      lastScan: this.lastScan,
      categories: this.getCategories()
    };
  }
}

/**
 * Default app discovery service instance
 */
export const appDiscoveryService = new AppDiscoveryService();
