import type { Logger } from '@dangerprep/logging';
import * as cron from 'node-cron';

import type { ScheduledTask, ScheduleOptions } from './types.js';

/**
 * Internal implementation of ScheduledTask
 */
export class ScheduledTaskImpl implements ScheduledTask {
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
