import { promises as fs } from 'fs';
import path from 'path';

import express, { type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import NodeCache from 'node-cache';

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

// Homepage with dynamic library listing
app.get('/', (_req: Request, res: Response) => {
  const libraries = Array.from(libraryRegistry.values());

  const html = generateHomepage(libraries);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// Generate dynamic homepage
function generateHomepage(libraries: LibraryConfig[]): string {
  const libraryCards = libraries
    .map(
      lib => `
        <div class="library-card">
            <div class="library-header">
                <h3>${lib.name}</h3>
                <span class="version">v${lib.version}</span>
                <span class="type ${lib.type}">${lib.type}</span>
            </div>
            <p class="description">${lib.description}</p>
            <div class="library-stats">
                <span class="stat">📦 ${lib.total_size || 'Unknown'}</span>
                <span class="stat">📄 ${lib.file_count || 0} files</span>
            </div>
            <div class="library-actions">
                <a href="/api/library/${lib.id}" class="btn btn-api">API</a>
                <a href="${lib.base_url}/" class="btn btn-browse">Browse</a>
            </div>
            ${
              lib.endpoints && lib.endpoints.length > 0
                ? `
                <div class="endpoints">
                    <h4>Key Endpoints:</h4>
                    ${lib.endpoints
                      .slice(0, 3)
                      .map(
                        endpoint => `
                        <div class="endpoint">
                            <code>${endpoint.path}</code>
                            <span class="endpoint-type">${endpoint.type}</span>
                        </div>
                    `
                      )
                      .join('')}
                </div>
            `
                : ''
            }
        </div>
    `
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DangerPrep CDN</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            background: #f8f9fa;
        }
        .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
        .header { text-align: center; margin-bottom: 3rem; }
        .header h1 { font-size: 2.5rem; color: #2c3e50; margin-bottom: 0.5rem; }
        .header p { font-size: 1.2rem; color: #7f8c8d; }
        .stats { 
            display: flex; 
            justify-content: center; 
            gap: 2rem; 
            margin: 2rem 0; 
            flex-wrap: wrap;
        }
        .stat-card { 
            background: white; 
            padding: 1rem 2rem; 
            border-radius: 8px; 
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            text-align: center;
        }
        .stat-number { font-size: 2rem; font-weight: bold; color: #3498db; }
        .stat-label { color: #7f8c8d; font-size: 0.9rem; }
        .libraries { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); 
            gap: 2rem; 
        }
        .library-card { 
            background: white; 
            border-radius: 12px; 
            padding: 1.5rem; 
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .library-card:hover { 
            transform: translateY(-2px); 
            box-shadow: 0 8px 15px rgba(0,0,0,0.15);
        }
        .library-header { 
            display: flex; 
            align-items: center; 
            gap: 1rem; 
            margin-bottom: 1rem; 
            flex-wrap: wrap;
        }
        .library-header h3 { color: #2c3e50; flex: 1; }
        .version { 
            background: #e74c3c; 
            color: white; 
            padding: 0.2rem 0.5rem; 
            border-radius: 4px; 
            font-size: 0.8rem; 
        }
        .type { 
            padding: 0.2rem 0.5rem; 
            border-radius: 4px; 
            font-size: 0.8rem; 
            font-weight: bold;
        }
        .type.component-library { background: #3498db; color: white; }
        .type.icon-library { background: #9b59b6; color: white; }
        .description { color: #7f8c8d; margin-bottom: 1rem; }
        .library-stats { 
            display: flex; 
            gap: 1rem; 
            margin-bottom: 1rem; 
            font-size: 0.9rem; 
        }
        .library-actions { 
            display: flex; 
            gap: 0.5rem; 
            margin-bottom: 1rem; 
        }
        .btn { 
            padding: 0.5rem 1rem; 
            border-radius: 6px; 
            text-decoration: none; 
            font-size: 0.9rem; 
            font-weight: 500;
            transition: background-color 0.2s;
        }
        .btn-api { background: #3498db; color: white; }
        .btn-api:hover { background: #2980b9; }
        .btn-browse { background: #95a5a6; color: white; }
        .btn-browse:hover { background: #7f8c8d; }
        .endpoints { 
            border-top: 1px solid #ecf0f1; 
            padding-top: 1rem; 
        }
        .endpoints h4 { 
            color: #2c3e50; 
            margin-bottom: 0.5rem; 
            font-size: 0.9rem; 
        }
        .endpoint { 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            margin-bottom: 0.5rem; 
        }
        .endpoint code { 
            background: #f8f9fa; 
            padding: 0.2rem 0.4rem; 
            border-radius: 3px; 
            font-size: 0.8rem; 
            flex: 1;
        }
        .endpoint-type { 
            background: #27ae60; 
            color: white; 
            padding: 0.1rem 0.3rem; 
            border-radius: 3px; 
            font-size: 0.7rem; 
            margin-left: 0.5rem;
        }
        .footer { 
            text-align: center; 
            margin-top: 3rem; 
            padding-top: 2rem; 
            border-top: 1px solid #ecf0f1; 
            color: #7f8c8d; 
        }
        @media (max-width: 768px) {
            .libraries { grid-template-columns: 1fr; }
            .stats { flex-direction: column; align-items: center; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 DangerPrep CDN</h1>
            <p>High-performance self-hosted content delivery network</p>
        </div>
        
        <div class="stats">
            <div class="stat-card">
                <div class="stat-number">${libraries.length}</div>
                <div class="stat-label">Libraries</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${libraries.reduce((sum, lib) => sum + (lib.file_count || 0), 0)}</div>
                <div class="stat-label">Total Files</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">99.9%</div>
                <div class="stat-label">Uptime</div>
            </div>
        </div>
        
        <div class="libraries">
            ${libraryCards}
        </div>
        
        <div class="footer">
            <p>
                <strong>DangerPrep CDN</strong> • 
                <a href="/api/libraries">API Documentation</a> • 
                <a href="/health">Health Status</a>
            </p>
            <p style="margin-top: 0.5rem; font-size: 0.9rem;">
                Optimized for emergency response scenarios • Offline-ready • Self-hosted
            </p>
        </div>
    </div>
</body>
</html>`;
}

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
