import type { Logger } from '@dangerprep/logging';

/**
 * Options for scheduling a task
 */
export interface ScheduleOptions {
  /** Logger instance for scheduling operations */
  logger?: Logger | undefined;
  /** Timezone for the schedule (default: system timezone) */
  timezone?: string;
  /** Whether to start the task immediately (default: true) */
  scheduled?: boolean;
  /** Name/identifier for the scheduled task */
  name?: string;
}

/**
 * Represents a scheduled task
 */
export interface ScheduledTask {
  /** Unique identifier for the task */
  id: string;
  /** Cron expression for the schedule */
  schedule: string;
  /** Human-readable name for the task */
  name: string;
  /** Whether the task is currently active */
  isActive: boolean;
  /** Start the scheduled task */
  start(): void;
  /** Stop the scheduled task */
  stop(): void;
  /** Destroy the scheduled task */
  destroy(): void;
  /** Get the next execution time */
  getNextExecution(): Date | null;
  /** Get task status information */
  getStatus(): {
    id: string;
    name: string;
    schedule: string;
    isActive: boolean;
    nextExecution: Date | null;
  };
}
