import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';

import {
  PlexMovie,
  PlexTVShow,
  PlexEpisode,
  PlexVideoXML,
  PlexEpisodeXML,
  PlexGenreXML,
  PlexMediaXML,
} from '../types';
import { Logger } from '../utils/logger';

export class PlexClient {
  private parser: XMLParser;

  constructor(
    private server: string,
    private token: string,
    private logger: Logger
  ) {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });
  }

  async getMovies(): Promise<PlexMovie[]> {
    try {
      this.logger.debug('Fetching movies from Plex server');

      const response = await axios.get(`http://${this.server}/library/sections/1/all`, {
        params: {
          'X-Plex-Token': this.token,
          type: 1, // Movies
        },
        timeout: 30000,
      });

      const parsed = this.parser.parse(response.data);
      const container = parsed.MediaContainer;

      if (!container?.Video) {
        this.logger.warn('No movies found in Plex response');
        return [];
      }

      const videos = Array.isArray(container.Video) ? container.Video : [container.Video];

      const movies: PlexMovie[] = videos.map((video: PlexVideoXML) => ({
        title: video['@_title'],
        year: parseInt(video['@_year'] || '0') || 0,
        rating: parseFloat(video['@_rating'] || '0') || 0,
        genres: this.parseGenres(video.Genre),
        resolution: this.getResolution(video.Media),
        size: this.getTotalSize(video.Media),
        path: this.getFilePath(video.Media),
      }));

      this.logger.info(`Retrieved ${movies.length} movies from Plex`);
      return movies;
    } catch (error) {
      this.logger.error(`Failed to fetch movies from Plex: ${error}`);
      return [];
    }
  }

  async getTVShows(): Promise<PlexTVShow[]> {
    try {
      this.logger.debug('Fetching TV shows from Plex server');

      const response = await axios.get(`http://${this.server}/library/sections/2/all`, {
        params: {
          'X-Plex-Token': this.token,
          type: 2, // TV Shows
        },
        timeout: 30000,
      });

      const parsed = this.parser.parse(response.data);
      const container = parsed.MediaContainer;

      if (!container?.Directory) {
        this.logger.warn('No TV shows found in Plex response');
        return [];
      }

      const directories = Array.isArray(container.Directory)
        ? container.Directory
        : [container.Directory];

      const shows: PlexTVShow[] = [];

      for (const dir of directories) {
        const episodes = await this.getEpisodesForShow(dir['@_ratingKey']);

        shows.push({
          title: dir['@_title'],
          year: parseInt(dir['@_year']) || 0,
          rating: parseFloat(dir['@_rating']) || 0,
          genres: this.parseGenres(dir.Genre),
          episodes,
          path: dir['@_key'],
        });
      }

      this.logger.info(`Retrieved ${shows.length} TV shows from Plex`);
      return shows;
    } catch (error) {
      this.logger.error(`Failed to fetch TV shows from Plex: ${error}`);
      return [];
    }
  }

  private async getEpisodesForShow(showKey: string): Promise<PlexEpisode[]> {
    try {
      const response = await axios.get(
        `http://${this.server}/library/metadata/${showKey}/allLeaves`,
        {
          params: {
            'X-Plex-Token': this.token,
          },
          timeout: 30000,
        }
      );

      const parsed = this.parser.parse(response.data);
      const container = parsed.MediaContainer;

      if (!container?.Video) {
        return [];
      }

      const videos = Array.isArray(container.Video) ? container.Video : [container.Video];

      return videos.map((video: PlexEpisodeXML) => ({
        title: video['@_title'],
        season: parseInt(video['@_parentIndex'] || '0') || 0,
        episode: parseInt(video['@_index'] || '0') || 0,
        size: this.getTotalSize(video.Media),
        path: this.getFilePath(video.Media),
      }));
    } catch (error) {
      this.logger.error(`Failed to fetch episodes for show ${showKey}: ${error}`);
      return [];
    }
  }

  private parseGenres(genreData: PlexGenreXML | PlexGenreXML[] | undefined): string[] {
    if (!genreData) return [];

    const genres = Array.isArray(genreData) ? genreData : [genreData];
    return genres.map((genre: PlexGenreXML) => genre['@_tag']).filter(Boolean);
  }

  private getResolution(mediaData: PlexMediaXML | PlexMediaXML[] | undefined): string {
    if (!mediaData) return 'unknown';

    const media = Array.isArray(mediaData) ? mediaData[0] : mediaData;
    if (!media) return 'unknown';
    const height = parseInt(media['@_height'] || '0') || 0;

    if (height >= 2160) return '4K';
    if (height >= 1080) return '1080p';
    if (height >= 720) return '720p';
    if (height >= 480) return '480p';

    return 'SD';
  }

  private getTotalSize(mediaData: PlexMediaXML | PlexMediaXML[] | undefined): number {
    if (!mediaData) return 0;

    const media = Array.isArray(mediaData) ? mediaData : [mediaData];
    let totalSize = 0;

    for (const item of media) {
      if (item.Part) {
        const parts = Array.isArray(item.Part) ? item.Part : [item.Part];
        for (const part of parts) {
          totalSize += parseInt(part['@_size'] || '0') || 0;
        }
      }
    }

    return totalSize;
  }

  private getFilePath(mediaData: PlexMediaXML | PlexMediaXML[] | undefined): string {
    if (!mediaData) return '';

    const media = Array.isArray(mediaData) ? mediaData[0] : mediaData;
    if (media?.Part) {
      const part = Array.isArray(media.Part) ? media.Part[0] : media.Part;
      return part?.['@_file'] || '';
    }

    return '';
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await axios.get(`http://${this.server}/`, {
        params: {
          'X-Plex-Token': this.token,
        },
        timeout: 10000,
      });

      return response.status === 200;
    } catch (error) {
      this.logger.error(`Plex connection test failed: ${error}`);
      return false;
    }
  }
}
