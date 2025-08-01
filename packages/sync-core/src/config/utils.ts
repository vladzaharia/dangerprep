import { z } from '@dangerprep/configuration';

/**
 * Utility functions for sync configuration management
 */
export class SyncConfigUtils {
  /**
   * Parse size strings (e.g., "1GB", "500MB") to bytes
   */
  static parseSize(sizeStr: string): number {
    const units: Record<string, number> = {
      B: 1,
      KB: 1024,
      MB: 1024 * 1024,
      GB: 1024 * 1024 * 1024,
      TB: 1024 * 1024 * 1024 * 1024,
    };

    const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*([KMGT]?B)$/i);
    if (!match) {
      throw new Error(`Invalid size format: ${sizeStr}`);
    }

    const [, value, unit] = match;
    if (!value || !unit) {
      throw new Error(`Invalid size format: ${sizeStr}`);
    }

    const multiplier = units[unit.toUpperCase()];

    if (!multiplier) {
      throw new Error(`Unknown size unit: ${unit}`);
    }

    return Math.round(parseFloat(value) * multiplier);
  }

  /**
   * Format bytes to human-readable size string
   */
  static formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * Parse bandwidth strings (e.g., "25MB/s", "unlimited") to bytes per second
   */
  static parseBandwidth(bandwidthStr: string): number | null {
    if (bandwidthStr.toLowerCase() === 'unlimited') {
      return null; // No limit
    }

    const match = bandwidthStr.match(/^(\d+(?:\.\d+)?)\s*([KMGT]?B)\/s$/i);
    if (!match) {
      throw new Error(`Invalid bandwidth format: ${bandwidthStr}`);
    }

    const [, value, unit] = match;
    return this.parseSize(`${value}${unit}`);
  }

  /**
   * Validate cron expression
   */
  static validateCronExpression(cronExpr: string): boolean {
    // Basic cron validation (5 or 6 fields)
    const parts = cronExpr.trim().split(/\s+/);
    return parts.length === 5 || parts.length === 6;
  }

  /**
   * Validate file extension format
   */
  static validateFileExtension(extension: string): boolean {
    return /^\.[a-zA-Z0-9]+$/.test(extension);
  }

  /**
   * Normalize file extensions (ensure they start with a dot)
   */
  static normalizeFileExtensions(extensions: string[]): string[] {
    return extensions.map(ext => {
      const normalized = ext.toLowerCase().trim();
      return normalized.startsWith('.') ? normalized : `.${normalized}`;
    });
  }

  /**
   * Validate directory path
   */
  static validateDirectoryPath(path: string): boolean {
    // Basic path validation - should be absolute and not contain dangerous patterns
    return path.startsWith('/') && !path.includes('..') && !path.includes('//');
  }

  /**
   * Create content type configuration with validation
   */
  static createContentTypeConfig(config: {
    localPath: string;
    maxSize: string;
    fileExtensions?: string[];
    schedule?: string;
    priority?: number;
    autoUpdate?: boolean;
  }) {
    // Validate inputs
    if (!this.validateDirectoryPath(config.localPath)) {
      throw new Error(`Invalid local path: ${config.localPath}`);
    }

    try {
      this.parseSize(config.maxSize);
    } catch (_error) {
      throw new Error(`Invalid max size: ${config.maxSize}`);
    }

    if (config.schedule && !this.validateCronExpression(config.schedule)) {
      throw new Error(`Invalid cron schedule: ${config.schedule}`);
    }

    if (config.fileExtensions) {
      const invalidExtensions = config.fileExtensions.filter(
        ext => !this.validateFileExtension(ext.startsWith('.') ? ext : `.${ext}`)
      );
      if (invalidExtensions.length > 0) {
        throw new Error(`Invalid file extensions: ${invalidExtensions.join(', ')}`);
      }
    }

    return {
      local_path: config.localPath,
      max_size: config.maxSize,
      file_extensions: config.fileExtensions
        ? this.normalizeFileExtensions(config.fileExtensions)
        : undefined,
      schedule: config.schedule,
      priority: config.priority ?? 1,
      auto_update: config.autoUpdate ?? true,
    };
  }

  /**
   * Generate default content type configurations for common media types
   */
  static getDefaultContentTypes(): Record<string, unknown> {
    return {
      movies: this.createContentTypeConfig({
        localPath: '/content/movies',
        maxSize: '800GB',
        fileExtensions: ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm'],
        priority: 1,
      }),
      tv: this.createContentTypeConfig({
        localPath: '/content/tv',
        maxSize: '600GB',
        fileExtensions: ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm'],
        priority: 2,
      }),
      music: this.createContentTypeConfig({
        localPath: '/content/music',
        maxSize: '100GB',
        fileExtensions: ['.mp3', '.flac', '.wav', '.aac', '.ogg', '.m4a'],
        priority: 3,
      }),
      books: this.createContentTypeConfig({
        localPath: '/content/books',
        maxSize: '20GB',
        fileExtensions: ['.epub', '.pdf', '.mobi', '.azw', '.azw3', '.fb2', '.txt'],
        priority: 4,
      }),
      audiobooks: this.createContentTypeConfig({
        localPath: '/content/audiobooks',
        maxSize: '50GB',
        fileExtensions: ['.mp3', '.m4a', '.m4b', '.aac', '.ogg'],
        priority: 5,
      }),
    };
  }

  /**
   * Validate configuration against schema and provide helpful error messages
   */
  static validateConfigWithDetails<T>(
    config: unknown,
    schema: z.ZodSchema<T>,
    configName: string = 'configuration'
  ): { valid: boolean; errors: string[]; warnings: string[] } {
    const result = schema.safeParse(config);

    if (result.success) {
      return { valid: true, errors: [], warnings: [] };
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    for (const issue of result.error.issues) {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
      const message = `${configName}.${path}: ${issue.message}`;

      if (
        issue.code === 'invalid_type' &&
        (issue as { received?: string }).received === 'undefined'
      ) {
        warnings.push(`Missing optional field: ${message}`);
      } else {
        errors.push(message);
      }
    }

    return { valid: false, errors, warnings };
  }

  /**
   * Deep merge configuration objects
   */
  static deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
    const result = { ...target };

    for (const key in source) {
      if (source[key] !== undefined) {
        if (
          typeof source[key] === 'object' &&
          source[key] !== null &&
          !Array.isArray(source[key]) &&
          typeof target[key] === 'object' &&
          target[key] !== null &&
          !Array.isArray(target[key])
        ) {
          (result as Record<string, unknown>)[key] = this.deepMerge(
            target[key] as Record<string, unknown>,
            source[key] as Record<string, unknown>
          );
        } else {
          (result as Record<string, unknown>)[key] = source[key];
        }
      }
    }

    return result;
  }

  /**
   * Extract environment variables from configuration
   */
  static extractEnvVars(
    config: Record<string, unknown>,
    prefix: string = ''
  ): Record<string, string> {
    const envVars: Record<string, string> = {};

    function extract(obj: Record<string, unknown>, currentPrefix: string) {
      for (const [key, value] of Object.entries(obj)) {
        const envKey = currentPrefix ? `${currentPrefix}_${key.toUpperCase()}` : key.toUpperCase();

        if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
          const envVarName = value.slice(2, -1);
          envVars[envVarName] = envKey;
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          extract(value as Record<string, unknown>, envKey);
        }
      }
    }

    extract(config, prefix);
    return envVars;
  }

  /**
   * Generate configuration template with comments
   */
  static generateConfigTemplate(
    serviceName: string,
    _schema: z.ZodSchema<unknown>,
    _includeOptional: boolean = true
  ): string {
    // This would generate a YAML template with comments based on the schema
    // For now, return a basic template structure
    return `# ${serviceName} Configuration Template
# Generated automatically - customize as needed

# Service metadata
metadata:
  name: "${serviceName}"
  version: "1.0.0"
  description: "${serviceName} sync service"

# Storage configuration
storage:
  base_path: "/content"
  temp_directory: "/tmp/${serviceName}"
  max_total_size: "1TB"

# Performance settings
performance:
  max_concurrent_transfers: 3
  retry_attempts: 3
  retry_delay: 5000
  timeout: 300000
  transfer_chunk_size: "10MB"
  verify_transfers: true

# Logging configuration
logging:
  level: "INFO"
  file: "/app/data/logs/${serviceName}.log"
  max_size: "50MB"
  backup_count: 3

# Notification settings
notifications:
  enabled: false
  events: []

# Content type configurations
content_types: {}
`;
  }
}
