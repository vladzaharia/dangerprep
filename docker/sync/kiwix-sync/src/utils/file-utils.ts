import { promises as fs } from 'fs';
import path from 'path';

export class FileUtils {
  static async getDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;

    try {
      const items = await fs.readdir(dirPath);
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stats = await fs.stat(itemPath);
        
        if (stats.isDirectory()) {
          totalSize += await this.getDirectorySize(itemPath);
        } else {
          totalSize += stats.size;
        }
      }
    } catch (error) {
      // Directory might not exist or be accessible
      return 0;
    }

    return totalSize;
  }

  static parseSize(sizeStr: string): number {
    const units: { [key: string]: number } = {
      'B': 1,
      'KB': 1024,
      'MB': 1024 * 1024,
      'GB': 1024 * 1024 * 1024,
      'TB': 1024 * 1024 * 1024 * 1024
    };

    const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*([KMGT]?B)$/i);
    if (!match) {
      throw new Error(`Invalid size format: ${sizeStr}`);
    }

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    
    return value * (units[unit] || 1);
  }

  static formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  static async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create directory ${dirPath}: ${error}`);
    }
  }

  static async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  static async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      throw new Error(`Failed to delete file ${filePath}: ${error}`);
    }
  }

  static async moveFile(sourcePath: string, destPath: string): Promise<void> {
    try {
      await fs.rename(sourcePath, destPath);
    } catch (error) {
      throw new Error(`Failed to move file from ${sourcePath} to ${destPath}: ${error}`);
    }
  }

  static async copyFile(sourcePath: string, destPath: string): Promise<void> {
    try {
      await fs.copyFile(sourcePath, destPath);
    } catch (error) {
      throw new Error(`Failed to copy file from ${sourcePath} to ${destPath}: ${error}`);
    }
  }

  static getFileExtension(filePath: string): string {
    return path.extname(filePath).toLowerCase();
  }

  static getFileName(filePath: string): string {
    return path.basename(filePath, path.extname(filePath));
  }
}
