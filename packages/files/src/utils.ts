import path from 'path';

import { parseSize as commonParseSize, formatSize as commonFormatSize } from '@dangerprep/common';

/**
 * Pure utility functions for file operations (no I/O)
 *
 * These are stateless functions that perform:
 * - Size parsing and formatting (using common utilities)
 * - Path manipulation and sanitization
 * - File name extraction
 */

/**
 * Parse size string (e.g., "1.5GB", "500MB") to bytes
 * Uses common size parsing utility
 */
export function parseSize(sizeStr: string): number {
  return commonParseSize(sizeStr);
}

/**
 * Format bytes to human-readable string (e.g., "1.50 GB")
 * Uses common size formatting utility
 */
export function formatSize(bytes: number): string {
  return commonFormatSize(bytes);
}

/**
 * Get file extension in lowercase
 */
export function getFileExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase();
}

/**
 * Get filename without extension
 */
export function getFileName(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

/**
 * Sanitize path to prevent path traversal attacks
 */
export function sanitizePath(inputPath: string): string {
  // Remove any path traversal attempts
  const sanitized = path.normalize(inputPath).replace(/^(\.\.[/\\])+/, '');

  // Ensure the path doesn't start with / or \ to prevent absolute path access
  return sanitized.replace(/^[/\\]+/, '');
}
