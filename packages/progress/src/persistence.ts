/**
 * Progress persistence implementation for saving/loading progress state
 */

import { promises as fs } from 'fs';
import * as path from 'path';

import type { Logger } from '@dangerprep/logging';

import { type IProgressPersistence, type ProgressUpdate, type IProgressTracker } from './types.js';

export class FileProgressPersistence implements IProgressPersistence {
  private readonly storageDir: string;

  constructor(storageDir: string = './data/progress') {
    this.storageDir = storageDir;
  }

  async saveProgress(operationId: string, progress: ProgressUpdate): Promise<void> {
    await this.ensureStorageDir();

    const filePath = this.getProgressFilePath(operationId);
    const data = JSON.stringify(progress, null, 2);

    await fs.writeFile(filePath, data, 'utf8');
  }

  async loadProgress(operationId: string): Promise<ProgressUpdate | null> {
    try {
      const filePath = this.getProgressFilePath(operationId);
      const data = await fs.readFile(filePath, 'utf8');
      const progress = JSON.parse(data) as ProgressUpdate;

      // Convert date strings back to Date objects
      progress.timestamp = new Date(progress.timestamp);
      if (progress.currentPhase?.startTime) {
        progress.currentPhase.startTime = new Date(progress.currentPhase.startTime);
      }
      if (progress.currentPhase?.endTime) {
        progress.currentPhase.endTime = new Date(progress.currentPhase.endTime);
      }
      if (progress.phases) {
        for (const phase of progress.phases) {
          if (phase.startTime) {
            phase.startTime = new Date(phase.startTime);
          }
          if (phase.endTime) {
            phase.endTime = new Date(phase.endTime);
          }
        }
      }

      return progress;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null; // File doesn't exist
      }
      throw error;
    }
  }

  async deleteProgress(operationId: string): Promise<void> {
    try {
      const filePath = this.getProgressFilePath(operationId);
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      // Ignore if file doesn't exist
    }
  }

  async listProgress(): Promise<string[]> {
    try {
      await this.ensureStorageDir();
      const files = await fs.readdir(this.storageDir);

      return files.filter(file => file.endsWith('.json')).map(file => path.basename(file, '.json'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return []; // Directory doesn't exist
      }
      throw error;
    }
  }

  async cleanup(olderThanMs: number): Promise<void> {
    try {
      await this.ensureStorageDir();
      const files = await fs.readdir(this.storageDir);
      const cutoffTime = Date.now() - olderThanMs;

      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue;
        }

        const filePath = path.join(this.storageDir, file);
        const stats = await fs.stat(filePath);

        if (stats.mtime.getTime() < cutoffTime) {
          await fs.unlink(filePath);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      // Ignore if directory doesn't exist
    }
  }

  private async ensureStorageDir(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  private getProgressFilePath(operationId: string): string {
    // Sanitize operation ID for filename
    const sanitizedId = operationId.replace(/[^a-zA-Z0-9-_]/g, '_');
    return path.join(this.storageDir, `${sanitizedId}.json`);
  }
}

/**
 * In-memory progress persistence for testing or temporary storage
 */
export class MemoryProgressPersistence implements IProgressPersistence {
  private storage = new Map<string, ProgressUpdate>();

  async saveProgress(operationId: string, progress: ProgressUpdate): Promise<void> {
    // Deep clone to avoid reference issues
    this.storage.set(operationId, JSON.parse(JSON.stringify(progress)));
  }

  async loadProgress(operationId: string): Promise<ProgressUpdate | null> {
    const progress = this.storage.get(operationId);
    if (!progress) {
      return null;
    }

    // Deep clone and restore dates
    const cloned = JSON.parse(JSON.stringify(progress)) as ProgressUpdate;
    cloned.timestamp = new Date(cloned.timestamp);

    if (cloned.currentPhase?.startTime) {
      cloned.currentPhase.startTime = new Date(cloned.currentPhase.startTime);
    }
    if (cloned.currentPhase?.endTime) {
      cloned.currentPhase.endTime = new Date(cloned.currentPhase.endTime);
    }
    if (cloned.phases) {
      for (const phase of cloned.phases) {
        if (phase.startTime) {
          phase.startTime = new Date(phase.startTime);
        }
        if (phase.endTime) {
          phase.endTime = new Date(phase.endTime);
        }
      }
    }

    return cloned;
  }

  async deleteProgress(operationId: string): Promise<void> {
    this.storage.delete(operationId);
  }

  async listProgress(): Promise<string[]> {
    return Array.from(this.storage.keys());
  }

  async cleanup(olderThanMs: number): Promise<void> {
    const cutoffTime = Date.now() - olderThanMs;

    for (const [operationId, progress] of this.storage.entries()) {
      if (new Date(progress.timestamp).getTime() < cutoffTime) {
        this.storage.delete(operationId);
      }
    }
  }

  /**
   * Clear all stored progress (useful for testing)
   */
  clear(): void {
    this.storage.clear();
  }
}

/**
 * Persistent progress manager that automatically saves/loads progress
 */
export class PersistentProgressManager {
  private persistence: IProgressPersistence;
  private autoSaveInterval: number;
  private autoSaveTimer: NodeJS.Timeout | null = null;
  private trackers = new Map<string, { tracker: IProgressTracker; lastSaved: Date }>();
  private logger: Logger | undefined;

  constructor(
    persistence: IProgressPersistence,
    autoSaveInterval: number = 5000, // 5 seconds
    logger?: Logger
  ) {
    this.persistence = persistence;
    this.logger = logger;
    this.autoSaveInterval = autoSaveInterval;

    if (autoSaveInterval > 0) {
      this.startAutoSave();
    }
  }

  async registerTracker(tracker: IProgressTracker): Promise<void> {
    const operationId = tracker.getCurrentProgress().operationId;

    // Try to restore previous state
    const savedProgress = await this.persistence.loadProgress(operationId);
    if (savedProgress) {
      // TODO: Implement progress restoration logic
      // This would involve setting the tracker state based on saved progress
    }

    this.trackers.set(operationId, {
      tracker,
      lastSaved: new Date(0), // Force initial save
    });

    // Listen for progress updates
    tracker.addProgressListener(async (update: ProgressUpdate) => {
      await this.saveProgress(operationId, update);
    });
  }

  async unregisterTracker(operationId: string): Promise<void> {
    const entry = this.trackers.get(operationId);
    if (entry) {
      // Save final state
      const progress = entry.tracker.getCurrentProgress();
      await this.persistence.saveProgress(operationId, progress);

      this.trackers.delete(operationId);

      // Clean up saved progress for completed operations
      if (
        progress.status === 'completed' ||
        progress.status === 'failed' ||
        progress.status === 'cancelled'
      ) {
        setTimeout(async () => {
          await this.persistence.deleteProgress(operationId);
        }, 60000); // Delete after 1 minute
      }
    }
  }

  private async saveProgress(operationId: string, update: ProgressUpdate): Promise<void> {
    try {
      await this.persistence.saveProgress(operationId, update);

      const entry = this.trackers.get(operationId);
      if (entry) {
        entry.lastSaved = new Date();
      }
    } catch (error) {
      this.logger?.error(`Failed to save progress for ${operationId}:`, error);
    }
  }

  private startAutoSave(): void {
    this.autoSaveTimer = setInterval(async () => {
      const now = new Date();

      for (const [operationId, entry] of this.trackers.entries()) {
        const timeSinceLastSave = now.getTime() - entry.lastSaved.getTime();

        if (timeSinceLastSave >= this.autoSaveInterval) {
          const progress = entry.tracker.getCurrentProgress();
          await this.saveProgress(operationId, progress);
        }
      }
    }, this.autoSaveInterval);
  }

  dispose(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }
}
