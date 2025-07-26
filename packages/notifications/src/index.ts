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
export { NotificationUtils } from './utils.js';
