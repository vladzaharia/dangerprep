import * as fs from 'fs-extra';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { DetectedDevice, CardAnalysis, OfflineSyncConfig, ContentTypeConfig } from './types';

const execAsync = promisify(exec);

export class CardAnalyzer {
  private config: OfflineSyncConfig['offline_sync'];

  constructor(config: OfflineSyncConfig['offline_sync']) {
    this.config = config;
  }

  /**
   * Analyze a mounted MicroSD card
   */
  public async analyzeCard(device: DetectedDevice): Promise<CardAnalysis> {
    if (!device.isMounted || !device.mountPath) {
      throw new Error('Device must be mounted before analysis');
    }

    const analysis: CardAnalysis = {
      device,
      totalSize: 0,
      freeSize: 0,
      usedSize: 0,
      detectedContentTypes: [],
      missingContentTypes: [],
      fileSystemSupported: true,
      readOnly: false,
      errors: []
    };

    try {
      // Get disk space information
      await this.analyzeDiskSpace(device.mountPath, analysis);

      // Check filesystem support and permissions
      await this.checkFileSystemSupport(device.mountPath, analysis);

      // Analyze existing directory structure
      await this.analyzeDirectoryStructure(device.mountPath, analysis);

      // Determine missing content types
      this.determineMissingContentTypes(analysis);

      this.log(`Card analysis complete for ${device.devicePath}: ${analysis.detectedContentTypes.length} content types found`);
      
    } catch (error) {
      analysis.errors.push(`Analysis failed: ${error}`);
      this.logError(`Failed to analyze card ${device.devicePath}`, error);
    }

    return analysis;
  }

  /**
   * Create missing directory structure on the card
   */
  public async createMissingDirectories(analysis: CardAnalysis): Promise<boolean> {
    if (!analysis.device.mountPath) {
      throw new Error('Device must be mounted');
    }

    if (analysis.readOnly) {
      throw new Error('Cannot create directories on read-only filesystem');
    }

    try {
      let createdCount = 0;

      for (const contentType of analysis.missingContentTypes) {
        const contentConfig = this.config.content_types[contentType];
        if (!contentConfig) continue;

        const cardPath = path.join(analysis.device.mountPath, contentConfig.card_path);
        
        if (!await fs.pathExists(cardPath)) {
          await fs.ensureDir(cardPath);
          await this.createReadmeFile(cardPath, contentType, contentConfig);
          createdCount++;
          this.log(`Created directory: ${cardPath}`);
        }
      }

      // Update analysis to reflect new structure
      if (createdCount > 0) {
        const updatedAnalysis = await this.analyzeCard(analysis.device);
        analysis.detectedContentTypes = updatedAnalysis.detectedContentTypes;
        analysis.missingContentTypes = updatedAnalysis.missingContentTypes;
      }

      this.log(`Created ${createdCount} missing directories`);
      return true;

    } catch (error) {
      this.logError('Failed to create missing directories', error);
      return false;
    }
  }

  /**
   * Analyze disk space usage
   */
  private async analyzeDiskSpace(mountPath: string, analysis: CardAnalysis): Promise<void> {
    try {
      const { stdout } = await execAsync(`df -B1 "${mountPath}"`);
      const lines = stdout.trim().split('\n');
      
      if (lines.length >= 2) {
        const fields = lines[1]?.split(/\s+/);
        if (fields && fields.length >= 4) {
          analysis.totalSize = parseInt(fields[1] ?? '0') || 0;
          analysis.usedSize = parseInt(fields[2] ?? '0') || 0;
          analysis.freeSize = parseInt(fields[3] ?? '0') || 0;
        }
      }
    } catch (error) {
      analysis.errors.push(`Failed to get disk space: ${error}`);
    }
  }

  /**
   * Check filesystem support and permissions
   */
  private async checkFileSystemSupport(mountPath: string, analysis: CardAnalysis): Promise<void> {
    try {
      // Check if we can write to the filesystem
      const testFile = path.join(mountPath, '.write_test');
      
      try {
        await fs.writeFile(testFile, 'test');
        await fs.unlink(testFile);
        analysis.readOnly = false;
      } catch (writeError) {
        analysis.readOnly = true;
        analysis.errors.push('Filesystem is read-only');
      }

      // Check filesystem type support
      const supportedFileSystems = ['ext4', 'ext3', 'ext2', 'ntfs', 'fat32', 'exfat', 'vfat'];
      if (analysis.device.fileSystem && 
          !supportedFileSystems.includes(analysis.device.fileSystem.toLowerCase())) {
        analysis.fileSystemSupported = false;
        analysis.errors.push(`Unsupported filesystem: ${analysis.device.fileSystem}`);
      }

    } catch (error) {
      analysis.errors.push(`Filesystem check failed: ${error}`);
    }
  }

  /**
   * Analyze existing directory structure
   */
  private async analyzeDirectoryStructure(mountPath: string, analysis: CardAnalysis): Promise<void> {
    try {
      const entries = await fs.readdir(mountPath);
      
      for (const [contentType, contentConfig] of Object.entries(this.config.content_types)) {
        const cardPath = path.join(mountPath, contentConfig.card_path);
        
        // Check if the content directory exists
        if (await fs.pathExists(cardPath)) {
          const stats = await fs.stat(cardPath);
          
          if (stats.isDirectory()) {
            // Check if directory has content or is just empty
            const hasContent = await this.hasValidContent(cardPath, contentConfig);
            
            if (hasContent) {
              analysis.detectedContentTypes.push(contentType);
              this.log(`Found content type: ${contentType} at ${contentConfig.card_path}`);
            }
          }
        }
      }

      // Also check for any unrecognized directories that might contain media
      await this.detectUnrecognizedContent(mountPath, entries, analysis);

    } catch (error) {
      analysis.errors.push(`Directory structure analysis failed: ${error}`);
    }
  }

  /**
   * Check if a directory has valid content for the content type
   */
  private async hasValidContent(dirPath: string, contentConfig: ContentTypeConfig): Promise<boolean> {
    try {
      const files = await this.getFilesRecursively(dirPath);
      
      // Check if any files match the expected extensions
      const validFiles = files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return contentConfig.file_extensions.includes(ext);
      });

      return validFiles.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get all files recursively from a directory
   */
  private async getFilesRecursively(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.readdir(dirPath);
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry);
        const stats = await fs.stat(fullPath);
        
        if (stats.isDirectory()) {
          const subFiles = await this.getFilesRecursively(fullPath);
          files.push(...subFiles);
        } else {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Ignore errors for individual directories
    }
    
    return files;
  }

  /**
   * Detect unrecognized content that might be media
   */
  private async detectUnrecognizedContent(mountPath: string, entries: string[], analysis: CardAnalysis): Promise<void> {
    const recognizedPaths = Object.values(this.config.content_types).map(config => config.card_path);
    
    for (const entry of entries) {
      const entryPath = path.join(mountPath, entry);
      
      try {
        const stats = await fs.stat(entryPath);
        
        if (stats.isDirectory() && !recognizedPaths.includes(entry)) {
          // Check if this directory contains media files
          const files = await this.getFilesRecursively(entryPath);
          const mediaExtensions = [
            '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm',
            '.mp3', '.flac', '.wav', '.aac', '.ogg', '.m4a',
            '.epub', '.pdf', '.mobi', '.azw', '.azw3',
            '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff'
          ];
          
          const hasMedia = files.some(file => {
            const ext = path.extname(file).toLowerCase();
            return mediaExtensions.includes(ext);
          });
          
          if (hasMedia) {
            this.log(`Found unrecognized media directory: ${entry}`);
            // Could potentially suggest mapping this to a content type
          }
        }
      } catch (error) {
        // Ignore errors for individual entries
      }
    }
  }

  /**
   * Determine which content types are missing from the card
   */
  private determineMissingContentTypes(analysis: CardAnalysis): void {
    const allContentTypes = Object.keys(this.config.content_types);
    analysis.missingContentTypes = allContentTypes.filter(
      contentType => !analysis.detectedContentTypes.includes(contentType)
    );
  }

  /**
   * Create a README file in a newly created directory
   */
  private async createReadmeFile(dirPath: string, contentType: string, contentConfig: ContentTypeConfig): Promise<void> {
    try {
      const readmePath = path.join(dirPath, 'README.txt');
      
      const readmeContent = `
DangerPrep Offline Sync - ${contentType.toUpperCase()} Directory
================================================================

This directory is for ${contentType} content.

Supported file types: ${contentConfig.file_extensions.join(', ')}
Maximum size: ${contentConfig.max_size}
Sync direction: ${contentConfig.sync_direction}

Place your ${contentType} files in this directory and they will be synchronized
with the main content library when the card is inserted.

Generated: ${new Date().toISOString()}
`.trim();

      await fs.writeFile(readmePath, readmeContent);
    } catch (error) {
      // Don't fail if we can't create README
      this.log(`Could not create README in ${dirPath}: ${error}`);
    }
  }

  /**
   * Get content type statistics for a card
   */
  public async getContentTypeStats(mountPath: string, contentType: string): Promise<{files: number, size: number}> {
    const contentConfig = this.config.content_types[contentType];
    if (!contentConfig) {
      return { files: 0, size: 0 };
    }

    const cardPath = path.join(mountPath, contentConfig.card_path);
    
    if (!await fs.pathExists(cardPath)) {
      return { files: 0, size: 0 };
    }

    try {
      const files = await this.getFilesRecursively(cardPath);
      const validFiles = files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return contentConfig.file_extensions.includes(ext);
      });

      let totalSize = 0;
      for (const file of validFiles) {
        try {
          const stats = await fs.stat(file);
          totalSize += stats.size;
        } catch (error) {
          // Ignore individual file errors
        }
      }

      return { files: validFiles.length, size: totalSize };
    } catch (error) {
      return { files: 0, size: 0 };
    }
  }

  /**
   * Log a message
   */
  private log(message: string): void {
    console.log(`[CardAnalyzer] ${new Date().toISOString()} - ${message}`);
  }

  /**
   * Log an error
   */
  private logError(message: string, error: unknown): void {
    console.error(`[CardAnalyzer] ${new Date().toISOString()} - ${message}:`, error);
  }
}
