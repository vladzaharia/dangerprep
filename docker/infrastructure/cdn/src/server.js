const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Library registry
let libraryRegistry = new Map();

// Scan assets directory and build library registry
async function scanLibraries() {
    const assetsDir = '/usr/share/caddy/assets';

    try {
        const entries = await fs.readdir(assetsDir, { withFileTypes: true });
        const libraries = new Map();

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const libraryPath = path.join(assetsDir, entry.name);
                const configPath = path.join(libraryPath, 'cdn.config.json');

                try {
                    const configData = await fs.readFile(configPath, 'utf8');
                    const config = JSON.parse(configData);

                    // Add computed metadata
                    config.id = entry.name;
                    config.last_scanned = new Date().toISOString();
                    config.base_url = `https://cdn.danger/${entry.name}`;
                    config.local_path = libraryPath;

                    libraries.set(entry.name, config);
                    console.log(`✅ Registered library: ${config.name} (${entry.name}) v${config.version}`);
                } catch (err) {
                    console.warn(`⚠️  Skipping ${entry.name}: ${err.message}`);
                }
            }
        }

        libraryRegistry = libraries;
        console.log(`📚 Scanned ${libraries.size} libraries`);

    } catch (err) {
        console.error('❌ Error scanning libraries:', err.message);
    }
}

// Health check endpoint
app.get('/health', (req, res) => {
    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        libraries: libraryRegistry.size
    };
    
    res.json(health);
});

// API: List all libraries
app.get('/api/libraries', (req, res) => {
    const libraries = Array.from(libraryRegistry.values()).map(lib => ({
        id: lib.id,
        name: lib.name,
        description: lib.description,
        version: lib.version,
        type: lib.type,
        base_url: lib.base_url,
        tags: lib.tags
    }));
    
    res.json({
        libraries,
        total: libraries.length
    });
});

// API: Get specific library details
app.get('/api/library/:id', (req, res) => {
    const library = libraryRegistry.get(req.params.id);

    if (!library) {
        return res.status(404).json({
            error: 'Library not found',
            message: `Library '${req.params.id}' does not exist`
        });
    }

    res.json(library);
});

// Directory listing for library files
app.get('/:library/*?', async (req, res) => {
    const libraryId = req.params.library;
    const subPath = req.params[0] || '';

    const library = libraryRegistry.get(libraryId);
    if (!library) {
        return res.status(404).json({
            error: 'Library not found',
            message: `Library '${libraryId}' does not exist`
        });
    }

    const fullPath = path.join('/usr/share/caddy/assets', libraryId, subPath);

    try {
        const stats = await fs.stat(fullPath);

        // If it's a file, let Caddy handle it (this shouldn't happen as Caddy serves files directly)
        if (stats.isFile()) {
            return res.status(404).json({ error: 'File should be served by Caddy' });
        }

        // If it's a directory, show directory listing
        if (stats.isDirectory()) {
            const entries = await fs.readdir(fullPath, { withFileTypes: true });

            const items = [];

            // Add parent directory link if not at root
            if (subPath) {
                const parentPath = path.dirname(subPath);
                const parentUrl = parentPath === '.' ? `/${libraryId}/` : `/${libraryId}/${parentPath}/`;
                items.push({
                    name: '..',
                    type: 'directory',
                    url: parentUrl,
                    isParent: true
                });
            }

            // Add directory entries
            for (const entry of entries) {
                const itemPath = path.join(subPath, entry.name);
                const itemUrl = `/${libraryId}/${itemPath}${entry.isDirectory() ? '/' : ''}`;

                items.push({
                    name: entry.name,
                    type: entry.isDirectory() ? 'directory' : 'file',
                    url: itemUrl,
                    isParent: false
                });
            }

            // Sort: directories first, then files, alphabetically
            items.sort((a, b) => {
                if (a.isParent) return -1;
                if (b.isParent) return 1;
                if (a.type !== b.type) {
                    return a.type === 'directory' ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
            });

            // Generate HTML directory listing
            const breadcrumbs = generateBreadcrumbs(libraryId, subPath);
            const html = generateDirectoryListingHTML(library, subPath, items, breadcrumbs);

            res.setHeader('Content-Type', 'text/html');
            res.send(html);
        }
    } catch (err) {
        res.status(404).json({
            error: 'Path not found',
            message: `Path '/${libraryId}/${subPath}' does not exist`
        });
    }
});

// Helper function to generate breadcrumbs
function generateBreadcrumbs(libraryId, subPath) {
    const breadcrumbs = [
        { name: 'Home', url: '/' },
        { name: libraryId, url: `/${libraryId}/` }
    ];

    if (subPath) {
        const pathParts = subPath.split('/').filter(part => part);
        let currentPath = '';

        for (const part of pathParts) {
            currentPath += part + '/';
            breadcrumbs.push({
                name: part,
                url: `/${libraryId}/${currentPath}`
            });
        }
    }

    return breadcrumbs;
}

// Helper function to generate directory listing HTML
function generateDirectoryListingHTML(library, subPath, items, breadcrumbs) {
    const currentPath = subPath ? `/${subPath}` : '';
    const title = `${library.name} v${library.version}${currentPath}`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - CDN Browser</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header h1 { color: #2c3e50; margin-bottom: 10px; }
        .header p { color: #7f8c8d; }
        .breadcrumbs { margin: 20px 0; }
        .breadcrumbs a { color: #3498db; text-decoration: none; }
        .breadcrumbs a:hover { text-decoration: underline; }
        .breadcrumbs span { color: #7f8c8d; margin: 0 5px; }
        .listing { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .listing-header { background: #34495e; color: white; padding: 15px 20px; font-weight: 600; }
        .item { display: flex; align-items: center; padding: 12px 20px; border-bottom: 1px solid #ecf0f1; transition: background 0.2s; }
        .item:hover { background: #f8f9fa; }
        .item:last-child { border-bottom: none; }
        .item-icon { width: 20px; margin-right: 12px; font-size: 16px; }
        .item-name { flex: 1; }
        .item-name a { color: #2c3e50; text-decoration: none; }
        .item-name a:hover { color: #3498db; }
        .directory { color: #3498db; }
        .file { color: #27ae60; }
        .parent { color: #95a5a6; }
        .footer { text-align: center; margin-top: 30px; color: #7f8c8d; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${library.name} v${library.version}</h1>
            <p>${library.description}</p>
        </div>

        <div class="breadcrumbs">
            ${breadcrumbs.map((crumb, index) => {
                if (index === breadcrumbs.length - 1) {
                    return crumb.name;
                }
                return `<a href="${crumb.url}">${crumb.name}</a><span>/</span>`;
            }).join('')}
        </div>

        <div class="listing">
            <div class="listing-header">
                Directory Contents
            </div>
            ${items.map(item => `
                <div class="item">
                    <div class="item-icon ${item.type} ${item.isParent ? 'parent' : ''}">
                        ${item.type === 'directory' ? '📁' : '📄'}
                    </div>
                    <div class="item-name">
                        <a href="${item.url}">${item.name}</a>
                    </div>
                </div>
            `).join('')}
        </div>

        <div class="footer">
            <p>CDN Service - Browse and access library files</p>
        </div>
    </div>
</body>
</html>`;
}

// Homepage with dynamic library listing
app.get('/', (req, res) => {
    const libraries = Array.from(libraryRegistry.values());
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DangerPrep CDN</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 2rem; background: #f8f9fa; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 3rem; }
        .header h1 { font-size: 2.5rem; color: #2c3e50; margin-bottom: 0.5rem; }
        .header p { font-size: 1.2rem; color: #7f8c8d; }
        .libraries { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 2rem; }
        .library-card { background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .library-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
        .library-header h3 { color: #2c3e50; flex: 1; margin: 0; }
        .version { background: #e74c3c; color: white; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem; }
        .type { padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem; font-weight: bold; background: #3498db; color: white; }
        .description { color: #7f8c8d; margin-bottom: 1rem; }
        .btn { padding: 0.5rem 1rem; border-radius: 6px; text-decoration: none; font-size: 0.9rem; font-weight: 500; background: #3498db; color: white; }
        .btn:hover { background: #2980b9; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 DangerPrep CDN</h1>
            <p>High-performance self-hosted content delivery network</p>
        </div>
        
        <div class="libraries">
            ${libraries.map(lib => `
                <div class="library-card">
                    <div class="library-header">
                        <h3>${lib.name}</h3>
                        <span class="version">v${lib.version}</span>
                        <span class="type">${lib.type}</span>
                    </div>
                    <p class="description">${lib.description}</p>
                    <div>
                        <a href="/api/library/${lib.id}" class="btn">API</a>
                        <a href="/${lib.id}/" class="btn">Browse</a>
                    </div>
                </div>
            `).join('')}
        </div>
    </div>
</body>
</html>`;
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: 'The requested endpoint does not exist',
        available_endpoints: ['/api/libraries', '/api/library/:id', '/health']
    });
});

// Initialize and start server
async function startServer() {
    console.log('🔍 Scanning asset libraries...');
    await scanLibraries();
    
    // Rescan libraries every hour
    setInterval(scanLibraries, 60 * 60 * 1000);
    
    app.listen(PORT, '127.0.0.1', () => {
        console.log(`🚀 CDN API server running on port ${PORT}`);
        console.log(`📚 Serving ${libraryRegistry.size} libraries`);
    });
}

startServer().catch(console.error);
