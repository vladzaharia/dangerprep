#!/usr/bin/env node

/**
 * Performance Testing Script for Collection Sync Optimizations
 * 
 * This script validates the performance improvements made to the collection-sync system,
 * particularly for NFS network storage and large-scale syncing operations.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { CollectionAnalyzer } from './src/core/analyzer.js';
import { FileSystemManager } from './src/core/filesystem.js';
import { PerformanceManager } from './src/utils/performance.js';
import { MetadataCache } from './src/core/cache.js';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class PerformanceTestSuite {
  constructor() {
    this.testDir = join(__dirname, 'test-data');
    this.results = [];
    this.perfManager = PerformanceManager.getInstance({
      maxConcurrency: 5,
      retry: {
        retries: 3,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 10000,
      },
    });
  }

  /**
   * Setup test environment with mock data
   */
  async setupTestEnvironment() {
    console.log(chalk.blue('🔧 Setting up test environment...'));
    
    // Clean up existing test data
    if (existsSync(this.testDir)) {
      rmSync(this.testDir, { recursive: true, force: true });
    }
    
    // Create test directory structure
    mkdirSync(this.testDir, { recursive: true });
    
    // Create mock NFS-like directory structure
    const categories = ['movies', 'tv', 'games', 'webtv'];
    const testSizes = {
      small: 50,    // 50 items
      medium: 200,  // 200 items
      large: 1000,  // 1000 items
    };

    for (const category of categories) {
      const categoryDir = join(this.testDir, category);
      mkdirSync(categoryDir, { recursive: true });
      
      // Create test items for each size category
      for (const [size, count] of Object.entries(testSizes)) {
        const sizeDir = join(categoryDir, size);
        mkdirSync(sizeDir, { recursive: true });
        
        for (let i = 0; i < count; i++) {
          const itemDir = join(sizeDir, `test-item-${i.toString().padStart(4, '0')}`);
          mkdirSync(itemDir, { recursive: true });
          
          // Create some mock media files
          const mediaExtensions = ['.mkv', '.mp4', '.avi', '.mp3', '.flac'];
          const numFiles = Math.floor(Math.random() * 5) + 1;
          
          for (let j = 0; j < numFiles; j++) {
            const ext = mediaExtensions[Math.floor(Math.random() * mediaExtensions.length)];
            const filename = `file-${j}${ext}`;
            const filepath = join(itemDir, filename);
            
            // Create files with some content to simulate real files
            const content = 'x'.repeat(Math.floor(Math.random() * 1000) + 100);
            writeFileSync(filepath, content);
          }
        }
      }
    }
    
    console.log(chalk.green('✅ Test environment setup complete'));
  }

  /**
   * Test FileSystemManager performance
   */
  async testFileSystemManager() {
    console.log(chalk.blue('\n📁 Testing FileSystemManager performance...'));
    
    const fs = new FileSystemManager();
    const testPaths = [
      join(this.testDir, 'movies', 'small'),
      join(this.testDir, 'movies', 'medium'),
      join(this.testDir, 'tv', 'large'),
    ];

    const results = [];

    for (const testPath of testPaths) {
      console.log(chalk.gray(`Testing path: ${testPath}`));
      
      // Test without streaming
      const startTime = Date.now();
      const info1 = await fs.getDirectoryInfo(testPath, { useStreaming: false });
      const timeWithoutStreaming = Date.now() - startTime;
      
      // Test with streaming
      const startTime2 = Date.now();
      const info2 = await fs.getDirectoryInfo(testPath, { useStreaming: true });
      const timeWithStreaming = Date.now() - startTime2;
      
      const improvement = ((timeWithoutStreaming - timeWithStreaming) / timeWithoutStreaming) * 100;
      
      results.push({
        path: testPath,
        withoutStreaming: timeWithoutStreaming,
        withStreaming: timeWithStreaming,
        improvement: improvement,
        fileCount: info1.fileCount,
        mediaCount: info1.mediaFileCount,
      });
      
      console.log(chalk.yellow(`  Without streaming: ${timeWithoutStreaming}ms`));
      console.log(chalk.green(`  With streaming: ${timeWithStreaming}ms`));
      console.log(chalk.cyan(`  Improvement: ${improvement.toFixed(1)}%`));
    }

    this.results.push({
      test: 'FileSystemManager',
      results,
    });
  }

  /**
   * Test caching system performance
   */
  async testCachingSystem() {
    console.log(chalk.blue('\n💾 Testing caching system performance...'));
    
    const cache = new MetadataCache(this.testDir);
    await cache.loadCache();
    
    const fs = new FileSystemManager();
    const testPath = join(this.testDir, 'movies', 'medium');
    
    // First run (cold cache)
    const startTime1 = Date.now();
    const info1 = await fs.getDirectoryInfo(testPath);
    cache.setCachedInfo(testPath, info1);
    const coldTime = Date.now() - startTime1;
    
    // Second run (warm cache)
    const startTime2 = Date.now();
    const cachedInfo = cache.getCachedInfo(testPath);
    const warmTime = Date.now() - startTime2;
    
    const improvement = ((coldTime - warmTime) / coldTime) * 100;
    
    console.log(chalk.yellow(`  Cold cache: ${coldTime}ms`));
    console.log(chalk.green(`  Warm cache: ${warmTime}ms`));
    console.log(chalk.cyan(`  Cache hit improvement: ${improvement.toFixed(1)}%`));
    
    // Test cache preloading
    const preloadPaths = [
      join(this.testDir, 'tv', 'small'),
      join(this.testDir, 'games', 'small'),
    ];
    
    const preloadStart = Date.now();
    await cache.preloadPaths(preloadPaths);
    const preloadTime = Date.now() - preloadStart;
    
    console.log(chalk.blue(`  Preload time for ${preloadPaths.length} paths: ${preloadTime}ms`));
    
    this.results.push({
      test: 'CachingSystem',
      coldTime,
      warmTime,
      improvement,
      preloadTime,
    });
  }

  /**
   * Test parallel processing performance
   */
  async testParallelProcessing() {
    console.log(chalk.blue('\n⚡ Testing parallel processing performance...'));
    
    const testPaths = [
      join(this.testDir, 'movies', 'small'),
      join(this.testDir, 'tv', 'small'),
      join(this.testDir, 'games', 'small'),
      join(this.testDir, 'webtv', 'small'),
    ];

    const fs = new FileSystemManager();
    
    // Sequential processing
    const sequentialStart = Date.now();
    const sequentialResults = [];
    for (const path of testPaths) {
      const info = await fs.getDirectoryInfo(path);
      sequentialResults.push(info);
    }
    const sequentialTime = Date.now() - sequentialStart;
    
    // Parallel processing
    const parallelStart = Date.now();
    const parallelResults = await this.perfManager.executeParallel(
      testPaths,
      async (path) => await fs.getDirectoryInfo(path),
      {
        concurrency: 4,
        operationName: 'parallelDirectoryInfo',
      }
    );
    const parallelTime = Date.now() - parallelStart;
    
    const improvement = ((sequentialTime - parallelTime) / sequentialTime) * 100;
    
    console.log(chalk.yellow(`  Sequential: ${sequentialTime}ms`));
    console.log(chalk.green(`  Parallel: ${parallelTime}ms`));
    console.log(chalk.cyan(`  Parallel improvement: ${improvement.toFixed(1)}%`));
    
    this.results.push({
      test: 'ParallelProcessing',
      sequentialTime,
      parallelTime,
      improvement,
      pathCount: testPaths.length,
    });
  }

  /**
   * Generate performance report
   */
  generateReport() {
    console.log(chalk.bold.blue('\n📊 Performance Test Results'));
    console.log('='.repeat(60));
    
    for (const result of this.results) {
      console.log(chalk.bold.green(`\n${result.test}:`));
      
      if (result.test === 'FileSystemManager') {
        let totalImprovement = 0;
        for (const pathResult of result.results) {
          console.log(chalk.gray(`  ${pathResult.path}:`));
          console.log(chalk.yellow(`    Files: ${pathResult.fileCount}, Media: ${pathResult.mediaCount}`));
          console.log(chalk.cyan(`    Streaming improvement: ${pathResult.improvement.toFixed(1)}%`));
          totalImprovement += pathResult.improvement;
        }
        const avgImprovement = totalImprovement / result.results.length;
        console.log(chalk.bold.cyan(`  Average improvement: ${avgImprovement.toFixed(1)}%`));
      } else if (result.test === 'CachingSystem') {
        console.log(chalk.cyan(`  Cache hit improvement: ${result.improvement.toFixed(1)}%`));
        console.log(chalk.blue(`  Preload performance: ${result.preloadTime}ms`));
      } else if (result.test === 'ParallelProcessing') {
        console.log(chalk.cyan(`  Parallel improvement: ${result.improvement.toFixed(1)}%`));
        console.log(chalk.gray(`  Processed ${result.pathCount} paths`));
      }
    }
    
    // Display performance manager statistics
    console.log(chalk.bold.blue('\n⚡ Performance Manager Statistics'));
    this.perfManager.logPerformanceSummary();
  }

  /**
   * Cleanup test environment
   */
  cleanup() {
    console.log(chalk.blue('\n🧹 Cleaning up test environment...'));
    if (existsSync(this.testDir)) {
      rmSync(this.testDir, { recursive: true, force: true });
    }
    console.log(chalk.green('✅ Cleanup complete'));
  }

  /**
   * Run all performance tests
   */
  async runAllTests() {
    try {
      await this.setupTestEnvironment();
      await this.testFileSystemManager();
      await this.testCachingSystem();
      await this.testParallelProcessing();
      this.generateReport();
    } catch (error) {
      console.error(chalk.red('❌ Performance test failed:'), error);
      process.exit(1);
    } finally {
      this.cleanup();
    }
  }
}

// Run tests if this script is executed directly
if (process.argv[1] === __filename) {
  const testSuite = new PerformanceTestSuite();
  testSuite.runAllTests().then(() => {
    console.log(chalk.bold.green('\n🎉 All performance tests completed successfully!'));
    process.exit(0);
  }).catch((error) => {
    console.error(chalk.red('❌ Test suite failed:'), error);
    process.exit(1);
  });
}

export { PerformanceTestSuite };
