import { LoggerFactory, LogLevel } from '@dangerprep/logging';

/**
 * ISP information from public IP lookup services
 */
export interface ISPInfo {
  ispName?: string;
  publicIpv4?: string;
  publicIpv6?: string;
  country?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  isp?: string;
  organization?: string;
  asn?: string;
}

/**
 * Service for fetching ISP and public IP information
 * Uses multiple free APIs with fallbacks for reliability
 */
export class ISPService {
  private readonly cacheTimeout = 300000; // 5 minutes
  private lastFetchTime = 0;
  private cachedInfo: ISPInfo | null = null;
  private logger = LoggerFactory.createStructuredLogger(
    'ISPService',
    '/var/log/dangerprep/portal.log',
    process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO
  );

  /**
   * Get ISP information with caching
   */
  async getISPInfo(): Promise<ISPInfo> {
    // Return cached data if still valid
    if (this.cachedInfo && Date.now() - this.lastFetchTime < this.cacheTimeout) {
      this.logger.debug('Returning cached ISP info');
      return this.cachedInfo;
    }

    this.logger.debug('Fetching fresh ISP information');
    const info = await this.fetchISPInfo();
    this.cachedInfo = info;
    this.lastFetchTime = Date.now();
    return info;
  }

  /**
   * Fetch ISP information from available APIs
   */
  private async fetchISPInfo(): Promise<ISPInfo> {
    const results = await Promise.allSettled([
      this.fetchFromIPify(),
      this.fetchFromIP2Location(),
      this.fetchFromIPAPI(),
    ]);

    // Merge results from all sources, preferring the first successful one
    const info: ISPInfo = {};

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        Object.assign(info, result.value);
      }
    }

    this.logger.debug('Fetched ISP info', { info });
    return info;
  }

  /**
   * Fetch from ipify.org (free tier)
   */
  private async fetchFromIPify(): Promise<Partial<ISPInfo>> {
    try {
      this.logger.debug('Fetching from ipify.org');
      const [ipv4Response, ipv6Response] = await Promise.allSettled([
        fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(5000) }),
        fetch('https://api6.ipify.org?format=json', { signal: AbortSignal.timeout(5000) }),
      ]);

      const info: Partial<ISPInfo> = {};

      if (ipv4Response.status === 'fulfilled' && ipv4Response.value.ok) {
        const data = (await ipv4Response.value.json()) as { ip?: string };
        if (data.ip) info.publicIpv4 = data.ip;
      }

      if (ipv6Response.status === 'fulfilled' && ipv6Response.value.ok) {
        const data = (await ipv6Response.value.json()) as { ip?: string };
        if (data.ip) info.publicIpv6 = data.ip;
      }

      return info;
    } catch (error) {
      this.logger.warn('Failed to fetch from ipify.org', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }

  /**
   * Fetch from ip-api.com (free tier, limited requests)
   */
  private async fetchFromIPAPI(): Promise<Partial<ISPInfo>> {
    try {
      this.logger.debug('Fetching from ip-api.com');
      const response = await fetch(
        'http://ip-api.com/json/?fields=query,isp,org,country,regionName,city,lat,lon,timezone,as',
        {
          signal: AbortSignal.timeout(5000),
        }
      );

      if (!response.ok) return {};

      const data = (await response.json()) as Record<string, unknown>;

      const result: ISPInfo = {};
      if (data.query) result.publicIpv4 = data.query as string;
      if (data.isp) result.ispName = data.isp as string;
      if (data.org) result.organization = data.org as string;
      if (data.country) result.country = data.country as string;
      if (data.regionName) result.region = data.regionName as string;
      if (data.city) result.city = data.city as string;
      if (data.lat) result.latitude = data.lat as number;
      if (data.lon) result.longitude = data.lon as number;
      if (data.timezone) result.timezone = data.timezone as string;
      if (data.as) result.asn = data.as as string;
      return result;
    } catch (error) {
      this.logger.warn('Failed to fetch from ip-api.com', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }

  /**
   * Fetch from ip2location.io (free tier)
   */
  private async fetchFromIP2Location(): Promise<Partial<ISPInfo>> {
    try {
      this.logger.debug('Fetching from ip2location.io');
      const response = await fetch('https://ipwho.is/', {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) return {};

      const data = (await response.json()) as Record<string, unknown>;

      const result: ISPInfo = {};
      if (data.ip) result.publicIpv4 = data.ip as string;
      if (data.country) result.country = data.country as string;
      if (data.region) result.region = data.region as string;
      if (data.city) result.city = data.city as string;
      if (data.latitude) result.latitude = data.latitude as number;
      if (data.longitude) result.longitude = data.longitude as number;
      if (data.timezone) result.timezone = data.timezone as string;
      return result;
    } catch (error) {
      this.logger.warn('Failed to fetch from ip2location.io', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }

  /**
   * Clear cache to force refresh on next request
   */
  clearCache(): void {
    this.logger.debug('Clearing ISP info cache');
    this.cachedInfo = null;
    this.lastFetchTime = 0;
  }
}
