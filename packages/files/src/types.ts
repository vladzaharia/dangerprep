import {
  type FilePath,
  type DirectoryPath,
  type FileExtension,
  type MimeType,
  type SizeString,
  FilePath as FilePathFactory,
  DirectoryPath as DirectoryPathFactory,
  FileExtension as FileExtensionFactory,
  MimeType as MimeTypeFactory,
  SizeString as SizeStringFactory,
} from '@dangerprep/common';
import type { Logger } from '@dangerprep/logging';

// Re-export branded types for backward compatibility
export type { FilePath, DirectoryPath, FileExtension, MimeType, SizeString };

// Re-export type guards and factory functions
export const isFilePath = FilePathFactory.guard;
export const isDirectoryPath = DirectoryPathFactory.guard;
export const isFileExtension = FileExtensionFactory.guard;
export const isMimeType = MimeTypeFactory.guard;
export const isSizeString = SizeStringFactory.guard;

export const createFilePath = FilePathFactory.create;
export const createDirectoryPath = DirectoryPathFactory.create;
export const createFileExtension = FileExtensionFactory.create;
export const createMimeType = MimeTypeFactory.create;
export const createSizeString = SizeStringFactory.create;

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
