import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';

import type { Logger } from '../logging';

import {
  NotificationEvent,
  NotificationChannel,
  NotificationManagerConfig,
  NotificationLevel,
  NotificationType,
} from './types.js';

/**
 * Central notification manager for handling events across services
 */
export class NotificationManager extends EventEmitter {
  private channels: Map<string, NotificationChannel> = new Map();
  private events: NotificationEvent[] = [];
  private config: Required<NotificationManagerConfig>;
  private logger: Logger | undefined;

  constructor(config: NotificationManagerConfig = {}, logger?: Logger) {
    super();
    this.logger = logger;
    this.config = {
      defaultLevel: NotificationLevel.INFO,
      maxEvents: 1000,
      logNotifications: true,
      defaultTags: [],
      ...config,
    };
  }

  /**
   * Add a notification channel
   */
  addChannel(channel: NotificationChannel): void {
    this.channels.set(channel.name, channel);
    this.logger?.debug(`Added notification channel: ${channel.name}`);
  }

  /**
   * Remove a notification channel
   */
  async removeChannel(channelName: string): Promise<void> {
    const channel = this.channels.get(channelName);
    if (channel) {
      if (channel.close) {
        await channel.close();
      }
      this.channels.delete(channelName);
      this.logger?.debug(`Removed notification channel: ${channelName}`);
    }
  }

  /**
   * Send a notification event
   */
  async notify(
    type: NotificationType,
    message: string,
    options: {
      level?: NotificationLevel;
      source?: string;
      description?: string;
      data?: Record<string, unknown>;
      error?: Error;
      tags?: string[];
    } = {}
  ): Promise<void> {
    const event: NotificationEvent = {
      id: randomUUID(),
      type,
      level: options.level ?? this.config.defaultLevel,
      timestamp: new Date(),
      source: options.source ?? 'unknown',
      message,
      ...(options.description && { description: options.description }),
      ...(options.data && { data: options.data }),
      ...(options.error && { error: options.error }),
      tags: [...this.config.defaultTags, ...(options.tags ?? [])],
    };

    // Store event in memory
    this.addEvent(event);

    // Log to logger if configured
    if (this.config.logNotifications && this.logger) {
      const logLevel = this.mapNotificationLevelToLogLevel(event.level);
      this.logger[logLevel](`Notification: ${event.message}`, {
        notificationId: event.id,
        type: event.type,
        source: event.source,
        ...event.data,
      });
    }

    // Emit event for local listeners
    this.emit('notification', event);

    // Send to all channels
    const channelPromises = Array.from(this.channels.values()).map(async channel => {
      try {
        await channel.send(event);
      } catch (error) {
        this.logger?.error(`Failed to send notification via ${channel.name}:`, error);
      }
    });

    await Promise.allSettled(channelPromises);
  }

  /**
   * Convenience methods for common notification types
   */
  async info(
    message: string,
    options: Omit<Parameters<typeof this.notify>[2], 'level'> = {}
  ): Promise<void> {
    return this.notify(NotificationType.CUSTOM, message, {
      ...options,
      level: NotificationLevel.INFO,
    });
  }

  async warn(
    message: string,
    options: Omit<Parameters<typeof this.notify>[2], 'level'> = {}
  ): Promise<void> {
    return this.notify(NotificationType.CUSTOM, message, {
      ...options,
      level: NotificationLevel.WARN,
    });
  }

  async error(
    message: string,
    options: Omit<Parameters<typeof this.notify>[2], 'level'> = {}
  ): Promise<void> {
    return this.notify(NotificationType.CUSTOM, message, {
      ...options,
      level: NotificationLevel.ERROR,
    });
  }

  async critical(
    message: string,
    options: Omit<Parameters<typeof this.notify>[2], 'level'> = {}
  ): Promise<void> {
    return this.notify(NotificationType.CUSTOM, message, {
      ...options,
      level: NotificationLevel.CRITICAL,
    });
  }

  /**
   * Service lifecycle notifications
   */
  async serviceStarted(source: string, data?: Record<string, unknown>): Promise<void> {
    return this.notify(NotificationType.SERVICE_STARTED, `Service ${source} started`, {
      source,
      level: NotificationLevel.INFO,
      ...(data && { data }),
    });
  }

  async serviceStopped(source: string, data?: Record<string, unknown>): Promise<void> {
    return this.notify(NotificationType.SERVICE_STOPPED, `Service ${source} stopped`, {
      source,
      level: NotificationLevel.INFO,
      ...(data && { data }),
    });
  }

  async serviceError(source: string, error: Error, data?: Record<string, unknown>): Promise<void> {
    return this.notify(NotificationType.SERVICE_ERROR, `Service ${source} encountered an error`, {
      source,
      level: NotificationLevel.ERROR,
      error,
      ...(data && { data }),
    });
  }

  /**
   * Get recent events
   */
  getEvents(limit?: number): NotificationEvent[] {
    return limit ? this.events.slice(-limit) : [...this.events];
  }

  /**
   * Get events by filter
   */
  getEventsByFilter(filter: {
    types?: NotificationType[];
    levels?: NotificationLevel[];
    sources?: string[];
    since?: Date;
  }): NotificationEvent[] {
    return this.events.filter(event => {
      if (filter.types && !filter.types.includes(event.type)) return false;
      if (filter.levels && !filter.levels.includes(event.level)) return false;
      if (filter.sources && !filter.sources.includes(event.source)) return false;
      if (filter.since && event.timestamp < filter.since) return false;
      return true;
    });
  }

  /**
   * Clear stored events
   */
  clearEvents(): void {
    this.events = [];
  }

  /**
   * Check if any channels are available
   */
  async hasAvailableChannels(): Promise<boolean> {
    const availabilityChecks = Array.from(this.channels.values()).map(channel =>
      channel.isAvailable()
    );
    const results = await Promise.allSettled(availabilityChecks);
    return results.some(result => result.status === 'fulfilled' && result.value === true);
  }

  /**
   * Close all channels and cleanup
   */
  async close(): Promise<void> {
    const closePromises = Array.from(this.channels.values()).map(async channel => {
      if (channel.close) {
        try {
          await channel.close();
        } catch (error) {
          this.logger?.error(`Error closing channel ${channel.name}:`, error);
        }
      }
    });

    await Promise.allSettled(closePromises);
    this.channels.clear();
    this.removeAllListeners();
  }

  private addEvent(event: NotificationEvent): void {
    this.events.push(event);

    // Trim events if we exceed the maximum
    if (this.events.length > this.config.maxEvents) {
      this.events = this.events.slice(-this.config.maxEvents);
    }
  }

  private mapNotificationLevelToLogLevel(
    level: NotificationLevel
  ): 'debug' | 'info' | 'warn' | 'error' {
    switch (level) {
      case NotificationLevel.DEBUG:
        return 'debug';
      case NotificationLevel.INFO:
        return 'info';
      case NotificationLevel.WARN:
        return 'warn';
      case NotificationLevel.ERROR:
      case NotificationLevel.CRITICAL:
        return 'error';
      default:
        return 'info';
    }
  }
}
