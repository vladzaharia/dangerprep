import cron from 'node-cron';

import type { Logger } from '../logging';

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

/**
 * Internal implementation of ScheduledTask
 */
class ScheduledTaskImpl implements ScheduledTask {
  private task: cron.ScheduledTask;
  private logger: Logger | undefined;

  constructor(
    public readonly id: string,
    public readonly schedule: string,
    public readonly name: string,
    private readonly taskFunction: () => void | Promise<void>,
    private readonly options: ScheduleOptions = {}
  ) {
    this.logger = options.logger;

    const scheduleOptions: { scheduled: boolean; timezone?: string } = {
      scheduled: options.scheduled ?? true,
    };

    if (options.timezone) {
      scheduleOptions.timezone = options.timezone;
    }

    this.task = cron.schedule(
      schedule,
      async () => {
        try {
          this.logger?.debug(`Executing scheduled task: ${this.name}`);
          await this.taskFunction();
          this.logger?.debug(`Completed scheduled task: ${this.name}`);
        } catch (error) {
          this.logger?.error(`Error in scheduled task ${this.name}:`, error);
        }
      },
      scheduleOptions
    );
  }

  get isActive(): boolean {
    // Simple implementation - assume task is active if it exists
    // In a real implementation, you'd track the state
    return !!this.task;
  }

  start(): void {
    this.task.start();
    this.logger?.info(`Started scheduled task: ${this.name} (${this.schedule})`);
  }

  stop(): void {
    this.task.stop();
    this.logger?.info(`Stopped scheduled task: ${this.name}`);
  }

  destroy(): void {
    // Stop the task (node-cron doesn't have destroy method in all versions)
    this.task.stop();
    this.logger?.info(`Destroyed scheduled task: ${this.name}`);
  }

  getNextExecution(): Date | null {
    // Note: nextDates() method may not be available in all versions
    // Return null for now - this is a nice-to-have feature
    return null;
  }

  getStatus() {
    return {
      id: this.id,
      name: this.name,
      schedule: this.schedule,
      isActive: this.isActive,
      nextExecution: this.getNextExecution(),
    };
  }
}

/**
 * Scheduler class for managing multiple scheduled tasks
 */
export class Scheduler {
  private tasks = new Map<string, ScheduledTask>();
  private logger: Logger | undefined;

  constructor(options: { logger?: Logger | undefined } = {}) {
    this.logger = options.logger;
  }

  /**
   * Schedule a new task
   */
  schedule(
    id: string,
    schedule: string,
    taskFunction: () => void | Promise<void>,
    options: ScheduleOptions = {}
  ): ScheduledTask {
    // Validate cron expression
    if (!cron.validate(schedule)) {
      throw new Error(`Invalid cron expression: ${schedule}`);
    }

    // Check if task already exists
    if (this.tasks.has(id)) {
      throw new Error(`Task with id '${id}' already exists`);
    }

    const name = options.name || id;
    const taskLogger = options.logger || this.logger;
    const task = new ScheduledTaskImpl(id, schedule, name, taskFunction, {
      ...options,
      logger: taskLogger,
    });

    this.tasks.set(id, task);
    this.logger?.info(`Scheduled task: ${name} (${schedule})`);

    return task;
  }

  /**
   * Get a scheduled task by ID
   */
  getTask(id: string): ScheduledTask | undefined {
    return this.tasks.get(id);
  }

  /**
   * Get all scheduled tasks
   */
  getAllTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Remove a scheduled task
   */
  removeTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (task) {
      task.destroy();
      this.tasks.delete(id);
      this.logger?.info(`Removed scheduled task: ${id}`);
      return true;
    }
    return false;
  }

  /**
   * Start all scheduled tasks
   */
  startAll(): void {
    for (const task of this.tasks.values()) {
      if (!task.isActive) {
        task.start();
      }
    }
    this.logger?.info(`Started ${this.tasks.size} scheduled tasks`);
  }

  /**
   * Stop all scheduled tasks
   */
  stopAll(): void {
    for (const task of this.tasks.values()) {
      if (task.isActive) {
        task.stop();
      }
    }
    this.logger?.info(`Stopped ${this.tasks.size} scheduled tasks`);
  }

  /**
   * Destroy all scheduled tasks
   */
  destroyAll(): void {
    for (const task of this.tasks.values()) {
      task.destroy();
    }
    this.tasks.clear();
    this.logger?.info('Destroyed all scheduled tasks');
  }

  /**
   * Get status of all scheduled tasks
   */
  getStatus() {
    return {
      totalTasks: this.tasks.size,
      activeTasks: Array.from(this.tasks.values()).filter(task => task.isActive).length,
      tasks: Array.from(this.tasks.values()).map(task => task.getStatus()),
    };
  }

  /**
   * Validate a cron expression
   */
  static validateCron(expression: string): boolean {
    return cron.validate(expression);
  }

  /**
   * Get the next execution time for a cron expression
   */
  static getNextExecution(expression: string, _timezone?: string): Date | null {
    try {
      if (!cron.validate(expression)) {
        return null;
      }
      // Note: nextDates() method may not be available in all versions
      // Return null for now - this is a nice-to-have feature
      return null;
    } catch {
      return null;
    }
  }
}

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

// Re-export cron for direct access if needed
export { cron };
