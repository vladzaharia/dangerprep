/**
 * File utilities module - Comprehensive file operations for DangerPrep services
 *
 * Features:
 * - Type-safe file path handling with branded types
 * - Basic file system operations (CRUD)
 * - File discovery, search, and metadata extraction
 * - Synchronization and advanced copying operations
 * - Pure utility functions for path and size manipulation
 * - Result pattern integration for error handling
 */

// Core types and interfaces
export type {
  FilePath,
  DirectoryPath,
  FileExtension,
  MimeType,
  SizeString,
  RsyncOptions,
  FileOperationOptions,
  FileMetadata,
  FileSearchOptions,
} from './types.js';

// Type guards and factory functions
export {
  isFilePath,
  isDirectoryPath,
  isFileExtension,
  isMimeType,
  isSizeString,
  createFilePath,
  createDirectoryPath,
  createFileExtension,
  createMimeType,
  createSizeString,
} from './types.js';

// Pure utility functions (no I/O)
export { parseSize, formatSize, getFileExtension, getFileName, sanitizePath } from './utils.js';

// Basic file system operations
export {
  fileExists,
  fileExistsAdvanced,
  ensureDirectory,
  ensureDirectoryAdvanced,
  deleteFile,
  moveFile,
  copyFile,
  removeDirectory,
  getFileStats,
  isDirectory,
  isFile,
  createTempFile,
} from './operations.js';

// File discovery, search, and metadata
export {
  getDirectorySize,
  getDirectorySizeAdvanced,
  getFilesRecursively,
  findFiles,
  getFileMetadata,
  getFileExtensionSafe,
  getMimeTypeSafe,
  createFileMetadata,
} from './discovery.js';

// Synchronization and advanced copying
export { rsyncDirectory, copyFileAdvanced, processFileInChunks } from './sync.js';
