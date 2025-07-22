import { BaseHandler } from './base';
import { ContentTypeConfig, PlexTVShow } from '../types';
import { Logger } from '../utils/logger';
import { PlexClient } from '../services/plex-client';
import path from 'path';

export class TVHandler extends BaseHandler {
  private plexClient: PlexClient;

  constructor(
    config: ContentTypeConfig,
    logger: Logger,
    plexConfig: { server: string; token: string }
  ) {
    super(config, logger);
    this.contentType = 'tv';
    this.plexClient = new PlexClient(plexConfig.server, plexConfig.token, logger);
  }

  async sync(): Promise<boolean> {
    this.logSyncStart();

    try {
      // Validate paths and Plex connection
      if (!(await this.validatePaths())) {
        return false;
      }

      if (!(await this.plexClient.testConnection())) {
        this.logError('Failed to connect to Plex server');
        return false;
      }

      // Get TV show metadata from Plex
      const shows = await this.plexClient.getTVShows();
      if (shows.length === 0) {
        this.logError('No TV shows found in Plex library');
        return false;
      }

      this.logProgress(`Found ${shows.length} TV shows in Plex library`);

      // Filter shows based on include list
      const filteredShows = this.filterShows(shows);
      this.logProgress(`${filteredShows.length} shows selected for sync`);

      // Sync shows within size limit
      const success = await this.syncFilteredShows(filteredShows);

      this.logSyncComplete(success);
      return success;
    } catch (error) {
      this.logError('Sync operation failed', error);
      this.logSyncComplete(false, error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  private filterShows(shows: PlexTVShow[]): PlexTVShow[] {
    if (!this.config.include_folders || this.config.include_folders.length === 0) {
      return shows;
    }

    const filtered = shows.filter(show =>
      this.config.include_folders!.some(folder =>
        show.title.toLowerCase().includes(folder.toLowerCase())
      )
    );

    this.logProgress(`Filtered ${filtered.length} shows from ${shows.length} total`);
    return filtered;
  }

  private async syncFilteredShows(shows: PlexTVShow[]): Promise<boolean> {
    await this.ensureDirectory(this.config.local_path);

    let currentSize = await this.getDirectorySize(this.config.local_path);
    const maxSize = this.parseSize(this.config.max_size);

    let syncedCount = 0;
    let skippedCount = 0;

    for (const show of shows) {
      try {
        // Limit episodes per show if configured
        const episodesToSync = this.limitEpisodes(show);
        const showSize = this.calculateShowSize(episodesToSync);

        if (currentSize + showSize > maxSize) {
          this.logProgress(
            `Size limit reached, stopping sync. Synced: ${syncedCount}, Skipped: ${shows.length - syncedCount}`
          );
          break;
        }

        const success = await this.syncShow(show, episodesToSync);
        if (success) {
          currentSize += showSize;
          syncedCount++;
          this.logProgress(
            `Synced: ${show.title} (${episodesToSync.length} episodes, ${this.formatSize(showSize)})`
          );
        } else {
          skippedCount++;
          this.logProgress(`Skipped: ${show.title} (sync failed)`);
        }
      } catch (error) {
        skippedCount++;
        this.logError(`Failed to sync ${show.title}`, error);
      }
    }

    this.logProgress(`Sync completed: ${syncedCount} shows synced, ${skippedCount} skipped`);
    return syncedCount > 0;
  }

  private limitEpisodes(show: PlexTVShow): PlexTVShow['episodes'] {
    if (!this.config.max_episodes_per_show) {
      return show.episodes;
    }

    // Sort episodes by season and episode number, then take the most recent
    const sortedEpisodes = [...show.episodes].sort((a, b) => {
      if (a.season !== b.season) {
        return b.season - a.season; // Newer seasons first
      }
      return b.episode - a.episode; // Newer episodes first
    });

    return sortedEpisodes.slice(0, this.config.max_episodes_per_show);
  }

  private calculateShowSize(episodes: PlexTVShow['episodes']): number {
    return episodes.reduce((total, episode) => total + episode.size, 0);
  }

  private async syncShow(show: PlexTVShow, episodes: PlexTVShow['episodes']): Promise<boolean> {
    if (!this.config.nfs_path) {
      return false;
    }

    const showDir = this.sanitizeShowName(show.title);
    const localShowPath = path.join(this.config.local_path, showDir);

    // Create show directory
    await this.ensureDirectory(localShowPath);

    let syncedEpisodes = 0;

    // Group episodes by season
    const episodesBySeason = this.groupEpisodesBySeason(episodes);

    for (const [season, seasonEpisodes] of episodesBySeason.entries()) {
      try {
        const seasonDir = `Season ${season.toString().padStart(2, '0')}`;
        const localSeasonPath = path.join(localShowPath, seasonDir);

        // Convert Plex paths to NFS paths and sync
        for (const episode of seasonEpisodes) {
          if (episode.path) {
            const nfsEpisodePath = this.convertPlexPathToNFS(episode.path);
            const localEpisodePath = path.join(localSeasonPath, path.basename(nfsEpisodePath));

            // Check if episode already exists
            if (await this.fileExists(localEpisodePath)) {
              syncedEpisodes++;
              continue;
            }

            // Sync individual episode file
            const success = await this.syncEpisodeFile(nfsEpisodePath, localEpisodePath);
            if (success) {
              syncedEpisodes++;
            }
          }
        }
      } catch (error) {
        this.logError(`Failed to sync season ${season} of ${show.title}`, error);
      }
    }

    this.logProgress(`Synced ${syncedEpisodes}/${episodes.length} episodes for ${show.title}`);
    return syncedEpisodes > 0;
  }

  private groupEpisodesBySeason(
    episodes: PlexTVShow['episodes']
  ): Map<number, PlexTVShow['episodes']> {
    const grouped = new Map<number, PlexTVShow['episodes']>();

    for (const episode of episodes) {
      const season = episode.season || 0;
      if (!grouped.has(season)) {
        grouped.set(season, []);
      }
      grouped.get(season)!.push(episode);
    }

    return grouped;
  }

  private async syncEpisodeFile(nfsPath: string, localPath: string): Promise<boolean> {
    try {
      await this.ensureDirectory(path.dirname(localPath));

      // Use rsync for individual file with progress
      return await this.rsyncDirectory(nfsPath, localPath, {
        exclude: this.getTVExcludePatterns(),
      });
    } catch (error) {
      this.logError(`Failed to sync episode file ${nfsPath}`, error);
      return false;
    }
  }

  private convertPlexPathToNFS(plexPath: string): string {
    // This would need to be customized based on your Plex/NFS path mapping
    return plexPath.replace('/mnt/data/polaris/', this.config.nfs_path + '/');
  }

  private sanitizeShowName(showName: string): string {
    // Remove invalid filesystem characters
    return showName
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private getTVExcludePatterns(): string[] {
    return [
      ...super.getExcludePatterns(),
      '*.mkv.bak',
      '*.mp4.bak',
      '*.avi.bak',
      'extras/',
      'behind the scenes/',
      'deleted scenes/',
      'featurettes/',
      'season.nfo',
      'tvshow.nfo',
    ];
  }
}
