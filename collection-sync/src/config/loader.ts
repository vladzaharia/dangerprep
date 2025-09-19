import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse as parseJsonc } from 'jsonc-parser';
import { AppConfigSchema, type AppConfig } from './schema.js';

export class ConfigLoader {
  private static instance: ConfigLoader;
  private config: AppConfig | null = null;

  private constructor() {}

  public static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  public loadConfig(configPath?: string): AppConfig {
    if (this.config) {
      return this.config;
    }

    const defaultConfigPath = resolve(process.cwd(), 'config', 'collection.jsonc');
    const finalConfigPath = configPath || defaultConfigPath;

    try {
      const configContent = readFileSync(finalConfigPath, 'utf-8');
      const parsedConfig = parseJsonc(configContent);

      if (!parsedConfig) {
        throw new Error('Failed to parse JSONC configuration file');
      }

      // Validate the configuration using Zod
      const validatedConfig = AppConfigSchema.parse(parsedConfig);
      this.config = validatedConfig;

      return validatedConfig;
    } catch (error) {
      if (error instanceof Error) {
        if ('code' in error && error.code === 'ENOENT') {
          throw new Error(
            `Configuration file not found: ${finalConfigPath}\n` +
            `Please copy config/collection.example.jsonc to config/collection.jsonc and customize it for your setup.`
          );
        }
        throw new Error(`Failed to load configuration from ${finalConfigPath}: ${error.message}`);
      }
      throw new Error(`Failed to load configuration from ${finalConfigPath}: Unknown error`);
    }
  }

  public getConfig(): AppConfig {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadConfig() first.');
    }
    return this.config;
  }

  public reloadConfig(configPath?: string): AppConfig {
    this.config = null;
    return this.loadConfig(configPath);
  }
}

// Convenience function for getting the config instance
export const getConfig = (): AppConfig => {
  return ConfigLoader.getInstance().getConfig();
};

// Convenience function for loading config
export const loadConfig = (configPath?: string): AppConfig => {
  return ConfigLoader.getInstance().loadConfig(configPath);
};
