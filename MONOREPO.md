# DangerPrep Monorepo Guide

This repository uses **Turborepo** with **Yarn v4 workspaces** to manage multiple TypeScript packages efficiently.

## 🏗️ Architecture

### Monorepo Structure
```
dangerprep/
├── package.json              # Root package with workspace configuration
├── turbo.json                # Turborepo pipeline configuration
├── tsconfig.base.json        # Shared TypeScript configuration
├── yarn.lock                 # Lockfile for all dependencies
├── .yarnrc.yml               # Yarn v4 configuration
├── cli/                      # CLI application (future)
└── docker/sync/              # Sync services
    ├── kiwix-sync/           # @dangerprep/kiwix-sync
    ├── nfs-sync/             # @dangerprep/nfs-sync
    └── offline-sync/         # @dangerprep/offline-sync
```

### Package Naming Convention
- All packages use the `@dangerprep/` scope
- Package names match their directory names
- All packages are marked as `private: true`

## 🚀 Getting Started

### Prerequisites
- Node.js >= 20.0.0
- Yarn >= 4.0.0

### Installation
```bash
# Install all dependencies for all workspaces
yarn install

# View workspace information
yarn workspace:info
```

## 📦 Working with Workspaces

### Common Commands

#### Build Commands
```bash
# Build all packages
yarn build

# Build only changed packages (since last commit)
yarn build:changed

# Build specific package
yarn workspace @dangerprep/kiwix-sync build
```

#### Development Commands
```bash
# Run dev mode for all packages (parallel)
yarn dev

# Run dev mode for specific package
yarn workspace @dangerprep/offline-sync dev
```

#### Code Quality Commands
```bash
# Lint all packages
yarn lint

# Fix linting issues
yarn lint:fix

# Format all code
yarn format

# Check formatting
yarn format:check

# Type check all packages
yarn typecheck
```

#### Testing Commands
```bash
# Run tests for all packages
yarn test

# Run tests in watch mode
yarn test:watch

# Run tests for specific package
yarn workspace @dangerprep/nfs-sync test
```

#### Maintenance Commands
```bash
# Clean build artifacts
yarn clean

# Clean everything including node_modules
yarn clean:all

# Clear Turborepo cache
yarn cache:clear

# Check dependencies
yarn deps:check

# Update dependencies
yarn deps:update
```

### Adding Dependencies

#### To Root (Shared Development Dependencies)
```bash
# Add shared dev dependency
yarn add -D typescript

# Add shared dependency
yarn add lodash
```

#### To Specific Workspace
```bash
# Add dependency to specific package
yarn workspace @dangerprep/kiwix-sync add axios

# Add dev dependency to specific package
yarn workspace @dangerprep/offline-sync add -D @types/node
```

#### Cross-Workspace Dependencies
```bash
# Reference another workspace package
yarn workspace @dangerprep/cli add @dangerprep/kiwix-sync@workspace:*
```

## 🔧 Development Workflow

### 1. Making Changes
```bash
# Make your changes to any package
# The monorepo will automatically handle dependencies

# Check what will be built
yarn build --dry-run

# Build and test
yarn build
yarn test
```

### 2. Adding New Packages
```bash
# Create new directory
mkdir docker/sync/new-service

# Create package.json
cat > docker/sync/new-service/package.json << EOF
{
  "name": "@dangerprep/new-service",
  "version": "1.0.0",
  "description": "Description of new service",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "ts-node src/index.ts",
    "clean": "rimraf dist",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext .ts,.tsx",
    "lint:fix": "eslint src --ext .ts,.tsx --fix",
    "format": "prettier --write src/**/*.{ts,tsx,json}",
    "format:check": "prettier --check src/**/*.{ts,tsx,json}",
    "test": "jest",
    "test:watch": "jest --watch"
  },
  "dependencies": {},
  "devDependencies": {
    "@types/node": "^20.14.0",
    "typescript": "^5.6.3",
    "ts-node": "^10.9.2",
    "rimraf": "^6.0.1",
    "eslint": "^9.15.0",
    "prettier": "^3.3.3",
    "jest": "^29.7.0",
    "@types/jest": "^29.5.0"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
EOF

# Create tsconfig.json
cat > docker/sync/new-service/tsconfig.json << EOF
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "tsBuildInfoFile": "./dist/.tsbuildinfo"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.spec.ts"]
}
EOF

# Create source directory
mkdir docker/sync/new-service/src

# Install dependencies
yarn install
```

### 3. Turborepo Pipeline

The pipeline automatically handles:
- **Dependency ordering**: Builds dependencies before dependents
- **Caching**: Skips unchanged packages
- **Parallelization**: Runs independent tasks in parallel
- **Incremental builds**: Only rebuilds what changed

## 🎯 Best Practices

### Package Development
1. **Use TypeScript strict mode**: All packages inherit strict configuration
2. **Follow naming conventions**: Use `@dangerprep/package-name` format
3. **Keep packages focused**: Each package should have a single responsibility
4. **Use workspace dependencies**: Reference other packages with `workspace:*`

### Dependency Management
1. **Shared dev dependencies**: Add to root package.json
2. **Package-specific dependencies**: Add to individual package.json
3. **Version consistency**: Use exact versions for shared dependencies
4. **Regular updates**: Use `yarn deps:update` to keep dependencies current

### Code Quality
1. **Run linting**: Use `yarn lint` before committing
2. **Format code**: Use `yarn format` to maintain consistency
3. **Type checking**: Use `yarn typecheck` to catch type errors
4. **Testing**: Write tests and run `yarn test`

### Performance
1. **Use Turborepo cache**: Leverage `--cache` for faster builds
2. **Incremental builds**: Use `--filter` for changed packages only
3. **Parallel execution**: Let Turborepo handle parallelization
4. **Clean builds**: Use `yarn clean` when needed

## 🐛 Troubleshooting

### Common Issues

#### "Workspace not found" Error
```bash
# Check workspace configuration
yarn workspace:info

# Ensure package.json has correct name and is in workspaces array
```

#### Build Failures
```bash
# Check TypeScript errors
yarn typecheck

# Clean and rebuild
yarn clean
yarn build
```

#### Cache Issues
```bash
# Clear Turborepo cache
yarn cache:clear

# Clear all caches
yarn clean:all
yarn install
```

#### Dependency Issues
```bash
# Check for dependency conflicts
yarn deps:check

# Update dependencies
yarn deps:update

# Reinstall everything
rm -rf node_modules yarn.lock
yarn install
```

## 📚 Additional Resources

- [Turborepo Documentation](https://turbo.build/repo/docs)
- [Yarn Workspaces](https://yarnpkg.com/features/workspaces)
- [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)

## 🤝 Contributing

1. Follow the established patterns in existing packages
2. Update this documentation when adding new patterns
3. Test your changes with `yarn build && yarn test`
4. Use conventional commit messages
