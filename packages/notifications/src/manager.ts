import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';

import { Result, safeAsync } from '@dangerprep/errors';
import type { Logger } from '@dangerprep/logging';

import {
  NotificationEvent,
  NotificationChannel,
  NotificationManagerConfig,
  NotificationLevel,
  NotificationType,
} from './types.js';

// Branded types for notifications
export type NotificationId = string & { readonly __brand: 'NotificationId' };
export type ChannelName = string & { readonly __brand: 'ChannelName' };
export type NotificationTag = string & { readonly __brand: 'NotificationTag' };

// Type guards
export function isNotificationId(value: string): value is NotificationId {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

export function isChannelName(value: string): value is ChannelName {
  return typeof value === 'string' && value.length > 0 && /^[a-zA-Z0-9_-]+$/.test(value);
}

export function isNotificationTag(value: string): value is NotificationTag {
  return typeof value === 'string' && value.length > 0 && value.length <= 50;
}

// Factory functions
export function createNotificationId(): NotificationId {
  return randomUUID() as NotificationId;
}

export function createChannelName(name: string): ChannelName {
  if (!isChannelName(name)) {
    throw new Error(
      `Invalid channel name: ${name}. Must be alphanumeric with hyphens/underscores only.`
    );
  }
  return name;
}

export function createNotificationTag(tag: string): NotificationTag {
  if (!isNotificationTag(tag)) {
    throw new Error(`Invalid notification tag: ${tag}. Must be 1-50 characters.`);
  }
  return tag;
}

// Enhanced notification event with immutable patterns
interface EnhancedNotificationEvent extends NotificationEvent {
  readonly id: NotificationId;
  readonly createdAt: Date;
  readonly processedAt?: Date;
  readonly deliveryStatus: 'pending' | 'delivered' | 'failed' | 'retrying';
  readonly deliveryAttempts: number;
  readonly channelResults: ReadonlyMap<
    ChannelName,
    { success: boolean; error?: string; deliveredAt?: Date }
  >;
  readonly metadata: Record<string, unknown>;
}

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
    this.trimEvents();
  }

  private trimEvents(): void {
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

  /**
   * Send notification with Result pattern and enhanced tracking
   */
  async notifyAdvanced(
    type: NotificationType,
    message: string,
    options: {
      level?: NotificationLevel;
      source?: string;
      data?: Record<string, unknown>;
      tags?: readonly NotificationTag[];
      targetChannels?: readonly ChannelName[];
      retryAttempts?: number;
      timeout?: number;
    } = {}
  ): Promise<Result<EnhancedNotificationEvent>> {
    return safeAsync(async () => {
      const {
        level = this.config.defaultLevel,
        source = 'unknown',
        data = {},
        tags = [],
        targetChannels,
        retryAttempts = 3,
        timeout = 10000,
      } = options;

      const notificationId = createNotificationId();
      const createdAt = new Date();

      const enhancedEvent: EnhancedNotificationEvent = {
        id: notificationId,
        type,
        level,
        message,
        source,
        timestamp: createdAt,
        data,
        tags: [...this.config.defaultTags, ...tags],
        createdAt,
        deliveryStatus: 'pending',
        deliveryAttempts: 0,
        channelResults: new Map(),
        metadata: {
          retryAttempts,
          timeout,
          targetChannels: targetChannels ? [...targetChannels] : undefined,
        },
      };

      // Store the enhanced event
      this.events.push(enhancedEvent);
      this.trimEvents();

      // Determine which channels to use
      const channelsToUse = targetChannels
        ? Array.from(this.channels.entries()).filter(([name]) =>
            targetChannels.includes(name as ChannelName)
          )
        : Array.from(this.channels.entries());

      if (channelsToUse.length === 0) {
        this.logger?.warn('No notification channels available');
        return {
          ...enhancedEvent,
          deliveryStatus: 'failed',
          processedAt: new Date(),
        };
      }

      // Send to channels with timeout and retry logic
      const channelResults = new Map<
        ChannelName,
        { success: boolean; error?: string; deliveredAt?: Date }
      >();

      for (const [channelName, channel] of channelsToUse) {
        const channelNameBranded = channelName as ChannelName;
        let attempts = 0;
        let success = false;
        let lastError: string | undefined;

        while (attempts < retryAttempts && !success) {
          attempts++;

          try {
            await Promise.race([
              channel.send(enhancedEvent),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Channel send timeout')), timeout)
              ),
            ]);

            success = true;
            channelResults.set(channelNameBranded, {
              success: true,
              deliveredAt: new Date(),
            });

            this.logger?.debug(`Notification sent successfully to channel: ${channelName}`);
          } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
            this.logger?.warn(
              `Notification failed on channel ${channelName} (attempt ${attempts}/${retryAttempts}): ${lastError}`
            );

            if (attempts < retryAttempts) {
              // Wait before retry with exponential backoff
              await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000));
            }
          }
        }

        if (!success) {
          channelResults.set(channelNameBranded, {
            success: false,
            error: lastError || 'Unknown error',
          });
        }
      }

      // Update the event with results
      const finalEvent: EnhancedNotificationEvent = {
        ...enhancedEvent,
        deliveryStatus:
          channelResults.size > 0 && Array.from(channelResults.values()).some(r => r.success)
            ? 'delivered'
            : 'failed',
        deliveryAttempts: Math.max(...Array.from(channelResults.values()).map(() => retryAttempts)),
        channelResults,
        processedAt: new Date(),
      };

      // Emit event for listeners
      this.emit('notification_sent', finalEvent);

      if (this.config.logNotifications) {
        const successfulChannels = Array.from(channelResults.entries())
          .filter(([, result]) => result.success)
          .map(([name]) => name);

        this.logger?.info(`Notification sent`, {
          id: notificationId,
          type,
          level,
          message: message.substring(0, 100),
          successfulChannels,
          totalChannels: channelResults.size,
        });
      }

      return finalEvent;
    });
  }

  /**
   * Get notification statistics with Result pattern
   */
  async getNotificationStats(): Promise<
    Result<{
      totalNotifications: number;
      notificationsByLevel: Record<NotificationLevel, number>;
      notificationsByType: Record<NotificationType, number>;
      channelStats: Record<string, { sent: number; failed: number; successRate: number }>;
      recentNotifications: readonly EnhancedNotificationEvent[];
    }>
  > {
    return safeAsync(async () => {
      const enhancedEvents = this.events.filter(
        (event): event is EnhancedNotificationEvent => 'id' in event && 'deliveryStatus' in event
      );

      const notificationsByLevel = {} as Record<NotificationLevel, number>;
      const notificationsByType = {} as Record<NotificationType, number>;
      const channelStats: Record<string, { sent: number; failed: number; successRate: number }> =
        {};

      // Initialize counters
      (Object.values(NotificationLevel) as NotificationLevel[]).forEach(level => {
        notificationsByLevel[level] = 0;
      });
      (Object.values(NotificationType) as NotificationType[]).forEach(type => {
        notificationsByType[type] = 0;
      });

      // Process events
      for (const event of enhancedEvents) {
        notificationsByLevel[event.level]++;
        notificationsByType[event.type]++;

        // Process channel stats
        for (const [channelName, result] of event.channelResults) {
          if (!channelStats[channelName]) {
            channelStats[channelName] = { sent: 0, failed: 0, successRate: 0 };
          }

          if (result.success) {
            channelStats[channelName].sent++;
          } else {
            channelStats[channelName].failed++;
          }
        }
      }

      // Calculate success rates
      for (const stats of Object.values(channelStats)) {
        const total = stats.sent + stats.failed;
        stats.successRate = total > 0 ? (stats.sent / total) * 100 : 0;
      }

      return {
        totalNotifications: enhancedEvents.length,
        notificationsByLevel,
        notificationsByType,
        channelStats,
        recentNotifications: enhancedEvents.slice(-10), // Last 10 notifications
      };
    });
  }

  /**
   * Get notification by ID with Result pattern
   */
  async getNotificationById(id: NotificationId): Promise<Result<EnhancedNotificationEvent>> {
    return safeAsync(async () => {
      const event = this.events.find(
        (event): event is EnhancedNotificationEvent => 'id' in event && event.id === id
      );

      if (!event) {
        throw new Error(`Notification with ID ${id} not found`);
      }

      return event;
    });
  }
}
