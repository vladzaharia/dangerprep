# Media Collection Manager (TypeScript)

A modern TypeScript-based system for managing portable VOD collections with intelligent content discovery, fuzzy matching, and comprehensive analysis capabilities.

## 🚀 Features

- 🔍 **Intelligent Content Discovery**: Advanced fuzzy matching using Fuse.js to find content across NFS storage
- 📊 **Comprehensive Analysis**: Drive usage analysis, content statistics, and optimization recommendations
- 💾 **Smart Caching**: Local metadata caching with TTL for improved performance
- 📈 **Multiple Export Formats**: CSV reports, rsync scripts, and markdown summaries
- 🎯 **Drive Management**: 2TiB drive capacity management with configurable usage thresholds
- 📺 **Partial Season Support**: Optimize space by selecting specific TV show seasons
- 🚀 **High Performance**: Parallel processing and efficient file system operations
- 🔧 **Modern Architecture**: TypeScript, ESM modules, Zod validation, and 2025 best practices
- 📝 **JSONC Configuration**: JSON with comments for easy configuration management

## 📋 Prerequisites

- Node.js 18.0.0 or higher
- Yarn 4.5.3 or higher
- Access to NFS storage mounted at `/nfs` (or custom path)
- Unix-like system with `du` command available

## 🛠️ Installation

1. **Clone or extract the project**
2. **Install dependencies using npm:**
   ```bash
   npm install
   ```
3. **Build the project:**
   ```bash
   npm run build
   ```

## 🎯 Usage

### Basic Analysis

Analyze your complete collection and generate all reports:

```bash
# Using npm (development)
npm run dev -- analyze

# Using built version
npm start analyze

# Using global installation (after npm install -g)
media-collection analyze
```

### Advanced Options

```bash
# Custom NFS path and output directory
media-collection analyze --nfs-path /custom/nfs --output-dir ./reports

# Custom destination for rsync script
media-collection analyze --destination /media/drive

# Custom filenames
media-collection analyze --csv-name my_collection.csv --script-name sync_media.sh --markdown-name summary.md

# Custom configuration file
media-collection analyze --config ./my-config.jsonc
```

### Smart Content Discovery

Find content with intelligent fuzzy matching:

```bash
# Find content (coming soon)
media-collection find "Spider-Man"
media-collection find "Game Changer" --threshold 0.8 --max-results 5
```

### Cache Management

```bash
# Show cache statistics
media-collection cache stats

# Clear metadata cache
media-collection cache clear
```

## ⚙️ Configuration

### Collection Configuration

The collection is defined in `config/collection.jsonc` using JSONC format (JSON with comments):

```jsonc
{
  // NFS Configuration
  "nfs_paths": {
    "base": "/nfs",
    "movies": "/nfs/movies",
    "tv": "/nfs/tv",
    "games": "/nfs/games",
    "webtv": "/nfs/webtv"
  },

  // Drive Configuration
  "drive_config": {
    "size_gb": 2048, // 2TiB in GB
    "recommended_max_usage": 0.85, // 85% recommended maximum
    "safe_usage_threshold": 0.95 // 95% warning threshold
  },

  // Collection definition
  "collection": {
    "movies": [
      {"name": "Spider-Man Into the Spider-Verse (2018)", "type": "Movie"},
      {"name": "Mission Impossible (1996)", "type": "Movie"}
    ],
    "tv_shows": [
      {"name": "Below Deck", "type": "TV", "seasons": [12]},
      {"name": "Game Changer", "type": "TV"} // All seasons
    ],
    "other": [
      {"name": "bestof", "type": "Games", "episodes": 1, "reserved_space_gb": 40},
      {"name": "YouTube Videos", "type": "WebTV", "episodes": 1, "reserved_space_gb": 50}
    ]
  }
}
```

### System Settings

Default settings in configuration:

- **NFS Paths**: `/nfs/movies`, `/nfs/tv`, `/nfs/games`, `/nfs/webtv`
- **Drive Size**: 2048 GB (2TiB)
- **Usage Thresholds**: 85% recommended, 95% warning
- **Output Directory**: `./out/`
- **Fuzzy Matching**: 60% similarity threshold for content discovery
- **Cache TTL**: 24 hours

## 📁 Output Files

The system generates three types of output files in the `./out/` directory:

### 1. CSV Report (`media_collection.csv`)
Detailed spreadsheet with:
- Content name and type
- Discovery status (found/missing/empty)
- File sizes and episode counts
- Match scores and file paths
- Size-to-content ratios and percentages

### 2. Rsync Script (`rsync_collection.sh`)
Executable shell script for copying content:
- Resumable transfers with progress
- Automatic directory creation
- Excludes metadata files (`.nfo`, `.srt`, thumbnails)
- Error handling and status reporting
- Pre-flight space checks

### 3. Markdown Summary (`collection_summary.md`)
Human-readable report with:
- Collection overview and statistics
- Drive usage analysis and recommendations
- Content breakdown by type
- Largest items and space optimization suggestions
- Missing content lists

## 🏗️ Architecture

### Core Components

- **ConfigLoader**: JSONC configuration parsing with Zod validation
- **FileSystemManager**: Efficient file system operations using fast-glob
- **ContentMatcher**: Advanced fuzzy matching using Fuse.js
- **MetadataCache**: Smart caching with TTL and invalidation
- **CollectionAnalyzer**: Main orchestration for analysis and reporting
- **Export System**: Multi-format output generation (CSV, rsync, markdown)

### Key Technologies

- **TypeScript**: Type-safe development with strict configuration
- **ESM Modules**: Modern module system with proper imports
- **Zod**: Runtime type validation for configuration
- **Fuse.js**: Advanced fuzzy string matching
- **fast-glob**: High-performance file system globbing
- **Commander.js**: Modern CLI framework
- **Chalk & Ora**: Beautiful terminal output with spinners

## 🔧 Development

### Project Structure

```
media-collection/
├── src/
│   ├── cli/
│   │   └── commands.ts          # CLI command implementations
│   ├── config/
│   │   ├── loader.ts            # Configuration loader
│   │   └── schema.ts            # Zod validation schemas
│   ├── core/
│   │   ├── analyzer.ts          # Main analysis engine
│   │   ├── cache.ts             # Metadata caching
│   │   ├── filesystem.ts        # File system operations
│   │   └── matcher.ts           # Fuzzy matching
│   ├── exports/
│   │   ├── csv.ts               # CSV export
│   │   ├── markdown.ts          # Markdown export
│   │   └── rsync.ts             # Rsync script export
│   ├── types/
│   │   └── index.ts             # TypeScript type definitions
│   ├── cli.ts                   # CLI entry point
│   └── index.ts                 # Library exports
├── config/
│   └── collection.jsonc         # Collection configuration
├── dist/                        # Compiled JavaScript
├── out/                         # Generated output files
├── package.json                 # Package configuration
├── tsconfig.json                # TypeScript configuration
└── README-TS.md                 # This documentation
```

### Available Scripts

```bash
# Development
npm run dev                      # Run CLI in development mode
npm run build                    # Build TypeScript to JavaScript
npm run clean                    # Clean build directory

# Code Quality
npm run lint                     # Run ESLint
npm run lint:fix                 # Fix ESLint issues
npm run format                   # Format code with Prettier
npm run format:check             # Check code formatting

# Production
npm start                        # Run built CLI
```

## 🚀 Migration from Python

This TypeScript version provides the same functionality as the Python version with these improvements:

- **Better Performance**: Parallel operations and efficient caching
- **Type Safety**: Full TypeScript coverage with strict configuration
- **Modern Architecture**: ESM modules, async/await, and 2025 best practices
- **Enhanced Matching**: Improved fuzzy matching with Fuse.js
- **Better Configuration**: JSONC support with validation
- **Improved CLI**: Modern command-line interface with better UX

## 🤝 Contributing

1. Follow TypeScript and ESLint configurations
2. Use conventional commit messages
3. Ensure all types are properly defined
4. Add JSDoc comments for public APIs

## 📄 License

MIT License - see LICENSE file for details.
