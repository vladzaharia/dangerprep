
import { loadConfig } from '../config/loader.js';
import { CollectionAnalyzer } from '../core/analyzer.js';
import { CSVExporter } from '../exports/csv.js';
import { RsyncScriptExporter } from '../exports/rsync.js';
import { MarkdownExporter } from '../exports/markdown.js';
import { FileSystemManager } from '../core/filesystem.js';
import { resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';
import chalk from 'chalk';
import ora from 'ora';

export interface AnalyzeOptions {
  config?: string;
  nfsPath?: string;
  outputDir?: string;
  csvName?: string;
  scriptName?: string;
  markdownName?: string;
  destination?: string;
  cleanup?: boolean;
  cacheDir?: string;
}

export interface FindOptions {
  config?: string;
  nfsPath?: string;
  threshold?: number;
  maxResults?: number;
}

export interface KiwixOptions {
  config?: string;
  outputDir?: string;
  force?: boolean;
  testOnly?: boolean;
}

export class CLICommands {
  /**
   * Analyze command - Main analysis and report generation
   */
  static async analyze(options: AnalyzeOptions): Promise<void> {
    const spinner = ora('Loading configuration...').start();
    
    try {
      // Load configuration
      const config = loadConfig(options.config);
      spinner.succeed('Configuration loaded');

      // Override NFS path if provided
      if (options.nfsPath) {
        config.nfs_paths.base = options.nfsPath;
        config.nfs_paths.movies = resolve(options.nfsPath, 'movies');
        config.nfs_paths.tv = resolve(options.nfsPath, 'tv');
        config.nfs_paths.games = resolve(options.nfsPath, 'games');
        config.nfs_paths.webtv = resolve(options.nfsPath, 'webtv');
      }

      // Setup output directory
      const outputDir = resolve(options.outputDir || './out');
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      // Initialize analyzer
      spinner.text = 'Initializing analyzer...';
      const analyzer = new CollectionAnalyzer(options.cacheDir);
      await analyzer.initialize();
      spinner.succeed('Analyzer initialized');

      // Perform analysis
      spinner.text = 'Analyzing collection...';
      spinner.start();
      const { analyses, stats } = await analyzer.analyzeCollection();
      spinner.succeed(`Analysis complete - Found ${stats.found_items}/${stats.total_items} items`);

      // Generate exports
      const csvName = options.csvName || config.output_config.default_csv_name;
      const scriptName = options.scriptName || config.output_config.default_rsync_script;
      const markdownName = options.markdownName || config.output_config.default_markdown_name;
      const destination = options.destination || config.output_config.default_destination;

      // Export CSV
      spinner.text = 'Generating CSV report...';
      spinner.start();
      const csvExporter = new CSVExporter();
      await csvExporter.export(analyses, resolve(outputDir, csvName));
      spinner.succeed(`CSV report saved: ${csvName}`);

      // Export Rsync Script
      spinner.text = 'Generating rsync script...';
      spinner.start();
      const rsyncExporter = new RsyncScriptExporter();
      await rsyncExporter.export(analyses, resolve(outputDir, scriptName), destination);
      spinner.succeed(`Rsync script saved: ${scriptName}`);

      // Export Markdown Summary
      spinner.text = 'Generating markdown summary...';
      spinner.start();
      const markdownExporter = new MarkdownExporter();
      await markdownExporter.export(analyses, stats, resolve(outputDir, markdownName));
      spinner.succeed(`Markdown summary saved: ${markdownName}`);

      // Get effective drive size for display
      const fs = new FileSystemManager();
      const effectiveDriveSize = await fs.getEffectiveDriveSize(
        destination,
        config.drive_config.size_gb
      );

      // Display summary
      console.log('\n' + chalk.bold.green('📊 Collection Analysis Summary'));
      console.log(chalk.cyan(`Total Items: ${stats.total_items}`));
      console.log(chalk.green(`Found: ${stats.found_items}`));
      console.log(chalk.red(`Missing: ${stats.missing_items}`));
      console.log(chalk.yellow(`Empty: ${stats.empty_items}`));
      console.log(chalk.blue(`Current Size: ${stats.total_size_gb.toFixed(2)} GB`));
      console.log(chalk.magenta(`Total Required: ${stats.space_allocation.totals.total_size_gb.toFixed(2)} GB`));
      console.log(chalk.cyan(`Download Needed: ${stats.space_allocation.totals.required_download_size_gb.toFixed(2)} GB`));
      console.log(chalk.gray(`Drive Usage: ${stats.drive_usage_percent.toFixed(1)}% current, ${(stats.space_allocation.totals.total_size_gb / effectiveDriveSize * 100).toFixed(1)}% when complete`));

      // Usage warnings
      if (stats.drive_usage_percent > config.drive_config.safe_usage_threshold * 100) {
        console.log(chalk.red.bold(`⚠️  WARNING: Drive usage exceeds safe threshold (${config.drive_config.safe_usage_threshold * 100}%)`));
      } else if (stats.drive_usage_percent > config.drive_config.recommended_max_usage * 100) {
        console.log(chalk.yellow.bold(`⚠️  CAUTION: Drive usage exceeds recommended maximum (${config.drive_config.recommended_max_usage * 100}%)`));
      }

      console.log(chalk.gray(`\nOutput files saved to: ${outputDir}`));

    } catch (error) {
      spinner.fail('Analysis failed');
      if (error instanceof Error) {
        console.error(chalk.red(`Error: ${error.message}`));
      } else {
        console.error(chalk.red('Unknown error occurred'));
      }
      process.exit(1);
    }
  }

  /**
   * Find command - Smart content discovery
   */
  static async find(searchTerm: string, options: FindOptions): Promise<void> {
    const spinner = ora('Loading configuration...').start();
    
    try {
      // Load configuration
      const config = loadConfig(options.config);
      spinner.succeed('Configuration loaded');

      // Override NFS path if provided
      if (options.nfsPath) {
        config.nfs_paths.base = options.nfsPath;
        config.nfs_paths.movies = resolve(options.nfsPath, 'movies');
        config.nfs_paths.tv = resolve(options.nfsPath, 'tv');
        config.nfs_paths.games = resolve(options.nfsPath, 'games');
        config.nfs_paths.webtv = resolve(options.nfsPath, 'webtv');
      }

      // Initialize analyzer
      spinner.text = 'Scanning available content...';
      const analyzer = new CollectionAnalyzer();
      await analyzer.initialize();
      
      // This would need to be implemented in the analyzer
      // For now, just show a placeholder
      spinner.succeed(`Search results for "${searchTerm}"`);
      console.log(chalk.yellow('🔍 Smart content discovery feature coming soon!'));

    } catch (error) {
      spinner.fail('Search failed');
      if (error instanceof Error) {
        console.error(chalk.red(`Error: ${error.message}`));
      } else {
        console.error(chalk.red('Unknown error occurred'));
      }
      process.exit(1);
    }
  }

  /**
   * Cache command - Cache management
   */
  static async cache(action: 'clear' | 'stats', options: { cacheDir?: string; config?: string }): Promise<void> {
    try {
      // Load configuration first
      loadConfig(options.config);

      const analyzer = new CollectionAnalyzer(options.cacheDir);
      await analyzer.initialize();

      switch (action) {
        case 'clear':
          analyzer.clearCache();
          console.log(chalk.green('✅ Cache cleared successfully'));
          break;
        
        case 'stats':
          const stats = analyzer.getCacheStats();
          console.log(chalk.bold.blue('📊 Cache Statistics'));
          console.log(chalk.cyan(`Total Entries: ${stats.totalEntries}`));
          if (stats.totalEntries > 0) {
            console.log(chalk.cyan(`Oldest Entry: ${new Date(stats.oldestEntry).toLocaleString()}`));
            console.log(chalk.cyan(`Newest Entry: ${new Date(stats.newestEntry).toLocaleString()}`));
          }
          break;
      }

    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`Error: ${error.message}`));
      } else {
        console.error(chalk.red('Unknown error occurred'));
      }
      process.exit(1);
    }
  }

  /**
   * Kiwix test-mirrors command - Test download speeds for all mirrors
   */
  static async kiwixTestMirrors(options: KiwixOptions): Promise<void> {
    const spinner = ora('Loading configuration...').start();

    try {
      // Load configuration
      loadConfig(options.config);
      spinner.succeed('Configuration loaded');

      // Initialize analyzer to get Kiwix analyzer
      spinner.text = 'Initializing Kiwix analyzer...';
      const analyzer = new CollectionAnalyzer();
      await analyzer.initialize();
      const kiwixAnalyzer = analyzer.getKiwixAnalyzer();
      spinner.succeed('Kiwix analyzer initialized');

      // Test mirror speeds
      spinner.text = 'Testing mirror speeds...';
      spinner.start();
      const speedTests = await kiwixAnalyzer.getDownloader().testMirrorSpeeds();
      spinner.succeed('Mirror speed tests complete');

      // Display results
      console.log(chalk.bold.blue('\n🚀 Mirror Speed Test Results'));
      console.log(chalk.gray('─'.repeat(60)));

      speedTests.forEach((test, index) => {
        const rank = index + 1;
        const status = test.success ? chalk.green('✅') : chalk.red('❌');
        const speed = test.success ? chalk.cyan(`${test.speed_mbps.toFixed(1)} Mbps`) : chalk.red('Failed');
        const latency = test.success ? chalk.yellow(`${test.latency_ms}ms`) : chalk.red(test.error || 'Unknown error');

        console.log(`${rank}. ${status} ${chalk.bold(test.mirror.name)}`);
        console.log(`   Speed: ${speed} | Latency: ${latency}`);
        console.log(`   URL: ${chalk.dim(test.mirror.url)}`);
        console.log('');
      });

      const workingMirrors = speedTests.filter(test => test.success);
      if (workingMirrors.length > 0) {
        const best = workingMirrors[0]!;
        console.log(chalk.bold.green(`🏆 Best mirror: ${best.mirror.name} (${best.speed_mbps.toFixed(1)} Mbps)`));
      } else {
        console.log(chalk.bold.red('❌ No working mirrors found'));
      }

    } catch (error) {
      spinner.fail('Mirror test failed');
      if (error instanceof Error) {
        console.error(chalk.red(`Error: ${error.message}`));
      } else {
        console.error(chalk.red('Unknown error occurred'));
      }
      process.exit(1);
    }
  }

  /**
   * Kiwix check command - Check for updates to ZIM files
   */
  static async kiwixCheck(options: KiwixOptions): Promise<void> {
    const spinner = ora('Loading configuration...').start();

    try {
      // Load configuration
      loadConfig(options.config);
      spinner.succeed('Configuration loaded');

      // Initialize analyzer to get Kiwix analyzer
      spinner.text = 'Initializing Kiwix analyzer...';
      const analyzer = new CollectionAnalyzer();
      await analyzer.initialize();
      const kiwixAnalyzer = analyzer.getKiwixAnalyzer();
      spinner.succeed('Kiwix analyzer initialized');

      // Check for updates
      spinner.text = 'Checking for updates...';
      spinner.start();
      const updateInfo = await kiwixAnalyzer.checkForUpdates();
      spinner.succeed('Update check complete');

      // Display results
      console.log(chalk.bold.blue('\n📚 Kiwix Content Status'));
      console.log(chalk.gray('─'.repeat(60)));

      updateInfo.forEach(info => {
        let status: string;
        let statusColor: (str: string) => string;

        if (!info.exists) {
          status = '📥 NOT DOWNLOADED';
          statusColor = chalk.red;
        } else if (info.needs_update) {
          status = '🔄 UPDATE NEEDED';
          statusColor = chalk.yellow;
        } else {
          status = '✅ UP TO DATE';
          statusColor = chalk.green;
        }

        console.log(`${statusColor(status)} ${chalk.bold(info.name)}`);
        console.log(`   Category: ${chalk.cyan(info.category)}`);
        console.log(`   Size: ${chalk.yellow(info.size_gb.toFixed(1))}GB / ${chalk.dim(info.expected_size_gb.toFixed(1))}GB expected`);
        console.log(`   Priority: ${chalk.magenta(info.priority)}`);
        if (info.description) {
          console.log(`   Description: ${chalk.dim(info.description)}`);
        }
        console.log(`   Path: ${chalk.dim(info.local_path)}`);
        console.log('');
      });

      // Summary
      const downloaded = updateInfo.filter(info => info.exists && !info.needs_update);
      const needsUpdate = updateInfo.filter(info => info.needs_update);
      const missing = updateInfo.filter(info => !info.exists);

      console.log(chalk.bold.blue('📊 Summary'));
      console.log(`${chalk.green('✅')} Up to date: ${downloaded.length}`);
      console.log(`${chalk.yellow('🔄')} Need updates: ${needsUpdate.length}`);
      console.log(`${chalk.red('📥')} Not downloaded: ${missing.length}`);

      const totalSize = updateInfo.reduce((sum, info) => sum + info.size_gb, 0);
      const expectedSize = updateInfo.reduce((sum, info) => sum + info.expected_size_gb, 0);
      console.log(`${chalk.cyan('💾')} Total size: ${totalSize.toFixed(1)}GB / ${expectedSize.toFixed(1)}GB expected`);

    } catch (error) {
      spinner.fail('Update check failed');
      if (error instanceof Error) {
        console.error(chalk.red(`Error: ${error.message}`));
      } else {
        console.error(chalk.red('Unknown error occurred'));
      }
      process.exit(1);
    }
  }

  /**
   * Kiwix sync command - Download/update ZIM files
   */
  static async kiwixSync(options: KiwixOptions): Promise<void> {
    const spinner = ora('Loading configuration...').start();

    try {
      // Load configuration
      loadConfig(options.config);
      spinner.succeed('Configuration loaded');

      // Initialize analyzer to get Kiwix analyzer
      spinner.text = 'Initializing Kiwix analyzer...';
      const analyzer = new CollectionAnalyzer();
      await analyzer.initialize();
      const kiwixAnalyzer = analyzer.getKiwixAnalyzer();
      const downloader = kiwixAnalyzer.getDownloader();
      spinner.succeed('Kiwix analyzer initialized');

      if (options.testOnly) {
        // Just test mirrors, don't download
        await CLICommands.kiwixTestMirrors(options);
        return;
      }

      // Perform sync
      spinner.text = 'Starting Kiwix sync...';
      spinner.start();
      const syncResult = await downloader.syncFiles();
      spinner.succeed('Kiwix sync complete');

      // Display results
      console.log(chalk.bold.blue('\n📦 Kiwix Sync Results'));
      console.log(chalk.gray('─'.repeat(60)));

      if (syncResult.downloaded.length > 0) {
        console.log(chalk.bold.green(`✅ Downloaded (${syncResult.downloaded.length} files):`));
        syncResult.downloaded.forEach(file => {
          console.log(`   ${chalk.green('✓')} ${file.name} (${file.size_gb.toFixed(1)}GB)`);
        });
        console.log('');
      }

      if (syncResult.skipped.length > 0) {
        console.log(chalk.bold.yellow(`⏭️  Skipped (${syncResult.skipped.length} files):`));
        syncResult.skipped.forEach(file => {
          console.log(`   ${chalk.yellow('⏭')} ${file.name} (already up to date)`);
        });
        console.log('');
      }

      if (syncResult.failed.length > 0) {
        console.log(chalk.bold.red(`❌ Failed (${syncResult.failed.length} files):`));
        syncResult.failed.forEach(file => {
          console.log(`   ${chalk.red('✗')} ${file.name}`);
        });
        console.log('');
      }

      // Summary
      console.log(chalk.bold.blue('📊 Summary'));
      console.log(`${chalk.green('✅')} Downloaded: ${syncResult.downloaded.length} files`);
      console.log(`${chalk.yellow('⏭️')} Skipped: ${syncResult.skipped.length} files`);
      console.log(`${chalk.red('❌')} Failed: ${syncResult.failed.length} files`);
      console.log(`${chalk.cyan('💾')} Total downloaded: ${syncResult.total_size_gb.toFixed(1)}GB`);
      console.log(`${chalk.magenta('⏱️')} Time taken: ${syncResult.download_time_seconds.toFixed(1)}s`);

      if (syncResult.failed.length > 0) {
        console.log(chalk.red('\n⚠️  Some downloads failed. Please check your internet connection and try again.'));
        process.exit(1);
      } else if (syncResult.downloaded.length > 0) {
        console.log(chalk.green('\n🎉 All Kiwix content successfully downloaded!'));
      } else {
        console.log(chalk.blue('\n✨ All Kiwix content is already up to date.'));
      }

    } catch (error) {
      spinner.fail('Kiwix sync failed');
      if (error instanceof Error) {
        console.error(chalk.red(`Error: ${error.message}`));
      } else {
        console.error(chalk.red('Unknown error occurred'));
      }
      process.exit(1);
    }
  }
}
