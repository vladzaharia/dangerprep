import { BaseHandler } from './base';
import { ContentTypeConfig, PlexMovie, FilterRule, PriorityRule } from '../types';
import { Logger } from '../utils/logger';
import { PlexClient } from '../services/plex-client';
import path from 'path';

export class MoviesHandler extends BaseHandler {
  private plexClient: PlexClient;

  constructor(
    config: ContentTypeConfig,
    logger: Logger,
    plexConfig: { server: string; token: string }
  ) {
    super(config, logger);
    this.contentType = 'movies';
    this.plexClient = new PlexClient(plexConfig.server, plexConfig.token, logger);
  }

  async sync(): Promise<boolean> {
    this.logSyncStart();

    try {
      // Validate paths and Plex connection
      if (!await this.validatePaths()) {
        return false;
      }

      if (!await this.plexClient.testConnection()) {
        this.logError('Failed to connect to Plex server');
        return false;
      }

      // Get movie metadata from Plex
      const movies = await this.plexClient.getMovies();
      if (movies.length === 0) {
        this.logError('No movies found in Plex library');
        return false;
      }

      this.logProgress(`Found ${movies.length} movies in Plex library`);

      // Filter movies based on criteria
      const filteredMovies = this.filterMovies(movies);
      this.logProgress(`${filteredMovies.length} movies passed filters`);

      // Sort by priority
      const prioritizedMovies = this.prioritizeMovies(filteredMovies);

      // Sync movies within size limit
      const success = await this.syncPrioritizedMovies(prioritizedMovies);

      this.logSyncComplete(success);
      return success;
    } catch (error) {
      this.logError('Sync operation failed', error);
      this.logSyncComplete(false, error.toString());
      return false;
    }
  }

  private filterMovies(movies: PlexMovie[]): PlexMovie[] {
    if (!this.config.filters || this.config.filters.length === 0) {
      return movies;
    }

    const filtered = movies.filter(movie => this.movieMatchesFilters(movie, this.config.filters!));
    this.logProgress(`Filtered ${filtered.length} movies from ${movies.length} total`);
    return filtered;
  }

  private movieMatchesFilters(movie: PlexMovie, filters: FilterRule[]): boolean {
    for (const filter of filters) {
      if (!this.applyFilter(movie, filter)) {
        return false;
      }
    }
    return true;
  }

  private applyFilter(movie: PlexMovie, filter: FilterRule): boolean {
    const { type, operator, value } = filter;

    let movieValue: any;
    switch (type) {
      case 'year':
        movieValue = movie.year;
        break;
      case 'rating':
        movieValue = movie.rating;
        break;
      case 'genre':
        movieValue = movie.genres;
        break;
      case 'resolution':
        movieValue = movie.resolution;
        break;
      default:
        return true; // Unknown filter type, pass through
    }

    switch (operator) {
      case '>=':
        return movieValue >= value;
      case '<=':
        return movieValue <= value;
      case '>':
        return movieValue > value;
      case '<':
        return movieValue < value;
      case '==':
        return movieValue === value;
      case '!=':
        return movieValue !== value;
      case 'in':
        if (Array.isArray(movieValue)) {
          return movieValue.some(item => value.includes(item));
        }
        return value.includes(movieValue);
      case 'not_in':
        if (Array.isArray(movieValue)) {
          return !movieValue.some(item => value.includes(item));
        }
        return !value.includes(movieValue);
      default:
        return true;
    }
  }

  private prioritizeMovies(movies: PlexMovie[]): PlexMovie[] {
    if (!this.config.priority_rules || this.config.priority_rules.length === 0) {
      return movies;
    }

    const moviesWithPriority = movies.map(movie => ({
      ...movie,
      priorityScore: this.calculatePriorityScore(movie, this.config.priority_rules!)
    }));

    return moviesWithPriority.sort((a, b) => b.priorityScore - a.priorityScore);
  }

  private calculatePriorityScore(movie: PlexMovie, rules: PriorityRule[]): number {
    let score = 0;

    for (const rule of rules) {
      let ruleScore = 0;

      switch (rule.type) {
        case 'year':
          // Newer movies get higher scores
          ruleScore = (movie.year - 1900) / 100; // Normalize to 0-1+ range
          break;
        case 'rating':
          ruleScore = movie.rating / 10; // Normalize to 0-1 range
          break;
        case 'popularity':
          // Could be based on view count, but we'll use rating as proxy
          ruleScore = movie.rating / 10;
          break;
        default:
          ruleScore = 0;
      }

      score += ruleScore * rule.weight;
    }

    return score;
  }

  private async syncPrioritizedMovies(movies: PlexMovie[]): Promise<boolean> {
    await this.ensureDirectory(this.config.local_path);

    let currentSize = await this.getDirectorySize(this.config.local_path);
    const maxSize = this.parseSize(this.config.max_size);

    let syncedCount = 0;
    let skippedCount = 0;

    for (const movie of movies) {
      if (currentSize + movie.size > maxSize) {
        this.logProgress(`Size limit reached, stopping sync. Synced: ${syncedCount}, Skipped: ${movies.length - syncedCount}`);
        break;
      }

      try {
        const success = await this.syncMovie(movie);
        if (success) {
          currentSize += movie.size;
          syncedCount++;
          this.logProgress(`Synced: ${movie.title} (${this.formatSize(movie.size)})`);
        } else {
          skippedCount++;
          this.logProgress(`Skipped: ${movie.title} (sync failed)`);
        }
      } catch (error) {
        skippedCount++;
        this.logError(`Failed to sync ${movie.title}`, error);
      }
    }

    this.logProgress(`Sync completed: ${syncedCount} synced, ${skippedCount} skipped`);
    return syncedCount > 0;
  }

  private async syncMovie(movie: PlexMovie): Promise<boolean> {
    if (!movie.path || !this.config.nfs_path) {
      return false;
    }

    // Convert Plex path to NFS path
    const nfsMoviePath = this.convertPlexPathToNFS(movie.path);
    const localMoviePath = path.join(this.config.local_path, path.basename(path.dirname(nfsMoviePath)));

    // Check if movie already exists locally
    if (await this.fileExists(localMoviePath)) {
      this.logger.debug(`Movie already exists locally: ${movie.title}`);
      return true;
    }

    // Sync the movie directory
    return await this.rsyncDirectory(
      path.dirname(nfsMoviePath),
      localMoviePath,
      {
        exclude: this.getMovieExcludePatterns()
      }
    );
  }

  private convertPlexPathToNFS(plexPath: string): string {
    // This would need to be customized based on your Plex/NFS path mapping
    // For now, assume direct mapping
    return plexPath.replace('/mnt/data/polaris/', this.config.nfs_path + '/');
  }

  private getMovieExcludePatterns(): string[] {
    return [
      ...super.getExcludePatterns(),
      '*.mkv.bak',
      '*.mp4.bak',
      '*.avi.bak',
      'extras/',
      'behind the scenes/',
      'deleted scenes/',
      'featurettes/'
    ];
  }
}
