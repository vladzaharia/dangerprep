import { writeFile } from 'fs/promises';
import type { ContentAnalysis, CollectionStats } from '../core/analyzer.js';
import { getConfig } from '../config/loader.js';
import { FileSystemManager } from '../core/filesystem.js';

export class MarkdownExporter {
  private config = getConfig();
  private fs = new FileSystemManager();

  /**
   * Export collection analysis and stats to Markdown format
   */
  async export(
    analyses: ContentAnalysis[],
    stats: CollectionStats,
    outputPath: string
  ): Promise<void> {
    // Get effective drive size for configuration section
    const effectiveDriveSize = await this.fs.getEffectiveDriveSize(
      this.config.output_config.default_destination,
      this.config.drive_config.size_gb
    );

    const markdownContent = this.generateMarkdown(analyses, stats, effectiveDriveSize);
    await writeFile(outputPath, markdownContent, 'utf-8');
  }

  /**
   * Generate complete Markdown report
   */
  private generateMarkdown(analyses: ContentAnalysis[], stats: CollectionStats, effectiveDriveSize: number): string {
    const sections: string[] = [];

    // Header
    sections.push(this.generateHeader());
    
    // Executive Summary
    sections.push(this.generateExecutiveSummary(stats));
    
    // Drive Usage Analysis
    sections.push(this.generateDriveUsageAnalysis(stats));

    // Space Allocation Breakdown
    sections.push(this.generateSpaceAllocationBreakdown(stats));

    // Content Breakdown
    sections.push(this.generateContentBreakdown(analyses, stats));
    
    // Largest Items
    sections.push(this.generateLargestItems(stats.largest_items));
    
    // Missing Content
    sections.push(this.generateMissingContent(stats.missing_items_list));
    
    // Detailed Content List
    sections.push(this.generateDetailedContentList(analyses));
    
    // Footer
    sections.push(this.generateFooter(effectiveDriveSize));

    return sections.join('\n\n');
  }

  /**
   * Generate report header
   */
  private generateHeader(): string {
    const now = new Date();
    return `# Media Collection Summary Report

**Generated:** ${now.toLocaleDateString()} at ${now.toLocaleTimeString()}  
**System:** Media Collection Manager v2.0 (TypeScript)  
**Drive Capacity:** ${this.config.drive_config.size_gb} GB (${(this.config.drive_config.size_gb / 1024).toFixed(1)} TB)`;
  }

  /**
   * Generate executive summary
   */
  private generateExecutiveSummary(stats: CollectionStats): string {
    const successRate = ((stats.found_items / stats.total_items) * 100).toFixed(1);
    
    return `## 📊 Executive Summary

| Metric | Value |
|--------|-------|
| **Total Items** | ${stats.total_items} |
| **Found Items** | ${stats.found_items} (${successRate}%) |
| **Missing Items** | ${stats.missing_items} |
| **Empty Directories** | ${stats.empty_items} |
| **Total Collection Size** | ${stats.total_size_gb.toFixed(2)} GB |
| **Drive Usage** | ${stats.drive_usage_percent.toFixed(1)}% |
| **Remaining Space** | ${(this.config.drive_config.size_gb - stats.total_size_gb).toFixed(2)} GB |`;
  }

  /**
   * Generate drive usage analysis
   */
  private generateDriveUsageAnalysis(stats: CollectionStats): string {
    const recommendedMax = this.config.drive_config.recommended_max_usage * 100;
    const safeMax = this.config.drive_config.safe_usage_threshold * 100;
    
    let statusIcon = '🟢';
    let statusText = 'Optimal';
    
    if (stats.drive_usage_percent > safeMax) {
      statusIcon = '🔴';
      statusText = 'Critical - Exceeds safe threshold';
    } else if (stats.drive_usage_percent > recommendedMax) {
      statusIcon = '🟡';
      statusText = 'Warning - Exceeds recommended maximum';
    }

    return `## 💾 Drive Usage Analysis

**Status:** ${statusIcon} ${statusText}

| Threshold | Percentage | Status |
|-----------|------------|--------|
| Current Usage | ${stats.drive_usage_percent.toFixed(1)}% | ${statusIcon} |
| Recommended Max | ${recommendedMax}% | ${stats.drive_usage_percent <= recommendedMax ? '✅' : '❌'} |
| Safe Threshold | ${safeMax}% | ${stats.drive_usage_percent <= safeMax ? '✅' : '❌'} |

### Usage Breakdown
- **Used Space:** ${stats.total_size_gb.toFixed(2)} GB
- **Free Space:** ${(this.config.drive_config.size_gb - stats.total_size_gb).toFixed(2)} GB
- **Total Capacity:** ${this.config.drive_config.size_gb} GB`;
  }

  /**
   * Generate space allocation breakdown
   */
  private generateSpaceAllocationBreakdown(stats: CollectionStats): string {
    const allocation = stats.space_allocation;
    const warnings = stats.space_warnings;

    let content = `## 📦 Space Allocation Planning

**Total Required Space:** ${allocation.totals.total_size_gb.toFixed(1)} GB (${(allocation.totals.total_size_gb / this.config.drive_config.size_gb * 100).toFixed(1)}% of drive)

| Content Type | Items | Found | Missing | Total Size (GB) | Download Needed (GB) |
|--------------|-------|-------|---------|-----------------|---------------------|
| **Movies** | ${allocation.movies.count} | ${allocation.movies.found_count} | ${allocation.movies.missing_count} | ${allocation.movies.total_size_gb.toFixed(1)} | ${allocation.movies.required_download_size_gb.toFixed(1)} |
| **TV Shows** | ${allocation.tv_shows.count} | ${allocation.tv_shows.found_count} | ${allocation.tv_shows.missing_count} | ${allocation.tv_shows.total_size_gb.toFixed(1)} | ${allocation.tv_shows.required_download_size_gb.toFixed(1)} |
| **WebTV Channels** | ${allocation.webtv_channels.count} | ${allocation.webtv_channels.found_count} | ${allocation.webtv_channels.missing_count} | ${allocation.webtv_channels.total_size_gb.toFixed(1)} | ${allocation.webtv_channels.required_download_size_gb.toFixed(1)} |
| **Kiwix Content** | ${allocation.kiwix.count} | ${allocation.kiwix.found_count} | ${allocation.kiwix.missing_count} | ${allocation.kiwix.total_size_gb.toFixed(1)} | ${allocation.kiwix.required_download_size_gb.toFixed(1)} |
| **Other Content** | ${allocation.other.count} | ${allocation.other.found_count} | ${allocation.other.missing_count} | ${allocation.other.total_size_gb.toFixed(1)} | ${allocation.other.required_download_size_gb.toFixed(1)} |
| **TOTAL** | **${allocation.totals.count}** | **${allocation.totals.found_count}** | **${allocation.totals.missing_count}** | **${allocation.totals.total_size_gb.toFixed(1)}** | **${allocation.totals.required_download_size_gb.toFixed(1)}** |

### 🚨 Space Warnings

${warnings.recommendations.map(rec => `- ${rec}`).join('\n')}

### 📊 Space Summary
- **Currently Used:** ${allocation.totals.found_size_gb.toFixed(1)} GB
- **Download Required:** ${allocation.totals.required_download_size_gb.toFixed(1)} GB
- **Total When Complete:** ${allocation.totals.total_size_gb.toFixed(1)} GB
- **Remaining Space:** ${warnings.available_space_gb.toFixed(1)} GB
- **Drive Utilization:** ${(allocation.totals.total_size_gb / this.config.drive_config.size_gb * 100).toFixed(1)}%`;

    return content;
  }

  /**
   * Generate content breakdown by type
   */
  private generateContentBreakdown(analyses: ContentAnalysis[], stats: CollectionStats): string {
    const movieAnalyses = analyses.filter(a => a.type.toLowerCase() === 'movie');
    const tvAnalyses = analyses.filter(a => a.type.toLowerCase() === 'tv');
    const webtvAnalyses = analyses.filter(a => a.type.toLowerCase() === 'webtv');
    const kiwixAnalyses = analyses.filter(a => a.type.toLowerCase() === 'kiwix');
    const otherAnalyses = analyses.filter(a => !['movie', 'tv', 'webtv', 'kiwix'].includes(a.type.toLowerCase()));

    const movieSize = movieAnalyses.filter(a => a.status === 'found').reduce((sum, a) => sum + a.size_gb, 0);
    const tvSize = tvAnalyses.filter(a => a.status === 'found').reduce((sum, a) => sum + a.size_gb, 0);
    const webtvSize = webtvAnalyses.filter(a => a.status === 'found').reduce((sum, a) => sum + a.size_gb, 0);
    const kiwixSize = kiwixAnalyses.filter(a => a.status === 'found').reduce((sum, a) => sum + a.size_gb, 0);
    const otherSize = otherAnalyses.filter(a => a.status === 'found').reduce((sum, a) => sum + a.size_gb, 0);

    return `## 🎬 Content Breakdown

| Content Type | Count | Found | Size (GB) | Avg Size (GB) |
|--------------|-------|-------|-----------|---------------|
| **Movies** | ${stats.movies_count} | ${movieAnalyses.filter(a => a.status === 'found').length} | ${movieSize.toFixed(2)} | ${movieAnalyses.length > 0 ? (movieSize / movieAnalyses.filter(a => a.status === 'found').length).toFixed(2) : '0.00'} |
| **TV Shows** | ${stats.tv_shows_count} | ${tvAnalyses.filter(a => a.status === 'found').length} | ${tvSize.toFixed(2)} | ${tvAnalyses.length > 0 ? (tvSize / tvAnalyses.filter(a => a.status === 'found').length).toFixed(2) : '0.00'} |
| **WebTV Channels** | ${stats.webtv_channels_count} | ${webtvAnalyses.filter(a => a.status === 'found').length} | ${webtvSize.toFixed(2)} | ${webtvAnalyses.length > 0 ? (webtvSize / webtvAnalyses.filter(a => a.status === 'found').length).toFixed(2) : '0.00'} |
| **Kiwix Content** | ${stats.kiwix_count} | ${kiwixAnalyses.filter(a => a.status === 'found').length} | ${kiwixSize.toFixed(2)} | ${kiwixAnalyses.length > 0 ? (kiwixSize / kiwixAnalyses.filter(a => a.status === 'found').length).toFixed(2) : '0.00'} |
| **Other** | ${stats.other_count} | ${otherAnalyses.filter(a => a.status === 'found').length} | ${otherSize.toFixed(2)} | ${otherAnalyses.length > 0 ? (otherSize / otherAnalyses.filter(a => a.status === 'found').length).toFixed(2) : '0.00'} |
| **Total** | ${stats.total_items} | ${stats.found_items} | ${stats.total_size_gb.toFixed(2)} | ${stats.found_items > 0 ? (stats.total_size_gb / stats.found_items).toFixed(2) : '0.00'} |`;
  }

  /**
   * Generate largest items section
   */
  private generateLargestItems(largestItems: ContentAnalysis[]): string {
    if (largestItems.length === 0) {
      return `## 📏 Largest Items

No items found.`;
    }

    const rows = largestItems.map((item, index) => 
      `| ${index + 1} | ${item.name} | ${item.type} | ${item.size_gb.toFixed(2)} GB | ${item.episodes} |`
    ).join('\n');

    return `## 📏 Largest Items (Top ${largestItems.length})

| Rank | Name | Type | Size | Episodes |
|------|------|------|------|----------|
${rows}`;
  }

  /**
   * Generate missing content section
   */
  private generateMissingContent(missingItems: any[]): string {
    if (missingItems.length === 0) {
      return `## ❌ Missing Content

🎉 **All content found!** No missing items detected.`;
    }

    const moviesMissing = missingItems.filter(item => item.type.toLowerCase() === 'movie');
    const tvMissing = missingItems.filter(item => item.type.toLowerCase() === 'tv');
    const webtvMissing = missingItems.filter(item => item.type.toLowerCase() === 'webtv');
    const kiwixMissing = missingItems.filter(item => item.type.toLowerCase() === 'kiwix');
    const otherMissing = missingItems.filter(item => !['movie', 'tv', 'webtv', 'kiwix'].includes(item.type.toLowerCase()));

    let content = `## ❌ Missing Content (${missingItems.length} items)\n\n`;

    if (moviesMissing.length > 0) {
      content += `### Movies (${moviesMissing.length})\n`;
      moviesMissing.forEach(item => {
        content += `- ${item.name}\n`;
      });
      content += '\n';
    }

    if (tvMissing.length > 0) {
      content += `### TV Shows (${tvMissing.length})\n`;
      tvMissing.forEach(item => {
        const seasonsText = item.seasons ? ` (Seasons: ${item.seasons.join(', ')})` : '';
        content += `- ${item.name}${seasonsText}\n`;
      });
      content += '\n';
    }

    if (webtvMissing.length > 0) {
      content += `### WebTV Channels (${webtvMissing.length})\n`;
      webtvMissing.forEach(item => {
        const priorityText = 'priority' in item && item.priority ? ` (${item.priority})` : '';
        content += `- ${item.name}${priorityText}\n`;
      });
      content += '\n';
    }

    if (kiwixMissing.length > 0) {
      content += `### Kiwix Content (${kiwixMissing.length})\n`;
      kiwixMissing.forEach(item => {
        const categoryText = 'category' in item && item.category ? ` (${item.category})` : '';
        const sizeText = 'expected_size_gb' in item && item.expected_size_gb ? ` - ${item.expected_size_gb}GB` : '';
        content += `- ${item.name}${categoryText}${sizeText}\n`;
      });
      content += '\n';
    }

    if (otherMissing.length > 0) {
      content += `### Other Content (${otherMissing.length})\n`;
      otherMissing.forEach(item => {
        content += `- ${item.name} (${item.type})\n`;
      });
    }

    return content;
  }

  /**
   * Generate detailed content list
   */
  private generateDetailedContentList(analyses: ContentAnalysis[]): string {
    const foundItems = analyses.filter(a => a.status === 'found').sort((a, b) => b.size_gb - a.size_gb);
    
    if (foundItems.length === 0) {
      return `## 📋 Detailed Content List

No content found.`;
    }

    const rows = foundItems.map(item => {
      const actualName = item.actual_name ? ` → ${item.actual_name}` : '';
      const matchScore = item.match_score && item.match_score < 1 ? ` (${(item.match_score * 100).toFixed(0)}%)` : '';
      const seasons = item.seasons ? ` S${item.seasons.join(', S')}` : '';

      // WebTV-specific information
      let webtvInfo = '';
      if (item.type.toLowerCase() === 'webtv' && item.webtv_channel_info) {
        const info = item.webtv_channel_info;
        if (info.copy_mode === 'partial' && info.selected_videos) {
          webtvInfo = ` (${info.selected_videos.length} videos, ${item.size_gb.toFixed(2)}GB of ${info.total_channel_size_gb.toFixed(2)}GB)`;
        } else if (info.is_required) {
          webtvInfo = ' (Required)';
        }
      }

      return `| ${item.name}${actualName} | ${item.type}${seasons}${webtvInfo} | ${item.size_gb.toFixed(2)} | ${item.episodes} | ${item.media_file_count}${matchScore} |`;
    }).join('\n');

    return `## 📋 Detailed Content List (${foundItems.length} items)

| Name | Type | Size (GB) | Episodes | Media Files |
|------|------|-----------|----------|-------------|
${rows}`;
  }

  /**
   * Generate report footer
   */
  private generateFooter(effectiveDriveSize: number): string {
    const isActualSize = effectiveDriveSize !== this.config.drive_config.size_gb;
    const driveCapacityNote = isActualSize
      ? `${effectiveDriveSize} GB (detected from filesystem)`
      : `${effectiveDriveSize} GB (configured)`;

    return `---

## 📝 Notes

- **Size calculations** are performed using system \`du\` command for accuracy
- **Media files** include: ${this.config.media_extensions.join(', ')}
- **Fuzzy matching** is used to find content with different naming conventions
- **Empty directories** are directories that exist but contain no media files
- **Reserved space** items (Games, WebTV) use configured space allocations

## 🔧 Configuration

- **NFS Base Path:** ${this.config.nfs_paths.base}
- **Drive Capacity:** ${driveCapacityNote}
- **Recommended Usage:** ${(this.config.drive_config.recommended_max_usage * 100).toFixed(0)}%
- **Safe Threshold:** ${(this.config.drive_config.safe_usage_threshold * 100).toFixed(0)}%

*Report generated by Media Collection Manager*`;
  }
}
