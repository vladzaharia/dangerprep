import path from 'path';

/**
 * Pure utility functions for file operations (no I/O)
 *
 * These are stateless functions that perform:
 * - Size parsing and formatting
 * - Path manipulation and sanitization
 * - File name extraction
 */

/**
 * Parse size string (e.g., "1.5GB", "500MB") to bytes
 */
export function parseSize(sizeStr: string): number {
  const units: { [key: string]: number } = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
    TB: 1024 * 1024 * 1024 * 1024,
  };

  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*([KMGT]?B)$/i);
  if (!match?.[1] || !match[2]) {
    throw new Error(`Invalid size format: ${sizeStr}`);
  }

  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();

  return value * (units[unit] || 1);
}

/**
 * Format bytes to human-readable string (e.g., "1.50 GB")
 */
export function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
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
