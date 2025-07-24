/**
 * Notification module - Standardized event notification system for DangerPrep services
 *
 * Features:
 * - Centralized notification management
 * - Multiple notification channels (webhook, console, email)
 * - Event filtering and routing
 * - Structured notification events
 * - Service lifecycle notifications
 * - Progress and status notifications
 */

// Core exports
export { NotificationManager } from './manager.js';

// Channel implementations
export { WebhookChannel } from './channels/webhook-channel.js';
export { ConsoleChannel } from './channels/console-channel.js';

// Import for utility functions
import type { Logger } from '../logging/index.js';

import { ConsoleChannel } from './channels/console-channel.js';
import { WebhookChannel } from './channels/webhook-channel.js';
import { NotificationManager } from './manager.js';
import type { NotificationManagerConfig, WebhookChannelConfig } from './types.js';

// Types and enums
export { NotificationLevel, NotificationType } from './types.js';

export type {
  NotificationEvent,
  NotificationChannel,
  NotificationFilter,
  NotificationManagerConfig,
  WebhookChannelConfig,
  EmailChannelConfig,
} from './types.js';

// Utility functions
export const NotificationUtils = {
  /**
   * Create a notification manager with console channel
   */
  createConsoleManager(logger: Logger, config?: NotificationManagerConfig): NotificationManager {
    const manager = new NotificationManager(config, logger);
    manager.addChannel(new ConsoleChannel(logger));
    return manager;
  },

  /**
   * Create a notification manager with webhook channel
   */
  createWebhookManager(
    webhookConfig: WebhookChannelConfig,
    logger?: Logger,
    config?: NotificationManagerConfig
  ): NotificationManager {
    const manager = new NotificationManager(config, logger);
    manager.addChannel(new WebhookChannel(webhookConfig, logger));
    return manager;
  },

  /**
   * Create a notification manager with both console and webhook channels
   */
  createCombinedManager(
    webhookConfig: WebhookChannelConfig,
    logger: Logger,
    config?: NotificationManagerConfig
  ): NotificationManager {
    const manager = new NotificationManager(config, logger);
    manager.addChannel(new ConsoleChannel(logger));
    manager.addChannel(new WebhookChannel(webhookConfig, logger));
    return manager;
  },
};
