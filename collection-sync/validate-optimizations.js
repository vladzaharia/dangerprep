#!/usr/bin/env node

/**
 * Quick validation script to ensure all optimizations are working correctly
 * This script performs basic smoke tests on the optimized collection-sync system
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class OptimizationValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.successes = [];
  }

  log(type, message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    
    switch (type) {
      case 'error':
        this.errors.push(logMessage);
        console.log(chalk.red('❌ ' + message));
        break;
      case 'warning':
        this.warnings.push(logMessage);
        console.log(chalk.yellow('⚠️  ' + message));
        break;
      case 'success':
        this.successes.push(logMessage);
        console.log(chalk.green('✅ ' + message));
        break;
      case 'info':
        console.log(chalk.blue('ℹ️  ' + message));
        break;
    }
  }

  /**
   * Validate that all required files exist
   */
  validateFileStructure() {
    this.log('info', 'Validating file structure...');
    
    const requiredFiles = [
      'src/utils/performance.ts',
      'src/utils/streaming.ts',
      'src/core/filesystem.ts',
      'src/core/analyzer.ts',
      'src/core/cache.ts',
      'src/cli/commands.ts',
      'package.json',
    ];

    for (const file of requiredFiles) {
      const filePath = join(__dirname, file);
      if (existsSync(filePath)) {
        this.log('success', `Found required file: ${file}`);
      } else {
        this.log('error', `Missing required file: ${file}`);
      }
    }
  }

  /**
   * Validate that performance dependencies are installed
   */
  async validateDependencies() {
    this.log('info', 'Validating performance dependencies...');
    
    try {
      const packageJson = await import('./package.json', { assert: { type: 'json' } });
      const dependencies = { ...packageJson.default.dependencies, ...packageJson.default.devDependencies };
      
      const requiredDeps = [
        'p-limit',
        'p-retry',
        'p-map',
        'p-queue',
      ];

      for (const dep of requiredDeps) {
        if (dependencies[dep]) {
          this.log('success', `Found dependency: ${dep}@${dependencies[dep]}`);
        } else {
          this.log('error', `Missing dependency: ${dep}`);
        }
      }
    } catch (error) {
      this.log('error', `Failed to validate dependencies: ${error.message}`);
    }
  }

  /**
   * Validate that core classes can be imported
   */
  async validateImports() {
    this.log('info', 'Validating module imports...');
    
    try {
      const { PerformanceManager } = await import('./src/utils/performance.js');
      this.log('success', 'PerformanceManager imported successfully');
      
      // Test singleton pattern
      const instance1 = PerformanceManager.getInstance();
      const instance2 = PerformanceManager.getInstance();
      if (instance1 === instance2) {
        this.log('success', 'PerformanceManager singleton pattern working');
      } else {
        this.log('error', 'PerformanceManager singleton pattern broken');
      }
    } catch (error) {
      this.log('error', `Failed to import PerformanceManager: ${error.message}`);
    }

    try {
      const { DirectoryStream } = await import('./src/utils/streaming.js');
      this.log('success', 'DirectoryStream imported successfully');
    } catch (error) {
      this.log('error', `Failed to import DirectoryStream: ${error.message}`);
    }

    try {
      const { FileSystemManager } = await import('./src/core/filesystem.js');
      this.log('success', 'FileSystemManager imported successfully');
    } catch (error) {
      this.log('error', `Failed to import FileSystemManager: ${error.message}`);
    }

    try {
      const { MetadataCache } = await import('./src/core/cache.js');
      this.log('success', 'MetadataCache imported successfully');
    } catch (error) {
      this.log('error', `Failed to import MetadataCache: ${error.message}`);
    }
  }

  /**
   * Test basic functionality of optimized components
   */
  async testBasicFunctionality() {
    this.log('info', 'Testing basic functionality...');
    
    try {
      // Test PerformanceManager
      const { PerformanceManager } = await import('./src/utils/performance.js');
      const perfManager = PerformanceManager.getInstance();
      
      // Test operation execution
      const result = await perfManager.executeOperation('test', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'test-result';
      });
      
      if (result.success && result.data === 'test-result') {
        this.log('success', 'PerformanceManager operation execution working');
      } else {
        this.log('error', 'PerformanceManager operation execution failed');
      }
      
      // Test statistics
      const stats = perfManager.getStats();
      if (stats.test && stats.test.count === 1) {
        this.log('success', 'PerformanceManager statistics tracking working');
      } else {
        this.log('error', 'PerformanceManager statistics tracking failed');
      }
      
    } catch (error) {
      this.log('error', `Basic functionality test failed: ${error.message}`);
    }
  }

  /**
   * Test streaming functionality
   */
  async testStreamingFunctionality() {
    this.log('info', 'Testing streaming functionality...');
    
    try {
      const { createDirectoryScanner } = await import('./src/utils/streaming.js');
      
      // Test with current directory (should exist)
      const scanner = createDirectoryScanner(__dirname, {
        recursive: false,
        includeFiles: true,
        includeDirectories: false,
      });
      
      let fileCount = 0;
      scanner.on('data', (entry) => {
        fileCount++;
      });
      
      await new Promise((resolve, reject) => {
        scanner.on('end', resolve);
        scanner.on('error', reject);
      });
      
      if (fileCount > 0) {
        this.log('success', `DirectoryStream processed ${fileCount} files`);
      } else {
        this.log('warning', 'DirectoryStream processed 0 files (might be expected)');
      }
      
    } catch (error) {
      this.log('error', `Streaming functionality test failed: ${error.message}`);
    }
  }

  /**
   * Generate validation report
   */
  generateReport() {
    console.log(chalk.bold.blue('\n📋 Validation Report'));
    console.log('='.repeat(50));
    
    console.log(chalk.green(`✅ Successes: ${this.successes.length}`));
    console.log(chalk.yellow(`⚠️  Warnings: ${this.warnings.length}`));
    console.log(chalk.red(`❌ Errors: ${this.errors.length}`));
    
    if (this.errors.length > 0) {
      console.log(chalk.bold.red('\n❌ Errors:'));
      this.errors.forEach(error => console.log(chalk.red(`  ${error}`)));
    }
    
    if (this.warnings.length > 0) {
      console.log(chalk.bold.yellow('\n⚠️  Warnings:'));
      this.warnings.forEach(warning => console.log(chalk.yellow(`  ${warning}`)));
    }
    
    const isValid = this.errors.length === 0;
    
    if (isValid) {
      console.log(chalk.bold.green('\n🎉 All optimizations validated successfully!'));
      console.log(chalk.green('The collection-sync system is ready for high-performance operations.'));
    } else {
      console.log(chalk.bold.red('\n💥 Validation failed!'));
      console.log(chalk.red('Please fix the errors above before using the optimized system.'));
    }
    
    return isValid;
  }

  /**
   * Run all validation tests
   */
  async runValidation() {
    console.log(chalk.bold.blue('🔍 Collection Sync Optimization Validator'));
    console.log(chalk.gray('Validating performance optimizations and system integrity...\n'));
    
    try {
      this.validateFileStructure();
      await this.validateDependencies();
      await this.validateImports();
      await this.testBasicFunctionality();
      await this.testStreamingFunctionality();
      
      const isValid = this.generateReport();
      return isValid;
    } catch (error) {
      this.log('error', `Validation failed with unexpected error: ${error.message}`);
      console.error(chalk.red('\n💥 Validation crashed:'), error);
      return false;
    }
  }
}

// Run validation if this script is executed directly
if (process.argv[1] === __filename) {
  const validator = new OptimizationValidator();
  validator.runValidation().then((isValid) => {
    process.exit(isValid ? 0 : 1);
  }).catch((error) => {
    console.error(chalk.red('❌ Validator crashed:'), error);
    process.exit(1);
  });
}

export { OptimizationValidator };
