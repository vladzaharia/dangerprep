import { readFileSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Base network interface information
 */
export interface BaseNetworkInterface {
  name: string;
  type: 'ethernet' | 'wifi' | 'tailscale' | 'hotspot' | 'loopback' | 'unknown';
  state: 'up' | 'down' | 'unknown';
  ipAddress?: string | undefined;
  gateway?: string | undefined;
  netmask?: string | undefined;
  dnsServers?: string[] | undefined;
  macAddress?: string | undefined;
  mtu?: number | undefined;
}

/**
 * Ethernet interface information
 */
export interface EthernetInterface extends BaseNetworkInterface {
  type: 'ethernet';
  speed?: string; // e.g., "1000Mbps", "2500Mbps"
  duplex?: 'full' | 'half' | 'unknown';
  driver?: string;
  linkDetected?: boolean;
}

/**
 * WiFi interface information
 */
export interface WiFiInterface extends BaseNetworkInterface {
  type: 'wifi';
  ssid?: string | undefined;
  signalStrength?: number | undefined; // dBm
  frequency?: string | undefined; // e.g., "2.4GHz", "5GHz"
  channel?: number | undefined;
  security?: string | undefined; // e.g., "WPA2", "WPA3"
  mode?: 'managed' | 'ap' | 'monitor' | 'unknown' | undefined;
  connectedClients?: number | undefined; // For AP mode
}

/**
 * Tailscale interface information
 */
export interface TailscaleInterface extends BaseNetworkInterface {
  type: 'tailscale';
  status: 'connected' | 'disconnected' | 'starting' | 'stopped';
  tailnetName?: string;
  nodeKey?: string;
  peers?: TailscalePeer[];
  exitNode?: boolean;
  routeAdvertising?: string[];
}

/**
 * Tailscale peer information
 */
export interface TailscalePeer {
  hostname: string;
  ipAddress: string;
  online: boolean;
  lastSeen?: string;
  os?: string;
  exitNode?: boolean;
}

/**
 * Hotspot interface information
 */
export interface HotspotInterface extends BaseNetworkInterface {
  type: 'hotspot';
  ssid: string;
  password: string;
  wpaType?: 'WPA2' | 'WPA3' | 'WPA2/WPA3';
  channel?: number;
  frequency?: string;
  connectedClients?: number;
  maxClients?: number;
  hidden?: boolean;
}

/**
 * Network interface union type
 */
export type NetworkInterface = EthernetInterface | WiFiInterface | TailscaleInterface | HotspotInterface | BaseNetworkInterface;

/**
 * Network summary for listing interfaces
 */
export interface NetworkSummary {
  interfaces: NetworkInterface[];
  internetInterface?: string | undefined;
  hotspotInterface?: string | undefined;
  tailscaleInterface?: string | undefined;
  totalInterfaces: number;
}

/**
 * Service for managing network interfaces and information
 */
export class NetworkService {
  private readonly hostapdPath = '/etc/hostapd/hostapd.conf';
  private readonly interfaceCache = new Map<string, NetworkInterface>();
  private readonly cacheTimeout = 30000; // 30 seconds
  private lastCacheUpdate = 0;

  /**
   * Get all network interfaces
   */
  async getAllInterfaces(): Promise<NetworkInterface[]> {
    console.log('[NetworkService] getAllInterfaces called');
    await this.refreshCacheIfNeeded();
    const interfaces = Array.from(this.interfaceCache.values());
    console.log(`[NetworkService] Returning ${interfaces.length} interfaces:`, interfaces.map(i => ({ name: i.name, type: i.type, state: i.state })));
    return interfaces;
  }

  /**
   * Get network summary with all interfaces and special interface mappings
   */
  async getNetworkSummary(): Promise<NetworkSummary> {
    console.log('[NetworkService] getNetworkSummary called');
    const interfaces = await this.getAllInterfaces();

    console.log('[NetworkService] Finding special interfaces...');
    // Find special interfaces
    const internetInterface = await this.findInternetInterface(interfaces);
    const hotspotInterface = this.findHotspotInterface(interfaces);
    const tailscaleInterface = this.findTailscaleInterface(interfaces);

    console.log('[NetworkService] Special interfaces found:', {
      internet: internetInterface?.name || 'none',
      hotspot: hotspotInterface?.name || 'none',
      tailscale: tailscaleInterface?.name || 'none'
    });

    const summary = {
      interfaces,
      internetInterface: internetInterface?.name,
      hotspotInterface: hotspotInterface?.name,
      tailscaleInterface: tailscaleInterface?.name,
      totalInterfaces: interfaces.length,
    };

    console.log('[NetworkService] Network summary created:', {
      totalInterfaces: summary.totalInterfaces,
      internetInterface: summary.internetInterface,
      hotspotInterface: summary.hotspotInterface,
      tailscaleInterface: summary.tailscaleInterface
    });

    return summary;
  }

  /**
   * Get specific interface by name
   */
  async getInterface(name: string): Promise<NetworkInterface | undefined> {
    console.log(`[NetworkService] getInterface called for: ${name}`);
    await this.refreshCacheIfNeeded();
    const interface_ = this.interfaceCache.get(name);
    console.log(`[NetworkService] Interface '${name}' ${interface_ ? 'found' : 'not found'}${interface_ ? `: ${interface_.type}, ${interface_.state}` : ''}`);
    return interface_;
  }

  /**
   * Get interface by keyword (hotspot, internet, tailscale)
   */
  async getInterfaceByKeyword(keyword: 'hotspot' | 'internet' | 'tailscale'): Promise<NetworkInterface | undefined> {
    console.log(`[NetworkService] getInterfaceByKeyword called for: ${keyword}`);
    const interfaces = await this.getAllInterfaces();

    let result: NetworkInterface | undefined;
    switch (keyword) {
      case 'hotspot':
        result = this.findHotspotInterface(interfaces);
        break;
      case 'internet':
        result = await this.findInternetInterface(interfaces);
        break;
      case 'tailscale':
        result = this.findTailscaleInterface(interfaces);
        break;
      default:
        result = undefined;
    }

    console.log(`[NetworkService] Keyword '${keyword}' ${result ? 'found' : 'not found'}${result ? `: ${result.name} (${result.type}, ${result.state})` : ''}`);
    return result;
  }

  /**
   * Refresh interface cache if needed
   */
  private async refreshCacheIfNeeded(): Promise<void> {
    const now = Date.now();
    const cacheAge = now - this.lastCacheUpdate;
    const isStale = cacheAge > this.cacheTimeout;

    console.log(`[NetworkService] Cache check: age=${cacheAge}ms, stale=${isStale}, timeout=${this.cacheTimeout}ms`);

    if (isStale) {
      console.log('[NetworkService] Cache is stale, refreshing...');
      await this.refreshInterfaceCache();
      this.lastCacheUpdate = now;
      console.log('[NetworkService] Cache refreshed');
    } else {
      console.log('[NetworkService] Using cached interface data');
    }
  }

  /**
   * Refresh the interface cache by detecting all interfaces
   */
  private async refreshInterfaceCache(): Promise<void> {
    console.log('[NetworkService] Starting interface cache refresh');
    this.interfaceCache.clear();

    try {
      console.log('[NetworkService] Executing "ip link show" to get interface list');
      // Get all network interfaces
      const { stdout } = await execAsync('ip link show');
      const interfaceNames = this.parseInterfaceNames(stdout);
      console.log(`[NetworkService] Found ${interfaceNames.length} interfaces:`, interfaceNames);

      // Get detailed information for each interface
      for (const name of interfaceNames) {
        console.log(`[NetworkService] Getting details for interface: ${name}`);
        try {
          const interfaceInfo = await this.getInterfaceDetails(name);
          if (interfaceInfo) {
            this.interfaceCache.set(name, interfaceInfo);
            console.log(`[NetworkService] Cached interface ${name}: ${interfaceInfo.type}, ${interfaceInfo.state}`);
          } else {
            console.log(`[NetworkService] No details returned for interface: ${name}`);
          }
        } catch (error) {
          console.warn(`[NetworkService] Failed to get details for interface ${name}:`, error);
        }
      }

      console.log(`[NetworkService] Interface cache refresh complete. Cached ${this.interfaceCache.size} interfaces`);
    } catch (error) {
      console.error('[NetworkService] Failed to refresh interface cache:', error);
    }
  }

  /**
   * Parse interface names from ip link output
   */
  private parseInterfaceNames(ipLinkOutput: string): string[] {
    const lines = ipLinkOutput.split('\n');
    const interfaces: string[] = [];
    
    for (const line of lines) {
      const match = line.match(/^\d+:\s+([^:@]+)[@:]?/);
      if (match && match[1] && match[1] !== 'lo') { // Skip loopback
        interfaces.push(match[1]);
      }
    }
    
    return interfaces;
  }

  /**
   * Get detailed information for a specific interface
   */
  private async getInterfaceDetails(name: string): Promise<NetworkInterface | undefined> {
    try {
      const baseInfo = await this.getBaseInterfaceInfo(name);
      const type = this.determineInterfaceType(name, baseInfo);
      
      switch (type) {
        case 'ethernet':
          return await this.getEthernetInterfaceInfo(name, baseInfo);
        case 'wifi':
          return await this.getWiFiInterfaceInfo(name, baseInfo);
        case 'tailscale':
          return await this.getTailscaleInterfaceInfo(name, baseInfo);
        case 'hotspot':
          return await this.getHotspotInterfaceInfo(name, baseInfo);
        default:
          return { ...baseInfo, type };
      }
    } catch (error) {
      console.warn(`Failed to get interface details for ${name}:`, error);
      return undefined;
    }
  }

  /**
   * Get base interface information (IP, state, etc.)
   */
  private async getBaseInterfaceInfo(name: string): Promise<Omit<BaseNetworkInterface, 'type'>> {
    const [ipInfo, macInfo, mtuInfo] = await Promise.allSettled([
      this.getInterfaceIpInfo(name),
      this.getInterfaceMacAddress(name),
      this.getInterfaceMtu(name),
    ]);

    const state = await this.getInterfaceState(name);
    
    return {
      name,
      state,
      ...(ipInfo.status === 'fulfilled' && ipInfo.value),
      ...(macInfo.status === 'fulfilled' && { macAddress: macInfo.value }),
      ...(mtuInfo.status === 'fulfilled' && { mtu: mtuInfo.value }),
    };
  }

  /**
   * Determine interface type based on name and characteristics
   */
  private determineInterfaceType(name: string, _baseInfo: Omit<BaseNetworkInterface, 'type'>): BaseNetworkInterface['type'] {
    if (name.startsWith('tailscale') || name.startsWith('ts-')) {
      return 'tailscale';
    }
    
    if (name.startsWith('wl') || name.startsWith('wlan')) {
      // Check if it's in AP mode (hotspot)
      return this.isHotspotInterface(name) ? 'hotspot' : 'wifi';
    }
    
    if (name.startsWith('eth') || name.startsWith('en')) {
      return 'ethernet';
    }
    
    if (name === 'lo') {
      return 'loopback';
    }
    
    return 'unknown';
  }

  /**
   * Check if a WiFi interface is configured as a hotspot
   */
  private isHotspotInterface(name: string): boolean {
    try {
      // Check if interface is mentioned in hostapd config
      const hostapdConfig = readFileSync(this.hostapdPath, 'utf-8');
      return hostapdConfig.includes(`interface=${name}`);
    } catch {
      return false;
    }
  }

  /**
   * Get interface state (up/down)
   */
  private async getInterfaceState(name: string): Promise<'up' | 'down' | 'unknown'> {
    try {
      const { stdout } = await execAsync(`ip link show ${name}`);
      if (stdout.includes('state UP')) return 'up';
      if (stdout.includes('state DOWN')) return 'down';
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get IP information for an interface
   */
  private async getInterfaceIpInfo(name: string): Promise<Partial<Pick<BaseNetworkInterface, 'ipAddress' | 'netmask' | 'gateway' | 'dnsServers'>>> {
    try {
      const [ipResult, gatewayResult, dnsResult] = await Promise.allSettled([
        execAsync(`ip addr show ${name}`),
        execAsync(`ip route show dev ${name} | grep default`),
        execAsync(`resolvectl status ${name} 2>/dev/null || systemd-resolve --status ${name} 2>/dev/null || cat /etc/resolv.conf`),
      ]);

      const result: Partial<Pick<BaseNetworkInterface, 'ipAddress' | 'netmask' | 'gateway' | 'dnsServers'>> = {};

      // Parse IP address and netmask
      if (ipResult.status === 'fulfilled') {
        const ipMatch = ipResult.value.stdout.match(/inet (\d+\.\d+\.\d+\.\d+)\/(\d+)/);
        if (ipMatch && ipMatch[1] && ipMatch[2]) {
          result.ipAddress = ipMatch[1];
          result.netmask = this.cidrToNetmask(parseInt(ipMatch[2]));
        }
      }

      // Parse gateway
      if (gatewayResult.status === 'fulfilled') {
        const gatewayMatch = gatewayResult.value.stdout.match(/default via (\d+\.\d+\.\d+\.\d+)/);
        if (gatewayMatch) {
          result.gateway = gatewayMatch[1];
        }
      }

      // Parse DNS servers
      if (dnsResult.status === 'fulfilled') {
        const dnsServers = this.parseDnsServers(dnsResult.value.stdout);
        if (dnsServers.length > 0) {
          result.dnsServers = dnsServers;
        }
      }

      return result;
    } catch (error) {
      console.warn(`Failed to get IP info for ${name}:`, error);
      return {};
    }
  }

  /**
   * Get MAC address for an interface
   */
  private async getInterfaceMacAddress(name: string): Promise<string | undefined> {
    try {
      const { stdout } = await execAsync(`ip link show ${name}`);
      const macMatch = stdout.match(/link\/ether ([a-f0-9:]{17})/);
      return macMatch ? macMatch[1] : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Get MTU for an interface
   */
  private async getInterfaceMtu(name: string): Promise<number | undefined> {
    try {
      const { stdout } = await execAsync(`ip link show ${name}`);
      const mtuMatch = stdout.match(/mtu (\d+)/);
      return mtuMatch && mtuMatch[1] ? parseInt(mtuMatch[1]) : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Get ethernet-specific information
   */
  private async getEthernetInterfaceInfo(name: string, baseInfo: Omit<BaseNetworkInterface, 'type'>): Promise<EthernetInterface> {
    const [speedResult, duplexResult, driverResult, linkResult] = await Promise.allSettled([
      execAsync(`ethtool ${name} 2>/dev/null | grep Speed`),
      execAsync(`ethtool ${name} 2>/dev/null | grep Duplex`),
      execAsync(`readlink /sys/class/net/${name}/device/driver 2>/dev/null`),
      execAsync(`ethtool ${name} 2>/dev/null | grep "Link detected"`),
    ]);

    const ethernetInfo: EthernetInterface = {
      ...baseInfo,
      type: 'ethernet',
    };

    // Parse speed
    if (speedResult.status === 'fulfilled') {
      const speedMatch = speedResult.value.stdout.match(/Speed: (\d+)Mb\/s/);
      if (speedMatch) {
        ethernetInfo.speed = `${speedMatch[1]}Mbps`;
      }
    }

    // Parse duplex
    if (duplexResult.status === 'fulfilled') {
      const duplexMatch = duplexResult.value.stdout.match(/Duplex: (Full|Half)/i);
      if (duplexMatch && duplexMatch[1]) {
        ethernetInfo.duplex = duplexMatch[1].toLowerCase() as 'full' | 'half';
      }
    }

    // Parse driver
    if (driverResult.status === 'fulfilled') {
      const driverPath = driverResult.value.stdout.trim();
      ethernetInfo.driver = driverPath.split('/').pop() || 'unknown';
    }

    // Parse link detection
    if (linkResult.status === 'fulfilled') {
      ethernetInfo.linkDetected = linkResult.value.stdout.includes('yes');
    }

    return ethernetInfo;
  }

  /**
   * Get WiFi-specific information
   */
  private async getWiFiInterfaceInfo(name: string, baseInfo: Omit<BaseNetworkInterface, 'type'>): Promise<WiFiInterface> {
    const [iwConfigResult, iwInfoResult, clientsResult] = await Promise.allSettled([
      execAsync(`iwconfig ${name} 2>/dev/null`),
      execAsync(`iw dev ${name} info 2>/dev/null`),
      execAsync(`iw dev ${name} station dump 2>/dev/null | grep Station | wc -l`),
    ]);

    const wifiInfo: WiFiInterface = {
      ...baseInfo,
      type: 'wifi',
    };

    // Parse iwconfig output
    if (iwConfigResult.status === 'fulfilled') {
      const iwconfig = iwConfigResult.value.stdout;

      // SSID
      const ssidMatch = iwconfig.match(/ESSID:"([^"]+)"/);
      if (ssidMatch) {
        wifiInfo.ssid = ssidMatch[1];
      }

      // Signal strength
      const signalMatch = iwconfig.match(/Signal level=(-?\d+) dBm/);
      if (signalMatch && signalMatch[1]) {
        wifiInfo.signalStrength = parseInt(signalMatch[1]);
      }

      // Frequency
      const freqMatch = iwconfig.match(/Frequency:(\d+\.\d+) GHz/);
      if (freqMatch && freqMatch[1]) {
        const freq = parseFloat(freqMatch[1]);
        wifiInfo.frequency = freq < 3 ? '2.4GHz' : '5GHz';
      }
    }

    // Parse iw info output
    if (iwInfoResult.status === 'fulfilled') {
      const iwinfo = iwInfoResult.value.stdout;

      // Interface type/mode
      const typeMatch = iwinfo.match(/type (\w+)/);
      if (typeMatch && typeMatch[1]) {
        const mode = typeMatch[1];
        if (['managed', 'ap', 'monitor', 'unknown'].includes(mode)) {
          wifiInfo.mode = mode as WiFiInterface['mode'];
        }
      }

      // Channel
      const channelMatch = iwinfo.match(/channel (\d+)/);
      if (channelMatch && channelMatch[1]) {
        wifiInfo.channel = parseInt(channelMatch[1]);
      }
    }

    // Connected clients (for AP mode)
    if (clientsResult.status === 'fulfilled') {
      const clientCount = parseInt(clientsResult.value.stdout.trim());
      if (!isNaN(clientCount)) {
        wifiInfo.connectedClients = clientCount;
      }
    }

    return wifiInfo;
  }

  /**
   * Get Tailscale-specific information
   */
  private async getTailscaleInterfaceInfo(_name: string, baseInfo: Omit<BaseNetworkInterface, 'type'>): Promise<TailscaleInterface> {
    const [statusResult] = await Promise.allSettled([
      execAsync('tailscale status --json 2>/dev/null'),
    ]);

    const tailscaleInfo: TailscaleInterface = {
      ...baseInfo,
      type: 'tailscale',
      status: 'disconnected',
    };

    // Parse status
    if (statusResult.status === 'fulfilled') {
      try {
        const status = JSON.parse(statusResult.value.stdout);
        tailscaleInfo.status = status.BackendState === 'Running' ? 'connected' : 'disconnected';
        tailscaleInfo.tailnetName = status.CurrentTailnet?.Name;
        tailscaleInfo.exitNode = status.ExitNodeStatus?.Online || false;

        // Parse peers
        if (status.Peer) {
          tailscaleInfo.peers = Object.values(status.Peer).map((peer: any) => ({
            hostname: peer.HostName,
            ipAddress: peer.TailscaleIPs?.[0] || '',
            online: peer.Online,
            lastSeen: peer.LastSeen,
            os: peer.OS,
            exitNode: peer.ExitNode || false,
          }));
        }
      } catch (error) {
        console.warn('Failed to parse Tailscale status JSON:', error);
      }
    }

    return tailscaleInfo;
  }

  /**
   * Get hotspot-specific information
   */
  private async getHotspotInterfaceInfo(name: string, baseInfo: Omit<BaseNetworkInterface, 'type'>): Promise<HotspotInterface> {
    const hostapdConfig = this.readHostapdConfig();
    const [clientsResult, channelResult] = await Promise.allSettled([
      execAsync(`iw dev ${name} station dump 2>/dev/null | grep Station | wc -l`),
      execAsync(`iw dev ${name} info 2>/dev/null | grep channel`),
    ]);

    const hotspotInfo: HotspotInterface = {
      ...baseInfo,
      type: 'hotspot',
      ssid: hostapdConfig.ssid || 'DangerPrep',
      password: hostapdConfig.password || 'change_me',
    };

    // Parse hostapd configuration
    if (hostapdConfig.wpa) {
      hotspotInfo.wpaType = hostapdConfig.wpa === '3' ? 'WPA3' : 'WPA2';
    }
    if (hostapdConfig.channel) {
      hotspotInfo.channel = parseInt(hostapdConfig.channel);
    }
    if (hostapdConfig.max_num_sta) {
      hotspotInfo.maxClients = parseInt(hostapdConfig.max_num_sta);
    }
    if (hostapdConfig.ignore_broadcast_ssid) {
      hotspotInfo.hidden = hostapdConfig.ignore_broadcast_ssid === '1';
    }

    // Connected clients
    if (clientsResult.status === 'fulfilled') {
      const clientCount = parseInt(clientsResult.value.stdout.trim());
      if (!isNaN(clientCount)) {
        hotspotInfo.connectedClients = clientCount;
      }
    }

    // Channel and frequency
    if (channelResult.status === 'fulfilled') {
      const channelMatch = channelResult.value.stdout.match(/channel (\d+)/);
      if (channelMatch && channelMatch[1]) {
        const channel = parseInt(channelMatch[1]);
        hotspotInfo.channel = channel;
        hotspotInfo.frequency = channel <= 14 ? '2.4GHz' : '5GHz';
      }
    }

    return hotspotInfo;
  }

  /**
   * Read hostapd configuration
   */
  private readHostapdConfig(): Record<string, string> {
    try {
      const content = readFileSync(this.hostapdPath, 'utf-8');
      const config: Record<string, string> = {};

      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key && valueParts.length > 0) {
            config[key.trim()] = valueParts.join('=').trim();
          }
        }
      }

      return config;
    } catch {
      return {};
    }
  }

  /**
   * Find the interface with internet connectivity
   */
  private async findInternetInterface(interfaces: NetworkInterface[]): Promise<NetworkInterface | undefined> {
    for (const iface of interfaces) {
      if (iface.state === 'up' && iface.ipAddress && iface.gateway) {
        // Test internet connectivity
        try {
          await execAsync(`ping -c 1 -W 5 -I ${iface.name} 8.8.8.8 >/dev/null 2>&1`);
          return iface;
        } catch {
          // Continue to next interface
        }
      }
    }
    return undefined;
  }

  /**
   * Find the hotspot interface
   */
  private findHotspotInterface(interfaces: NetworkInterface[]): NetworkInterface | undefined {
    return interfaces.find(iface => iface.type === 'hotspot');
  }

  /**
   * Find the Tailscale interface
   */
  private findTailscaleInterface(interfaces: NetworkInterface[]): NetworkInterface | undefined {
    return interfaces.find(iface => iface.type === 'tailscale');
  }

  /**
   * Convert CIDR to netmask
   */
  private cidrToNetmask(cidr: number): string {
    const mask = (0xffffffff << (32 - cidr)) >>> 0;
    return [
      (mask >>> 24) & 0xff,
      (mask >>> 16) & 0xff,
      (mask >>> 8) & 0xff,
      mask & 0xff,
    ].join('.');
  }

  /**
   * Parse DNS servers from various command outputs
   */
  private parseDnsServers(output: string): string[] {
    const dnsServers: string[] = [];

    // Try to parse from systemd-resolve output
    const systemdMatch = output.match(/DNS Servers:\s*([\d\.\s]+)/);
    if (systemdMatch && systemdMatch[1]) {
      const servers = systemdMatch[1].trim().split(/\s+/);
      dnsServers.push(...servers.filter(ip => /^\d+\.\d+\.\d+\.\d+$/.test(ip)));
    }

    // Fallback to /etc/resolv.conf format
    if (dnsServers.length === 0) {
      const nameserverMatches = output.match(/nameserver\s+(\d+\.\d+\.\d+\.\d+)/g);
      if (nameserverMatches) {
        for (const match of nameserverMatches) {
          const ip = match.replace('nameserver', '').trim();
          if (!dnsServers.includes(ip)) {
            dnsServers.push(ip);
          }
        }
      }
    }

    return dnsServers;
  }

  /**
   * Clear the interface cache (useful for testing or manual refresh)
   */
  clearCache(): void {
    console.log('[NetworkService] Clearing interface cache');
    const previousSize = this.interfaceCache.size;
    this.interfaceCache.clear();
    this.lastCacheUpdate = 0;
    console.log(`[NetworkService] Cache cleared. Previous size: ${previousSize}, new size: ${this.interfaceCache.size}`);
  }
}
