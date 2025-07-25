import type { Logger } from '@dangerprep/logging';

// Branded types for type safety
export type FilePath = string & { readonly __brand: 'FilePath' };
export type DirectoryPath = string & { readonly __brand: 'DirectoryPath' };
export type FileExtension = string & { readonly __brand: 'FileExtension' };
export type MimeType = string & { readonly __brand: 'MimeType' };
export type SizeString = string & { readonly __brand: 'SizeString' };

// Type guards for branded types
export function isFilePath(value: string): value is FilePath {
  return typeof value === 'string' && value.length > 0 && !value.endsWith('/');
}

export function isDirectoryPath(value: string): value is DirectoryPath {
  return typeof value === 'string' && value.length > 0;
}

export function isFileExtension(value: string): value is FileExtension {
  return typeof value === 'string' && value.startsWith('.') && value.length > 1;
}

export function isMimeType(value: string): value is MimeType {
  return typeof value === 'string' && /^[a-z]+\/[a-z0-9\-+.]+$/i.test(value);
}

export function isSizeString(value: string): value is SizeString {
  return typeof value === 'string' && /^\d+(?:\.\d+)?\s*[KMGT]?B$/i.test(value);
}

// Factory functions for branded types
export function createFilePath(path: string): FilePath {
  if (!isFilePath(path)) {
    throw new Error(`Invalid file path: ${path}`);
  }
  return path;
}

export function createDirectoryPath(path: string): DirectoryPath {
  if (!isDirectoryPath(path)) {
    throw new Error(`Invalid directory path: ${path}`);
  }
  return path;
}

export function createFileExtension(ext: string): FileExtension {
  if (!isFileExtension(ext)) {
    throw new Error(`Invalid file extension: ${ext}`);
  }
  return ext;
}

export function createMimeType(mime: string): MimeType {
  if (!isMimeType(mime)) {
    throw new Error(`Invalid MIME type: ${mime}`);
  }
  return mime;
}

export function createSizeString(size: string): SizeString {
  if (!isSizeString(size)) {
    throw new Error(`Invalid size string: ${size}`);
  }
  return size;
}

/**
 * Options for rsync operations
 */
export interface RsyncOptions {
  /** Patterns to exclude from sync */
  exclude?: string[];
  /** Bandwidth limit (e.g., '1M', '500K', 'unlimited') */
  bandwidthLimit?: string;
  /** Perform dry run without actual file transfers */
  dryRun?: boolean;
  /** Logger instance for progress and error reporting */
  logger?: Logger;
}

/**
 * Advanced file operation options
 */
export interface FileOperationOptions {
  /** Timeout in milliseconds */
  timeout?: number;
  /** Progress callback for large operations */
  onProgress?: (progress: { completed: number; total: number }) => void;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Logger instance */
  logger?: Logger;
}

/**
 * File metadata interface
 */
export interface FileMetadata {
  readonly path: FilePath;
  readonly size: number;
  readonly mtime: Date;
  readonly ctime: Date;
  readonly isDirectory: boolean;
  readonly isFile: boolean;
  readonly extension: FileExtension | null;
  readonly mimeType: MimeType | null;
  readonly permissions: string;
}

/**
 * File search options
 */
export interface FileSearchOptions {
  /** File extensions to include */
  extensions?: readonly FileExtension[];
  /** Maximum depth for recursive search */
  maxDepth?: number;
  /** Minimum file size in bytes */
  minSize?: number;
  /** Maximum file size in bytes */
  maxSize?: number;
  /** Modified after date */
  modifiedAfter?: Date;
  /** Modified before date */
  modifiedBefore?: Date;
  /** Include hidden files */
  includeHidden?: boolean;
  /** Custom filter function */
  filter?: (metadata: FileMetadata) => boolean;
}
