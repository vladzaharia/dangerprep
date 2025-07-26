import type { Logger } from '@dangerprep/logging';

import { ConsoleChannel } from './channels/console-channel.js';
import { WebhookChannel } from './channels/webhook-channel.js';
import { NotificationManager } from './manager.js';
import type { NotificationManagerConfig, WebhookChannelConfig } from './types.js';

/**
 * Utility functions for creating and configuring notification managers
 */
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
