import type { Logger } from '../../logging';
import {
  NotificationChannel,
  NotificationEvent,
  NotificationLevel,
  NotificationFilter,
} from '../types.js';

/**
 * Console notification channel for logging events to the console/logger
 */
export class ConsoleChannel implements NotificationChannel {
  public readonly name = 'console';
  private logger: Logger;
  private filter: NotificationFilter | undefined;

  constructor(logger: Logger, filter?: NotificationFilter) {
    this.logger = logger;
    this.filter = filter;
  }

  async send(event: NotificationEvent): Promise<void> {
    // Apply filter if configured
    if (!this.shouldSendEvent(event)) {
      return;
    }

    const message = this.formatMessage(event);
    const logData = {
      notificationId: event.id,
      type: event.type,
      source: event.source,
      tags: event.tags,
      ...event.data,
    };

    // Map notification level to logger level
    switch (event.level) {
      case NotificationLevel.DEBUG:
        this.logger.debug(message, logData);
        break;
      case NotificationLevel.INFO:
        this.logger.info(message, logData);
        break;
      case NotificationLevel.WARN:
        this.logger.warn(message, logData);
        break;
      case NotificationLevel.ERROR:
      case NotificationLevel.CRITICAL:
        if (event.error) {
          this.logger.error(message, {
            ...logData,
            error: event.error.message,
            stack: event.error.stack,
          });
        } else {
          this.logger.error(message, logData);
        }
        break;
      default:
        this.logger.info(message, logData);
    }
  }

  async isAvailable(): Promise<boolean> {
    return true; // Console is always available
  }

  private shouldSendEvent(event: NotificationEvent): boolean {
    if (!this.filter) {
      return true;
    }

    // Check notification types
    if (this.filter.types && !this.filter.types.includes(event.type)) {
      return false;
    }

    // Check minimum level
    if (this.filter.minLevel !== undefined && event.level < this.filter.minLevel) {
      return false;
    }

    // Check sources
    if (this.filter.sources && !this.filter.sources.includes(event.source)) {
      return false;
    }

    // Check tags
    if (
      this.filter.tags &&
      (!event.tags || !this.filter.tags.some(tag => event.tags?.includes(tag)))
    ) {
      return false;
    }

    // Check custom filter
    if (this.filter.custom && !this.filter.custom(event)) {
      return false;
    }

    return true;
  }

  private formatMessage(event: NotificationEvent): string {
    const levelIcon = this.getLevelIcon(event.level);
    const typeFormatted = event.type.replace(/_/g, ' ').toUpperCase();

    let message = `${levelIcon} [${event.source}] ${typeFormatted}: ${event.message}`;

    if (event.description) {
      message += ` - ${event.description}`;
    }

    return message;
  }

  private getLevelIcon(level: NotificationLevel): string {
    switch (level) {
      case NotificationLevel.DEBUG:
        return '🔍';
      case NotificationLevel.INFO:
        return 'ℹ️';
      case NotificationLevel.WARN:
        return '⚠️';
      case NotificationLevel.ERROR:
        return '❌';
      case NotificationLevel.CRITICAL:
        return '🚨';
      default:
        return 'ℹ️';
    }
  }
}
