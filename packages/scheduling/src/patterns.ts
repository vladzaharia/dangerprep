/**
 * Utility functions for common scheduling patterns
 */
export const SchedulePatterns = {
  /** Every minute */
  EVERY_MINUTE: '* * * * *',
  /** Every 5 minutes */
  EVERY_5_MINUTES: '*/5 * * * *',
  /** Every 15 minutes */
  EVERY_15_MINUTES: '*/15 * * * *',
  /** Every 30 minutes */
  EVERY_30_MINUTES: '*/30 * * * *',
  /** Every hour */
  EVERY_HOUR: '0 * * * *',
  /** Every 6 hours */
  EVERY_6_HOURS: '0 */6 * * *',
  /** Every 12 hours */
  EVERY_12_HOURS: '0 */12 * * *',
  /** Daily at midnight */
  DAILY_MIDNIGHT: '0 0 * * *',
  /** Daily at 2 AM */
  DAILY_2AM: '0 2 * * *',
  /** Daily at 6 AM */
  DAILY_6AM: '0 6 * * *',
  /** Weekly on Sunday at midnight */
  WEEKLY_SUNDAY: '0 0 * * 0',
  /** Weekly on Monday at 6 AM */
  WEEKLY_MONDAY_6AM: '0 6 * * 1',
  /** Monthly on the 1st at midnight */
  MONTHLY: '0 0 1 * *',
} as const;
