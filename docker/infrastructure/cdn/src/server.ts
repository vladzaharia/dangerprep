import { promises as fs } from 'fs';
import path from 'path';

import express, { type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import NodeCache from 'node-cache';

// Import local template utilities
import { TemplateRenderer, createTemplateData, type TemplateData } from './utils/template-renderer.js';
import { AppDiscoveryService, type AppMetadata } from './utils/app-discovery.js';

// Simple logger to replace console statements
const logger = {
  info: (message: string, ...args: unknown[]) => {
    // eslint-disable-next-line no-console
    console.log(`[INFO] ${message}`, ...args);
  },
  warn: (message: string, ...args: unknown[]) => {
    // eslint-disable-next-line no-console
    console.warn(`[WARN] ${message}`, ...args);
  },
  error: (message: string, ...args: unknown[]) => {
    // eslint-disable-next-line no-console
    console.error(`[ERROR] ${message}`, ...args);
  },
};

// TypeScript interfaces
interface LibraryEndpoint {
  path: string;
  description: string;
  type: string;
  size?: string;
}

interface LibraryUsage {
  html_example?: string;
  import_example?: string;
  css_example?: string;
}

interface LibraryConfig {
  id?: string;
  name: string;
  description: string;
  version: string;
  type: string;
  homepage?: string;
  license?: string;
  endpoints?: LibraryEndpoint[];
  usage?: LibraryUsage;
  icon_families?: Record<string, string>;
  tags?: string[];
  last_scanned?: string;
  base_url?: string;
  total_size?: string;
  file_count?: number;
}

interface DirectoryStats {
  size: number;
  files: number;
}

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Initialize cache (TTL: 1 hour)
const cache = new NodeCache({ stdTTL: 3600 });

// Initialize template renderer and app discovery
const templateRenderer = new TemplateRenderer();
const appDiscovery = new AppDiscoveryService();

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: false, // Disable CSP for CDN
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Compression middleware (handled by Nginx)
// app.use(compression());

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: { error: 'Too many requests', retry_after: '15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);

// Library registry
let libraryRegistry = new Map<string, LibraryConfig>();

// Scan assets directory and build library registry
async function scanLibraries(): Promise<void> {
  const assetsDir = '/usr/share/nginx/html/assets';

  try {
    const entries = await fs.readdir(assetsDir, { withFileTypes: true });
    const libraries = new Map<string, LibraryConfig>();

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const libraryPath = path.join(assetsDir, entry.name);
        const configPath = path.join(libraryPath, 'cdn.config.json');

        try {
          const configData = await fs.readFile(configPath, 'utf8');
          const config: LibraryConfig = JSON.parse(configData);

          // Add computed metadata
          config.id = entry.name;
          config.last_scanned = new Date().toISOString();
          config.base_url = `https://cdn.danger/${entry.name}`;

          // Calculate total size (approximate)
          try {
            const stats = await getDirectorySize(libraryPath);
            config.total_size = formatBytes(stats.size);
            config.file_count = stats.files;
          } catch (err) {
            logger.warn(
              `Could not calculate size for ${entry.name}:`,
              err instanceof Error ? err.message : String(err)
            );
          }

          libraries.set(entry.name, config);
          logger.info(`✅ Registered library: ${config.name} (${entry.name})`);
        } catch (err) {
          logger.warn(
            `⚠️  Skipping ${entry.name}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    libraryRegistry = libraries;
    cache.set('library_registry', libraries);
    logger.info(`📚 Scanned ${libraries.size} libraries`);
  } catch (err) {
    logger.error('❌ Error scanning libraries:', err instanceof Error ? err.message : String(err));
  }
}

// Calculate directory size recursively
async function getDirectorySize(dirPath: string): Promise<DirectoryStats> {
  let totalSize = 0;
  let fileCount = 0;

  async function scanDir(currentPath: string): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        await scanDir(fullPath);
      } else {
        const stats = await fs.stat(fullPath);
        totalSize += stats.size;
        fileCount++;
      }
    }
  }

  await scanDir(dirPath);
  return { size: totalSize, files: fileCount };
}

// Format bytes to human readable
function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    libraries: libraryRegistry.size,
    cache_keys: cache.keys().length,
  };

  res.json(health);
});

// API: App discovery endpoint
app.get('/api/apps', async (_req: Request, res: Response) => {
  try {
    const apps = await appDiscovery.getApps();
    res.json(apps);
  } catch (error) {
    logger.error('Failed to get apps:', error);
    res.status(500).json({ error: 'Failed to retrieve apps' });
  }
});

// API: List all libraries
app.get('/api/libraries', (req: Request, res: Response) => {
  const libraries = Array.from(libraryRegistry.values()).map(lib => ({
    id: lib.id,
    name: lib.name,
    description: lib.description,
    version: lib.version,
    type: lib.type,
    base_url: lib.base_url,
    total_size: lib.total_size,
    file_count: lib.file_count,
    tags: lib.tags,
  }));

  res.json({
    libraries,
    total: libraries.length,
    last_updated: cache.getTtl('library_registry'),
  });
});

// API: Get specific library details
app.get('/api/library/:id', (req: Request, res: Response): void => {
  const libraryId = req.params.id;
  if (!libraryId) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Library ID is required',
    });
    return;
  }

  const library = libraryRegistry.get(libraryId);

  if (!library) {
    res.status(404).json({
      error: 'Library not found',
      message: `Library '${libraryId}' does not exist`,
    });
    return;
  }

  res.json(library);
});

// API: Library endpoints for a specific library
app.get('/api/library/:id/endpoints', (req: Request, res: Response): void => {
  const libraryId = req.params.id;
  if (!libraryId) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Library ID is required',
    });
    return;
  }

  const library = libraryRegistry.get(libraryId);

  if (!library) {
    res.status(404).json({
      error: 'Library not found',
      message: `Library '${libraryId}' does not exist`,
    });
    return;
  }

  res.json({
    library: library.name,
    base_url: library.base_url,
    endpoints: library.endpoints || [],
  });
});

// Helper function to calculate total size
function calculateTotalSize(libraries: LibraryConfig[]): string {
  const totalBytes = libraries.reduce((sum, lib) => {
    // Parse size string back to bytes (rough approximation)
    const sizeStr = lib.total_size || '0 Bytes';
    const parts = sizeStr.split(' ');
    const value = parts[0] || '0';
    const unit = parts[1] || 'Bytes';
    const numValue = parseFloat(value);

    if (isNaN(numValue)) return sum;

    switch (unit) {
      case 'GB': return sum + (numValue * 1024 * 1024 * 1024);
      case 'MB': return sum + (numValue * 1024 * 1024);
      case 'KB': return sum + (numValue * 1024);
      default: return sum + numValue;
    }
  }, 0);

  return formatBytes(totalBytes);
}

// Homepage with dynamic library listing
app.get('/', async (_req: Request, res: Response) => {
  try {
    const libraries = Array.from(libraryRegistry.values());

    // Prepare CDN app template data
    const cdnAppData = {
      libraries,
      libraryCount: libraries.length,
      totalFiles: libraries.reduce((sum, lib) => sum + (lib.file_count || 0), 0),
      totalSize: calculateTotalSize(libraries)
    };

    const cdnAppContent = await templateRenderer.render('cdn-app', cdnAppData);

    // Prepare base template data
    const templateData = createTemplateData(
      'CDN Manager',
      cdnAppContent,
      {
        appTitle: 'CDN Manager',
        headerActions: `
          <wa-button appearance="outlined" variant="neutral" size="small" href="/api/libraries">
            <wa-icon slot="start" name="code" variant="regular"></wa-icon>
            API
          </wa-button>
          <wa-button appearance="outlined" variant="neutral" size="small" href="/health">
            <wa-icon slot="start" name="heart-pulse" variant="regular"></wa-icon>
            Status
          </wa-button>
        `
      }
    );

    const html = await templateRenderer.render('base', { ...templateData });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    logger.error('Failed to render homepage:', error);
    res.status(500).send('Internal Server Error');
  }
});




// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
  });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist',
    available_endpoints: ['/api/libraries', '/api/library/:id', '/health'],
  });
});

// Initialize and start server
async function startServer(): Promise<void> {
  logger.info('🔍 Scanning asset libraries...');
  await scanLibraries();

  // Rescan libraries every hour
  setInterval(scanLibraries, 60 * 60 * 1000);

  app.listen(PORT, '127.0.0.1', () => {
    logger.info(`🚀 CDN API server running on port ${PORT}`);
    logger.info(`📚 Serving ${libraryRegistry.size} libraries`);
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

startServer().catch(err => logger.error('Failed to start server:', err));
