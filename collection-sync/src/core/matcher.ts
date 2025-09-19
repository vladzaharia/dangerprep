import Fuse from 'fuse.js';
import type { MediaItem } from '../config/schema.js';

export interface MatchResult {
  item: string;
  score: number;
  isExactMatch: boolean;
}

export class ContentMatcher {
  private static readonly DEFAULT_THRESHOLD = 0.6;
  private static readonly EXACT_MATCH_THRESHOLD = 0.95;

  /**
   * Find the best match for a target name in a list of available items
   */
  findBestMatch(
    targetName: string,
    availableItems: string[],
    threshold: number = ContentMatcher.DEFAULT_THRESHOLD
  ): MatchResult | null {
    if (availableItems.length === 0) {
      return null;
    }

    // Check for exact match first
    const exactMatch = availableItems.find(item => 
      item.toLowerCase() === targetName.toLowerCase()
    );
    
    if (exactMatch) {
      return {
        item: exactMatch,
        score: 1.0,
        isExactMatch: true,
      };
    }

    // Use Fuse.js for fuzzy matching
    const fuse = new Fuse(availableItems, {
      includeScore: true,
      threshold: 1 - threshold, // Fuse uses distance, we use similarity
      keys: [''], // We're searching the strings directly
      ignoreLocation: true,
      ignoreFieldNorm: true,
    });

    const results = fuse.search(targetName);
    
    if (results.length === 0) {
      return this.fallbackWordMatching(targetName, availableItems, threshold);
    }

    const bestResult = results[0];
    if (!bestResult || !bestResult.score) {
      return null;
    }

    const similarity = 1 - bestResult.score; // Convert distance to similarity

    if (similarity >= threshold) {
      return {
        item: bestResult.item,
        score: similarity,
        isExactMatch: similarity >= ContentMatcher.EXACT_MATCH_THRESHOLD,
      };
    }

    return this.fallbackWordMatching(targetName, availableItems, threshold);
  }

  /**
   * Fallback word-based matching for cases where fuzzy matching fails
   */
  private fallbackWordMatching(
    targetName: string,
    availableItems: string[],
    threshold: number
  ): MatchResult | null {
    const targetWords = this.extractWords(targetName);
    let bestMatch: MatchResult | null = null;

    for (const item of availableItems) {
      const itemWords = this.extractWords(item);
      const score = this.calculateWordMatchScore(targetWords, itemWords);
      
      if (score >= threshold && (!bestMatch || score > bestMatch.score)) {
        bestMatch = {
          item,
          score,
          isExactMatch: score >= ContentMatcher.EXACT_MATCH_THRESHOLD,
        };
      }
    }

    return bestMatch;
  }

  /**
   * Extract meaningful words from a string for matching
   */
  private extractWords(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Replace non-word characters with spaces
      .split(/\s+/)
      .filter(word => word.length > 2) // Filter out short words
      .filter(word => !this.isStopWord(word)); // Filter out common stop words
  }

  /**
   * Check if a word is a common stop word that should be ignored
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
      'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before',
      'after', 'above', 'below', 'between', 'among', 'through', 'during',
      'before', 'after', 'above', 'below', 'between'
    ]);
    
    return stopWords.has(word.toLowerCase());
  }

  /**
   * Calculate match score based on word overlap
   */
  private calculateWordMatchScore(targetWords: string[], itemWords: string[]): number {
    if (targetWords.length === 0 || itemWords.length === 0) {
      return 0;
    }

    const targetSet = new Set(targetWords);
    const itemSet = new Set(itemWords);
    
    // Count matching words
    let matchingWords = 0;
    for (const word of targetSet) {
      if (itemSet.has(word)) {
        matchingWords++;
      }
    }

    // Calculate score as percentage of target words that match
    return matchingWords / targetWords.length;
  }

  /**
   * Find multiple potential matches with scores
   */
  findMultipleMatches(
    targetName: string,
    availableItems: string[],
    maxResults: number = 5,
    threshold: number = ContentMatcher.DEFAULT_THRESHOLD
  ): MatchResult[] {
    if (availableItems.length === 0) {
      return [];
    }

    const fuse = new Fuse(availableItems, {
      includeScore: true,
      threshold: 1 - threshold,
      keys: [''],
      ignoreLocation: true,
      ignoreFieldNorm: true,
    });

    const results = fuse.search(targetName, { limit: maxResults });
    
    return results
      .filter(result => result.score !== undefined)
      .map(result => ({
        item: result.item,
        score: 1 - result.score!, // Convert distance to similarity
        isExactMatch: (1 - result.score!) >= ContentMatcher.EXACT_MATCH_THRESHOLD,
      }))
      .filter(result => result.score >= threshold)
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Batch find matches for multiple items
   */
  findBatchMatches(
    items: MediaItem[],
    availableContent: { movies: string[]; tv: string[]; games: string[]; webtv: string[] },
    threshold: number = ContentMatcher.DEFAULT_THRESHOLD
  ): Map<string, MatchResult | null> {
    const results = new Map<string, MatchResult | null>();

    for (const item of items) {
      let availableItems: string[] = [];
      
      switch (item.type.toLowerCase()) {
        case 'movie':
          availableItems = availableContent.movies;
          break;
        case 'tv':
          availableItems = availableContent.tv;
          break;
        case 'games':
          availableItems = availableContent.games;
          break;
        case 'webtv':
        case 'youtube':
          availableItems = availableContent.webtv;
          break;
        default:
          // Try all categories for unknown types
          availableItems = [
            ...availableContent.movies,
            ...availableContent.tv,
            ...availableContent.games,
            ...availableContent.webtv,
          ];
      }

      const match = this.findBestMatch(item.name, availableItems, threshold);
      results.set(item.name, match);
    }

    return results;
  }
}
