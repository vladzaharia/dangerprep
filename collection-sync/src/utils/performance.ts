/**
 * Performance optimization utilities for NFS operations
 * Provides concurrency control, retry mechanisms, and progress tracking
 */

import pLimit from 'p-limit';
import pRetry, { AbortError } from 'p-retry';
import pMap from 'p-map';
import { EventEmitter } from 'events';

export interface PerformanceConfig {
  /** Maximum concurrent NFS operations */
  maxConcurrency: number;
  /** Retry configuration */
  retry: {
    retries: number;
    factor: number;
    minTimeout: number;
    maxTimeout: number;
    randomize: boolean;
  };
  /** Progress reporting interval in ms */
  progressInterval: number;
}

export interface ProgressInfo {
  completed: number;
  total: number;
  percentage: number;
  currentOperation?: string;
  estimatedTimeRemaining?: number;
}

export interface OperationResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  duration: number;
}

export interface OperationStats {
  count: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  errors: number;
  errorRate: number;
  throughput: number; // operations per second
  lastExecuted: number; // timestamp
  p95Time: number; // 95th percentile response time
  p99Time: number; // 99th percentile response time
}

export interface SystemMetrics {
  memoryUsage: NodeJS.MemoryUsage;
  uptime: number;
  timestamp: number;
}

export interface PerformanceReport {
  operations: Record<string, OperationStats>;
  systemMetrics: SystemMetrics;
  summary: {
    totalOperations: number;
    totalErrors: number;
    overallErrorRate: number;
    averageResponseTime: number;
    peakMemoryUsage: number;
  };
}

/**
 * Centralized performance manager for NFS operations
 */
export class PerformanceManager extends EventEmitter {
  private static instance: PerformanceManager;
  private config: PerformanceConfig;
  private limiter: ReturnType<typeof pLimit>;
  private operationStats: Map<string, {
    count: number;
    totalTime: number;
    errors: number;
    minTime: number;
    maxTime: number;
    lastExecuted: number;
    responseTimes: number[]; // For percentile calculations
  }>;
  private startTime: number;
  private peakMemoryUsage: number;

  private constructor(config: PerformanceConfig) {
    super();
    this.config = config;
    this.limiter = pLimit(config.maxConcurrency);
    this.operationStats = new Map();
    this.startTime = Date.now();
    this.peakMemoryUsage = 0;

    // Monitor memory usage periodically
    setInterval(() => {
      const memUsage = process.memoryUsage().heapUsed;
      if (memUsage > this.peakMemoryUsage) {
        this.peakMemoryUsage = memUsage;
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * Get singleton instance
   */
  public static getInstance(config?: PerformanceConfig): PerformanceManager {
    if (!PerformanceManager.instance) {
      const defaultConfig: PerformanceConfig = {
        maxConcurrency: 5, // Conservative for NFS
        retry: {
          retries: 3,
          factor: 2,
          minTimeout: 1000,
          maxTimeout: 10000,
          randomize: true,
        },
        progressInterval: 1000,
      };
      PerformanceManager.instance = new PerformanceManager(config || defaultConfig);
    }
    return PerformanceManager.instance;
  }

  /**
   * Execute an operation with concurrency control and retry logic
   */
  public async executeOperation<T>(
    operationName: string,
    operation: () => Promise<T>,
    options?: {
      retries?: number;
      timeout?: number;
      abortSignal?: AbortSignal;
    }
  ): Promise<OperationResult<T>> {
    const startTime = Date.now();
    let attempts = 0;

    const limitedOperation = this.limiter(async () => {
      return pRetry(
        async (attemptNumber) => {
          attempts = attemptNumber;
          
          // Check for abort signal
          if (options?.abortSignal?.aborted) {
            throw new AbortError('Operation aborted');
          }

          try {
            return await operation();
          } catch (error) {
            // Log retry attempts
            if (attemptNumber > 1) {
              console.warn(`⚠️  ${operationName} attempt ${attemptNumber} failed:`, error);
            }
            throw error;
          }
        },
        {
          retries: options?.retries ?? this.config.retry.retries,
          factor: this.config.retry.factor,
          minTimeout: this.config.retry.minTimeout,
          maxTimeout: this.config.retry.maxTimeout,
          randomize: this.config.retry.randomize,
          signal: options?.abortSignal,
        }
      );
    });

    try {
      const data = await limitedOperation;
      const duration = Date.now() - startTime;
      
      this.updateStats(operationName, duration, false);
      
      return {
        success: true,
        data,
        attempts,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.updateStats(operationName, duration, true);
      
      return {
        success: false,
        error: error as Error,
        attempts,
        duration,
      };
    }
  }

  /**
   * Execute multiple operations in parallel with progress tracking
   */
  public async executeParallel<T, R>(
    items: T[],
    operation: (item: T, index: number) => Promise<R>,
    options?: {
      concurrency?: number;
      onProgress?: (progress: ProgressInfo) => void;
      operationName?: string;
    }
  ): Promise<OperationResult<R>[]> {
    const startTime = Date.now();
    const total = items.length;
    let completed = 0;

    const progressCallback = (progress: ProgressInfo) => {
      options?.onProgress?.(progress);
      this.emit('progress', progress);
    };

    // Initial progress
    progressCallback({
      completed: 0,
      total,
      percentage: 0,
      currentOperation: options?.operationName,
    });

    const results = await pMap(
      items,
      async (item, index) => {
        const result = await this.executeOperation(
          options?.operationName || 'parallel-operation',
          () => operation(item, index)
        );

        completed++;
        const percentage = Math.round((completed / total) * 100);
        const elapsed = Date.now() - startTime;
        const estimatedTimeRemaining = completed > 0 
          ? Math.round((elapsed / completed) * (total - completed))
          : undefined;

        progressCallback({
          completed,
          total,
          percentage,
          currentOperation: options?.operationName,
          estimatedTimeRemaining,
        });

        return result;
      },
      {
        concurrency: options?.concurrency || this.config.maxConcurrency,
      }
    );

    return results;
  }

  /**
   * Update operation statistics with enhanced metrics
   */
  private updateStats(operationName: string, duration: number, isError: boolean): void {
    const now = Date.now();
    const stats = this.operationStats.get(operationName) || {
      count: 0,
      totalTime: 0,
      errors: 0,
      minTime: Infinity,
      maxTime: 0,
      lastExecuted: now,
      responseTimes: []
    };

    stats.count++;
    stats.totalTime += duration;
    stats.minTime = Math.min(stats.minTime, duration);
    stats.maxTime = Math.max(stats.maxTime, duration);
    stats.lastExecuted = now;

    // Store response times for percentile calculations (keep last 1000)
    stats.responseTimes.push(duration);
    if (stats.responseTimes.length > 1000) {
      stats.responseTimes.shift();
    }

    if (isError) {
      stats.errors++;
    }

    this.operationStats.set(operationName, stats);
  }

  /**
   * Get enhanced performance statistics
   */
  public getStats(): Record<string, OperationStats> {
    const result: Record<string, OperationStats> = {};
    const now = Date.now();

    for (const [operation, stats] of this.operationStats) {
      const avgTime = stats.count > 0 ? stats.totalTime / stats.count : 0;
      const errorRate = stats.count > 0 ? (stats.errors / stats.count) * 100 : 0;
      const throughput = stats.count > 0 ? stats.count / ((now - this.startTime) / 1000) : 0;

      // Calculate percentiles
      const sortedTimes = [...stats.responseTimes].sort((a, b) => a - b);
      const p95Index = Math.floor(sortedTimes.length * 0.95);
      const p99Index = Math.floor(sortedTimes.length * 0.99);

      result[operation] = {
        count: stats.count,
        totalTime: stats.totalTime,
        avgTime: Math.round(avgTime),
        minTime: stats.minTime === Infinity ? 0 : stats.minTime,
        maxTime: stats.maxTime,
        errors: stats.errors,
        errorRate: Math.round(errorRate * 100) / 100,
        throughput: Math.round(throughput * 100) / 100,
        lastExecuted: stats.lastExecuted,
        p95Time: sortedTimes[p95Index] || 0,
        p99Time: sortedTimes[p99Index] || 0,
      };
    }

    return result;
  }

  /**
   * Get comprehensive performance report
   */
  public getPerformanceReport(): PerformanceReport {
    const operations = this.getStats();
    const systemMetrics = this.getSystemMetrics();

    // Calculate summary statistics
    let totalOperations = 0;
    let totalErrors = 0;
    let totalResponseTime = 0;

    for (const stats of Object.values(operations)) {
      totalOperations += stats.count;
      totalErrors += stats.errors;
      totalResponseTime += stats.totalTime;
    }

    const overallErrorRate = totalOperations > 0 ? (totalErrors / totalOperations) * 100 : 0;
    const averageResponseTime = totalOperations > 0 ? totalResponseTime / totalOperations : 0;

    return {
      operations,
      systemMetrics,
      summary: {
        totalOperations,
        totalErrors,
        overallErrorRate: Math.round(overallErrorRate * 100) / 100,
        averageResponseTime: Math.round(averageResponseTime),
        peakMemoryUsage: this.peakMemoryUsage,
      },
    };
  }

  /**
   * Get current system metrics
   */
  public getSystemMetrics(): SystemMetrics {
    return {
      memoryUsage: process.memoryUsage(),
      uptime: Date.now() - this.startTime,
      timestamp: Date.now(),
    };
  }

  /**
   * Reset statistics
   */
  public resetStats(): void {
    this.operationStats.clear();
    this.startTime = Date.now();
    this.peakMemoryUsage = 0;
  }

  /**
   * Export performance data to JSON
   */
  public exportPerformanceData(): string {
    return JSON.stringify(this.getPerformanceReport(), null, 2);
  }

  /**
   * Log performance summary to console
   */
  public logPerformanceSummary(): void {
    const report = this.getPerformanceReport();

    console.log('\n📊 Performance Summary');
    console.log('='.repeat(50));
    console.log(`Total Operations: ${report.summary.totalOperations}`);
    console.log(`Total Errors: ${report.summary.totalErrors} (${report.summary.overallErrorRate}%)`);
    console.log(`Average Response Time: ${report.summary.averageResponseTime}ms`);
    console.log(`Peak Memory Usage: ${Math.round(report.summary.peakMemoryUsage / 1024 / 1024)}MB`);
    console.log(`Uptime: ${Math.round(report.systemMetrics.uptime / 1000)}s`);

    console.log('\n📈 Operation Details:');
    for (const [operation, stats] of Object.entries(report.operations)) {
      console.log(`  ${operation}:`);
      console.log(`    Count: ${stats.count}, Avg: ${stats.avgTime}ms, Errors: ${stats.errorRate}%`);
      console.log(`    P95: ${stats.p95Time}ms, P99: ${stats.p99Time}ms, Throughput: ${stats.throughput} ops/s`);
    }
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<PerformanceConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.maxConcurrency) {
      this.limiter = pLimit(config.maxConcurrency);
    }
  }

  /**
   * Get current configuration
   */
  public getConfig(): PerformanceConfig {
    return { ...this.config };
  }
}

/**
 * Utility function to create a performance-optimized file system operation
 */
export function createOptimizedOperation<T>(
  operationName: string,
  operation: () => Promise<T>,
  options?: {
    retries?: number;
    timeout?: number;
  }
): () => Promise<T> {
  const perfManager = PerformanceManager.getInstance();
  
  return async () => {
    const result = await perfManager.executeOperation(operationName, operation, options);
    if (!result.success) {
      throw result.error;
    }
    return result.data!;
  };
}

/**
 * Utility function for batch processing with progress tracking
 */
export async function processBatch<T, R>(
  items: T[],
  operation: (item: T, index: number) => Promise<R>,
  options?: {
    batchSize?: number;
    onProgress?: (progress: ProgressInfo) => void;
    operationName?: string;
  }
): Promise<R[]> {
  const perfManager = PerformanceManager.getInstance();
  const batchSize = options?.batchSize || 10;
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await perfManager.executeParallel(
      batch,
      operation,
      {
        ...options,
        operationName: `${options?.operationName || 'batch'}-${Math.floor(i / batchSize) + 1}`,
      }
    );
    
    // Extract successful results
    for (const result of batchResults) {
      if (result.success) {
        results.push(result.data!);
      } else {
        throw result.error;
      }
    }
  }
  
  return results;
}
