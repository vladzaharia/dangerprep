// Main exports for the Media Collection Manager library

// Configuration
export { loadConfig, getConfig, ConfigLoader } from './config/loader.js';
export * from './config/schema.js';

// Core functionality
export { FileSystemManager } from './core/filesystem.js';
export { ContentMatcher } from './core/matcher.js';
export { MetadataCache } from './core/cache.js';
export { CollectionAnalyzer } from './core/analyzer.js';
export { KiwixDownloader } from './core/kiwix-downloader.js';
export { KiwixAnalyzer } from './core/kiwix-analyzer.js';

// Export functionality
export { CSVExporter } from './exports/csv.js';
export { RsyncScriptExporter } from './exports/rsync.js';
export { MarkdownExporter } from './exports/markdown.js';

// CLI
export { CLICommands } from './cli/commands.js';

// Types are exported from config/schema.js
