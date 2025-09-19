import { writeFile } from 'fs/promises';
import type { ContentAnalysis } from '../core/analyzer.js';

export interface CSVRow {
  name: string;
  type: string;
  status: string;
  actual_name: string;
  size_gb: string;
  episodes: string;
  file_count: string;
  media_file_count: string;
  match_score: string;
  nfs_path: string;
  seasons: string;
  reserved_space_gb: string;
  size_to_content_ratio: string;
  percentage_of_total: string;
  webtv_copy_mode: string;
  webtv_total_size_gb: string;
  webtv_selected_videos: string;
  kiwix_category: string;
  kiwix_priority: string;
  kiwix_expected_size_gb: string;
}

export class CSVExporter {
  private static readonly CSV_HEADERS = [
    'Name',
    'Type',
    'Status',
    'Actual Name',
    'Size (GB)',
    'Episodes',
    'File Count',
    'Media File Count',
    'Match Score',
    'NFS Path',
    'Seasons',
    'Reserved Space (GB)',
    'Size to Content Ratio',
    'Percentage of Total',
    'WebTV Copy Mode',
    'WebTV Total Size (GB)',
    'WebTV Selected Videos',
    'Kiwix Category',
    'Kiwix Priority',
    'Kiwix Expected Size (GB)'
  ];

  /**
   * Export collection analysis to CSV format
   */
  async export(analyses: ContentAnalysis[], outputPath: string): Promise<void> {
    const totalSize = analyses
      .filter(a => a.status === 'found')
      .reduce((sum, a) => sum + a.size_gb, 0);

    // Convert analyses to CSV rows
    const csvRows = analyses.map(analysis => this.analysisToCSVRow(analysis, totalSize));

    // Generate CSV content
    const csvContent = this.generateCSVContent(csvRows);

    // Write to file
    await writeFile(outputPath, csvContent, 'utf-8');
  }

  /**
   * Convert a single analysis to CSV row
   */
  private analysisToCSVRow(analysis: ContentAnalysis, totalSize: number): CSVRow {
    const sizeToContentRatio = analysis.media_file_count > 0
      ? (analysis.size_gb / analysis.media_file_count).toFixed(3)
      : '0.000';

    const percentageOfTotal = totalSize > 0
      ? ((analysis.size_gb / totalSize) * 100).toFixed(2)
      : '0.00';

    // WebTV-specific fields
    const webtvCopyMode = analysis.webtv_channel_info?.copy_mode || '';
    const webtvTotalSize = analysis.webtv_channel_info?.total_channel_size_gb?.toFixed(3) || '';
    const webtvSelectedVideos = analysis.webtv_channel_info?.selected_videos?.length?.toString() || '';

    // Kiwix-specific fields (extract from analysis if it's a Kiwix item)
    const isKiwix = analysis.type.toLowerCase() === 'kiwix';
    const kiwixCategory = isKiwix ? this.extractKiwixCategory(analysis.name) : '';
    const kiwixPriority = isKiwix ? this.extractKiwixPriority(analysis.name) : '';
    const kiwixExpectedSize = isKiwix ? this.extractKiwixExpectedSize(analysis.name) : '';

    return {
      name: analysis.name,
      type: analysis.type,
      status: analysis.status,
      actual_name: analysis.actual_name || '',
      size_gb: analysis.size_gb.toFixed(3),
      episodes: analysis.episodes.toString(),
      file_count: analysis.file_count.toString(),
      media_file_count: analysis.media_file_count.toString(),
      match_score: analysis.match_score ? analysis.match_score.toFixed(3) : '',
      nfs_path: analysis.nfs_path,
      seasons: analysis.seasons ? analysis.seasons.join(', ') : '',
      reserved_space_gb: analysis.reserved_space_gb ? analysis.reserved_space_gb.toString() : '',
      size_to_content_ratio: sizeToContentRatio,
      percentage_of_total: percentageOfTotal,
      webtv_copy_mode: webtvCopyMode,
      webtv_total_size_gb: webtvTotalSize,
      webtv_selected_videos: webtvSelectedVideos,
      kiwix_category: kiwixCategory,
      kiwix_priority: kiwixPriority,
      kiwix_expected_size_gb: kiwixExpectedSize
    };
  }

  /**
   * Generate CSV content from rows
   */
  private generateCSVContent(rows: CSVRow[]): string {
    const lines: string[] = [];

    // Add header
    lines.push(CSVExporter.CSV_HEADERS.map(header => this.escapeCSVField(header)).join(','));

    // Add data rows
    for (const row of rows) {
      const csvRow = [
        row.name,
        row.type,
        row.status,
        row.actual_name,
        row.size_gb,
        row.episodes,
        row.file_count,
        row.media_file_count,
        row.match_score,
        row.nfs_path,
        row.seasons,
        row.reserved_space_gb,
        row.size_to_content_ratio,
        row.percentage_of_total,
        row.webtv_copy_mode,
        row.webtv_total_size_gb,
        row.webtv_selected_videos,
        row.kiwix_category,
        row.kiwix_priority,
        row.kiwix_expected_size_gb
      ].map(field => this.escapeCSVField(field));

      lines.push(csvRow.join(','));
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Escape a field for CSV format
   */
  private escapeCSVField(field: string): string {
    // If field contains comma, newline, or quote, wrap in quotes and escape internal quotes
    if (field.includes(',') || field.includes('\n') || field.includes('"')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  }

  /**
   * Extract Kiwix category from item name
   */
  private extractKiwixCategory(name: string): string {
    const categoryMap: Record<string, string> = {
      'wikivoyage_en_all_maxi': 'travel',
      'wikipedia_en_top_maxi': 'encyclopedia',
      'bulbagarden_en_all_maxi': 'gaming',
      'wikinews_en_all_maxi': 'news',
    };
    return categoryMap[name] || '';
  }

  /**
   * Extract Kiwix priority from item name (all current items are required)
   */
  private extractKiwixPriority(_name: string): string {
    return 'required'; // All configured Kiwix items are currently required
  }

  /**
   * Extract Kiwix expected size from item name
   */
  private extractKiwixExpectedSize(name: string): string {
    const sizeMap: Record<string, number> = {
      'wikivoyage_en_all_maxi': 1.0,
      'wikipedia_en_top_maxi': 7.2,
      'bulbagarden_en_all_maxi': 2.7,
      'wikinews_en_all_maxi': 0.295,
    };
    const size = sizeMap[name];
    return size ? size.toFixed(3) : '';
  }

  /**
   * Generate CSV with custom columns
   */
  async exportCustom(
    analyses: ContentAnalysis[],
    outputPath: string,
    columns: (keyof CSVRow)[],
    customHeaders?: string[]
  ): Promise<void> {
    const totalSize = analyses
      .filter(a => a.status === 'found')
      .reduce((sum, a) => sum + a.size_gb, 0);

    const csvRows = analyses.map(analysis => this.analysisToCSVRow(analysis, totalSize));
    
    const lines: string[] = [];

    // Add custom headers or default ones
    const headers = customHeaders || columns.map(col => 
      CSVExporter.CSV_HEADERS[Object.keys(csvRows[0] || {}).indexOf(col)] || col
    );
    lines.push(headers.map(header => this.escapeCSVField(header)).join(','));

    // Add data rows with selected columns
    for (const row of csvRows) {
      const csvRow = columns.map(col => this.escapeCSVField(row[col]));
      lines.push(csvRow.join(','));
    }

    const csvContent = lines.join('\n') + '\n';
    await writeFile(outputPath, csvContent, 'utf-8');
  }

  /**
   * Export summary statistics as CSV
   */
  async exportSummary(
    analyses: ContentAnalysis[],
    outputPath: string
  ): Promise<void> {
    const summary = this.calculateSummary(analyses);
    
    const lines: string[] = [];
    lines.push('Metric,Value');
    
    for (const [key, value] of Object.entries(summary)) {
      lines.push(`${this.escapeCSVField(key)},${this.escapeCSVField(value.toString())}`);
    }

    const csvContent = lines.join('\n') + '\n';
    await writeFile(outputPath, csvContent, 'utf-8');
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(analyses: ContentAnalysis[]): Record<string, number | string> {
    const found = analyses.filter(a => a.status === 'found');
    const missing = analyses.filter(a => a.status === 'missing');
    const empty = analyses.filter(a => a.status === 'empty');
    
    const totalSize = found.reduce((sum, a) => sum + a.size_gb, 0);
    const avgSize = found.length > 0 ? totalSize / found.length : 0;
    
    return {
      'Total Items': analyses.length,
      'Found Items': found.length,
      'Missing Items': missing.length,
      'Empty Items': empty.length,
      'Total Size (GB)': totalSize.toFixed(3),
      'Average Size (GB)': avgSize.toFixed(3),
      'Movies': analyses.filter(a => a.type.toLowerCase() === 'movie').length,
      'TV Shows': analyses.filter(a => a.type.toLowerCase() === 'tv').length,
      'Other Content': analyses.filter(a => !['movie', 'tv'].includes(a.type.toLowerCase())).length,
    };
  }
}
