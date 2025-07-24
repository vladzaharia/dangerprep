import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

import type { Logger } from '../../logging';
import { NotificationChannel, NotificationEvent, WebhookChannelConfig } from '../types.js';

/**
 * Webhook notification channel for sending events to HTTP endpoints
 */
export class WebhookChannel implements NotificationChannel {
  public readonly name = 'webhook';
  private client: AxiosInstance;
  private config: Required<WebhookChannelConfig>;
  private logger: Logger | undefined;

  constructor(config: WebhookChannelConfig, logger?: Logger) {
    this.logger = logger;
    this.config = {
      method: 'POST',
      headers: {},
      timeout: 10000,
      retries: 3,
      retryDelay: 1000,
      filter: {},
      ...config,
    };

    this.client = axios.create({
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'DangerPrep-Notifications/1.0',
        ...this.config.headers,
      },
    });
  }

  async send(event: NotificationEvent): Promise<void> {
    // Apply filter if configured
    if (!this.shouldSendEvent(event)) {
      this.logger?.debug(`Webhook: Event filtered out: ${event.type}`);
      return;
    }

    const payload = this.formatPayload(event);
    const requestConfig: AxiosRequestConfig = {
      method: this.config.method,
      url: this.config.url,
      data: payload,
    };

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.retries; attempt++) {
      try {
        await this.client.request(requestConfig);
        this.logger?.debug(
          `Webhook: Successfully sent notification ${event.id} (attempt ${attempt})`
        );
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger?.warn(
          `Webhook: Failed to send notification ${event.id} (attempt ${attempt}/${this.config.retries}): ${lastError.message}`
        );

        if (attempt < this.config.retries) {
          await this.sleep(this.config.retryDelay * attempt); // Exponential backoff
        }
      }
    }

    throw new Error(
      `Failed to send webhook notification after ${this.config.retries} attempts: ${lastError?.message}`
    );
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Simple HEAD request to check if the endpoint is reachable
      await this.client.head(this.config.url);
      return true;
    } catch {
      return false;
    }
  }

  private shouldSendEvent(event: NotificationEvent): boolean {
    const filter = this.config.filter;

    // Check notification types
    if (filter.types && !filter.types.includes(event.type)) {
      return false;
    }

    // Check minimum level
    if (filter.minLevel !== undefined && event.level < filter.minLevel) {
      return false;
    }

    // Check sources
    if (filter.sources && !filter.sources.includes(event.source)) {
      return false;
    }

    // Check tags
    if (filter.tags && (!event.tags || !filter.tags.some(tag => event.tags?.includes(tag)))) {
      return false;
    }

    // Check custom filter
    if (filter.custom && !filter.custom(event)) {
      return false;
    }

    return true;
  }

  private formatPayload(event: NotificationEvent): Record<string, unknown> {
    return {
      id: event.id,
      type: event.type,
      level: event.level,
      timestamp: event.timestamp.toISOString(),
      source: event.source,
      message: event.message,
      description: event.description,
      data: event.data,
      error: event.error
        ? {
            name: event.error.name,
            message: event.error.message,
            stack: event.error.stack,
          }
        : undefined,
      tags: event.tags,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
