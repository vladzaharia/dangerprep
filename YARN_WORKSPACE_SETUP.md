# Yarn Workspace Configuration

This document outlines the Yarn workspace configuration for the DangerPrep monorepo.

## Overview

The project is configured to use **Yarn v4.5.3** exclusively with Yarn workspaces for package management across all services and packages.

## Configuration Files

### Root Configuration
- **package.json**: Defines workspaces and specifies `packageManager: "yarn@4.5.3"`
- **.yarnrc.yml**: Yarn v4 configuration with `nodeLinker: node-modules`
- **turbo.json**: Turborepo configuration for build orchestration

### Workspace Structure
```
workspaces:
  - "packages/*"              # Shared libraries and utilities
  - "packages/_development/*" # Development tools and configs
  - "docker/sync/*"          # Sync services (kiwix, nfs, offline)
  - "docker/infrastructure/*" # Infrastructure services (cdn, step-ca)
```

## Updated Services

The following services have been updated to use Yarn exclusively:

### Infrastructure Services
- **@dangerprep/cdn**: CDN service with WebAwesome templates
- **@dangerprep/step-ca**: Certificate Authority download service

### Sync Services
- **@dangerprep/kiwix-sync**: Kiwix content management
- **@dangerprep/nfs-sync**: NFS synchronization service
- **@dangerprep/offline-sync**: Offline MicroSD card sync

## Changes Made

### 1. Package.json Updates
All service package.json files now include:
```json
{
  "engines": {
    "node": ">=22.0.0",
    "yarn": ">=4.0.0"
  },
  "packageManager": "yarn@4.5.3"
}
```

### 2. Script Updates
Changed all development scripts from `npx tsx` to `yarn tsx`:
```json
{
  "scripts": {
    "dev": "yarn tsx src/server.ts"  // Previously: "npx tsx src/server.ts"
  }
}
```

### 3. ES Module Fixes
Fixed `__dirname` usage in ES modules by adding:
```typescript
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
```

## Usage

### Install Dependencies
```bash
yarn install
```

### Build All Packages
```bash
yarn build
```

### Run Development Server
```bash
yarn workspace @dangerprep/cdn dev
yarn workspace @dangerprep/step-ca dev
```

### Workspace Commands
```bash
# List all workspaces
yarn workspaces list --verbose

# Add dependency to specific workspace
yarn workspace @dangerprep/cdn add express

# Run script in specific workspace
yarn workspace @dangerprep/cdn build
```

## Benefits

1. **Consistent Package Management**: All services use the same Yarn version
2. **Dependency Deduplication**: Shared dependencies are hoisted to root
3. **Workspace Protocol**: Internal dependencies use `workspace:*` protocol
4. **Build Optimization**: Turborepo can efficiently cache and parallelize builds
5. **Version Synchronization**: Syncpack ensures consistent dependency versions

## Verification

The configuration has been tested and verified:
- ✅ All services build successfully with `yarn build`
- ✅ Development scripts work with `yarn tsx`
- ✅ Workspace dependencies resolve correctly
- ✅ Turborepo caching functions properly
- ✅ ES module compatibility maintained

## Next Steps

1. Remove any remaining npm-related files if found
2. Update CI/CD pipelines to use `yarn` instead of `npm`
3. Update documentation to reference Yarn commands
4. Consider adding `.nvmrc` for Node.js version consistency
