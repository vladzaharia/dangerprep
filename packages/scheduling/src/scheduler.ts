import type { Logger } from '@dangerprep/logging';
import cron from 'node-cron';

import { ScheduledTaskImpl } from './task.js';
import type { ScheduledTask, ScheduleOptions } from './types.js';

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
