import { promises as fs } from 'fs';
import path from 'path';

import { FileUtils } from '@dangerprep/shared/files';
import type { Logger } from '@dangerprep/shared/logging';

import type { KiwixConfig, ZimPackage, LibraryEntry } from '../types';

export class LibraryManager {
  private config: KiwixConfig['kiwix_manager'];
  private logger: Logger;

  constructor(config: KiwixConfig, logger: Logger) {
    this.config = config.kiwix_manager;
    this.logger = logger;
  }

  async listInstalledPackages(): Promise<ZimPackage[]> {
    try {
      const zimDir = this.config.storage.zim_directory;
      const files = await fs.readdir(zimDir);
      const zimFiles = files.filter(file => file.endsWith('.zim') && !file.includes('.backup'));

      const packages: ZimPackage[] = [];

      for (const file of zimFiles) {
        const filePath = path.join(zimDir, file);
        const stats = await fs.stat(filePath);
        const packageName = FileUtils.getFileName(file);

        packages.push({
          name: packageName,
          title: packageName.replace(/_/g, ' '),
          description: `Local ZIM file: ${file}`,
          size: FileUtils.formatSize(stats.size),
          date: stats.mtime.toISOString(),
          path: filePath,
        });
      }

      this.logger.debug(`Found ${packages.length} installed ZIM packages`);
      return packages;
    } catch (error) {
      this.logger.error(`Error listing installed packages: ${error}`);
      return [];
    }
  }

  async updateLibrary(): Promise<boolean> {
    try {
      this.logger.info('Updating Kiwix library.xml');

      const installedPackages = await this.listInstalledPackages();
      const libraryEntries: LibraryEntry[] = [];

      for (const pkg of installedPackages) {
        if (!pkg.path) continue;

        try {
          const entry = await this.createLibraryEntry(pkg);
          libraryEntries.push(entry);
        } catch (error) {
          this.logger.warn(`Failed to create library entry for ${pkg.name}: ${error}`);
        }
      }

      const libraryXml = this.generateLibraryXml(libraryEntries);
      await fs.writeFile(this.config.storage.library_file, libraryXml, 'utf8');

      this.logger.info(`Updated library.xml with ${libraryEntries.length} entries`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to update library: ${error}`);
      return false;
    }
  }

  private async createLibraryEntry(pkg: ZimPackage): Promise<LibraryEntry> {
    if (!pkg.path) {
      throw new Error('Package path is required');
    }

    const stats = await fs.stat(pkg.path);
    const fileName = path.basename(pkg.path);

    // Extract metadata from filename (basic implementation)
    // In a real implementation, you might want to read ZIM file headers
    const parts = pkg.name.split('_');
    const language = parts.length > 1 && parts[1] ? parts[1] : 'en';

    return {
      id: pkg.name,
      path: pkg.path,
      url: fileName,
      title: pkg.title,
      description: pkg.description,
      language,
      creator: 'Kiwix',
      publisher: 'Kiwix',
      date: pkg.date,
      tags: this.generateTags(pkg.name),
      articleCount: 0, // Would need to read from ZIM file
      mediaCount: 0, // Would need to read from ZIM file
      size: stats.size,
    };
  }

  private generateTags(packageName: string): string {
    const tags = [];

    if (packageName.includes('wikipedia')) tags.push('wikipedia');
    if (packageName.includes('wiktionary')) tags.push('wiktionary');
    if (packageName.includes('wikivoyage')) tags.push('wikivoyage');
    if (packageName.includes('stackoverflow')) tags.push('stackoverflow');
    if (packageName.includes('gutenberg')) tags.push('gutenberg');
    if (packageName.includes('medicine')) tags.push('medicine');
    if (packageName.includes('_en_')) tags.push('english');

    return tags.join(';');
  }

  private generateLibraryXml(entries: LibraryEntry[]): string {
    const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>\n';
    const libraryOpen = '<library version="20110515">\n';
    const libraryClose = '</library>\n';

    const bookEntries = entries
      .map(entry => {
        return `  <book id="${this.escapeXml(entry.id)}"
        url="${this.escapeXml(entry.url)}"
        title="${this.escapeXml(entry.title)}"
        description="${this.escapeXml(entry.description)}"
        language="${this.escapeXml(entry.language)}"
        creator="${this.escapeXml(entry.creator)}"
        publisher="${this.escapeXml(entry.publisher)}"
        date="${this.escapeXml(entry.date)}"
        tags="${this.escapeXml(entry.tags)}"
        articleCount="${entry.articleCount}"
        mediaCount="${entry.mediaCount}"
        size="${entry.size}" />`;
      })
      .join('\n');

    return `${xmlHeader + libraryOpen + bookEntries}\n${libraryClose}`;
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  async validateLibrary(): Promise<boolean> {
    try {
      const libraryExists = await FileUtils.fileExists(this.config.storage.library_file);
      if (!libraryExists) {
        this.logger.warn('Library file does not exist');
        return false;
      }

      const libraryContent = await fs.readFile(this.config.storage.library_file, 'utf8');

      // Basic XML validation
      if (!libraryContent.includes('<?xml') || !libraryContent.includes('<library')) {
        this.logger.error('Library file is not valid XML');
        return false;
      }

      this.logger.debug('Library file validation passed');
      return true;
    } catch (error) {
      this.logger.error(`Library validation failed: ${error}`);
      return false;
    }
  }

  async getLibraryStats(): Promise<{
    totalPackages: number;
    totalSize: string;
    lastUpdated: Date | null;
  }> {
    try {
      const packages = await this.listInstalledPackages();
      const totalSize = await FileUtils.getDirectorySize(this.config.storage.zim_directory);

      let lastUpdated: Date | null = null;
      if (await FileUtils.fileExists(this.config.storage.library_file)) {
        const stats = await fs.stat(this.config.storage.library_file);
        lastUpdated = stats.mtime;
      }

      return {
        totalPackages: packages.length,
        totalSize: FileUtils.formatSize(totalSize),
        lastUpdated,
      };
    } catch (error) {
      this.logger.error(`Error getting library stats: ${error}`);
      return {
        totalPackages: 0,
        totalSize: '0 B',
        lastUpdated: null,
      };
    }
  }
}
