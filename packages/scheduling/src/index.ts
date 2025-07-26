/**
 * Scheduling module - Cron-based task scheduling for DangerPrep services
 *
 * Features:
 * - Cron-based task scheduling with validation
 * - Task lifecycle management (start, stop, destroy)
 * - Multiple task management with Scheduler class
 * - Common schedule patterns and utilities
 * - TypeScript-first design with proper error handling
 */

// Core types and interfaces
export type { ScheduleOptions, ScheduledTask } from './types.js';

// Main scheduler class
export { Scheduler } from './scheduler.js';

// Schedule patterns and utilities
export { SchedulePatterns } from './patterns.js';

// Re-export cron for direct access if needed
export { default as cron } from 'node-cron';
