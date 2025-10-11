import { readFileSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Base network interface information
 */
export interface BaseNetworkInterface {
  name: string;
  type: 'ethernet' | 'wifi' | 'tailscale' | 'bridge' | 'virtual' | 'loopback' | 'unknown';
  purpose: 'wan' | 'lan' | 'wlan' | 'docker' | 'loopback' | 'unknown';
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
 * Bridge interface information (Docker bridges, etc.)
 */
export interface BridgeInterface extends BaseNetworkInterface {
  type: 'bridge';
  bridgeId?: string;
  stp?: boolean; // Spanning Tree Protocol
  interfaces?: string[]; // Interfaces connected to this bridge
}

/**
 * Virtual interface information (Docker veth pairs, etc.)
 */
export interface VirtualInterface extends BaseNetworkInterface {
  type: 'virtual';
  peerInterface?: string; // For veth pairs
  containerId?: string; // For Docker containers
}

/**
 * Network interface union type
 */
export type NetworkInterface = EthernetInterface | WiFiInterface | TailscaleInterface | BridgeInterface | VirtualInterface | BaseNetworkInterface;

/**
 * Network summary for listing interfaces
 */
export interface NetworkSummary {
  interfaces: NetworkInterface[];
  internetInterface?: string | undefined;
  hotspotInterface?: string | undefined;
  tailscaleInterface?: string | undefined;
  lanInterfaces?: string[] | undefined;
  dockerInterfaces?: string[] | undefined;
  totalInterfaces: number;
  interfacesByPurpose: {
    wan: string[];
    lan: string[];
    wlan: string[];
    docker: string[];
    loopback: string[];
    unknown: string[];
  };
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

    // Find additional interface categories
    const lanInterfaces = this.findLanInterfaces(interfaces);
    const dockerInterfaces = this.findDockerInterfaces(interfaces);

    console.log('[NetworkService] Special interfaces found:', {
      internet: internetInterface?.name || 'none',
      hotspot: hotspotInterface?.name || 'none',
      tailscale: tailscaleInterface?.name || 'none',
      lan: lanInterfaces.map(i => i.name),
      docker: dockerInterfaces.map(i => i.name)
    });

    // Group interfaces by purpose
    const interfacesByPurpose = {
      wan: interfaces.filter(i => i.purpose === 'wan').map(i => i.name),
      lan: interfaces.filter(i => i.purpose === 'lan').map(i => i.name),
      wlan: interfaces.filter(i => i.purpose === 'wlan').map(i => i.name),
      docker: interfaces.filter(i => i.purpose === 'docker').map(i => i.name),
      loopback: interfaces.filter(i => i.purpose === 'loopback').map(i => i.name),
      unknown: interfaces.filter(i => i.purpose === 'unknown').map(i => i.name),
    };

    const summary = {
      interfaces,
      internetInterface: internetInterface?.name,
      hotspotInterface: hotspotInterface?.name,
      tailscaleInterface: tailscaleInterface?.name,
      lanInterfaces: lanInterfaces.map(i => i.name),
      dockerInterfaces: dockerInterfaces.map(i => i.name),
      totalInterfaces: interfaces.length,
      interfacesByPurpose,
    };

    console.log('[NetworkService] Network summary created:', {
      totalInterfaces: summary.totalInterfaces,
      internetInterface: summary.internetInterface,
      hotspotInterface: summary.hotspotInterface,
      tailscaleInterface: summary.tailscaleInterface,
      lanInterfaces: summary.lanInterfaces,
      dockerInterfaces: summary.dockerInterfaces,
      interfacesByPurpose: summary.interfacesByPurpose
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
      const { type, purpose } = await this.determineInterfaceTypeAndPurpose(name, baseInfo);

      const interfaceWithTypePurpose = { ...baseInfo, type, purpose };

      switch (type) {
        case 'ethernet':
          return await this.getEthernetInterfaceInfo(name, interfaceWithTypePurpose);
        case 'wifi':
          return await this.getWiFiInterfaceInfo(name, interfaceWithTypePurpose);
        case 'tailscale':
          return await this.getTailscaleInterfaceInfo(name, interfaceWithTypePurpose);
        case 'bridge':
          return await this.getBridgeInterfaceInfo(name, interfaceWithTypePurpose);
        case 'virtual':
          return await this.getVirtualInterfaceInfo(name, interfaceWithTypePurpose);
        default:
          return interfaceWithTypePurpose;
      }
    } catch (error) {
      console.warn(`Failed to get interface details for ${name}:`, error);
      return undefined;
    }
  }

  /**
   * Get base interface information (IP, state, etc.)
   */
  private async getBaseInterfaceInfo(name: string): Promise<Omit<BaseNetworkInterface, 'type' | 'purpose'>> {
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
   * Determine interface type and purpose based on name and characteristics
   */
  private async determineInterfaceTypeAndPurpose(
    name: string,
    baseInfo: Omit<BaseNetworkInterface, 'type' | 'purpose'>
  ): Promise<{ type: BaseNetworkInterface['type']; purpose: BaseNetworkInterface['purpose'] }> {
    // Tailscale interfaces
    if (name.startsWith('tailscale') || name.startsWith('ts-')) {
      return { type: 'tailscale', purpose: 'wan' };
    }

    // Loopback interface
    if (name === 'lo') {
      return { type: 'loopback', purpose: 'loopback' };
    }

    // Docker-related interfaces
    if (this.isDockerInterface(name)) {
      if (name.startsWith('br-') || name.startsWith('docker')) {
        return { type: 'bridge', purpose: 'docker' };
      }
      if (name.startsWith('veth')) {
        return { type: 'virtual', purpose: 'docker' };
      }
    }

    // WiFi interfaces - determine purpose based on mode
    if (name.startsWith('wl') || name.startsWith('wlan')) {
      const purpose = await this.determineWiFiPurpose(name);
      return { type: 'wifi', purpose };
    }

    // Ethernet interfaces - determine purpose based on connectivity
    if (name.startsWith('eth') || name.startsWith('en')) {
      const purpose = await this.determineEthernetPurpose(name, baseInfo);
      return { type: 'ethernet', purpose };
    }

    // Check if it's a bridge interface
    if (await this.isBridgeInterface(name)) {
      return { type: 'bridge', purpose: 'unknown' };
    }

    return { type: 'unknown', purpose: 'unknown' };
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
   * Check if an interface is Docker-related
   */
  private isDockerInterface(name: string): boolean {
    return (
      name.startsWith('br-') ||
      name.startsWith('docker') ||
      name.startsWith('veth') ||
      name.includes('docker')
    );
  }

  /**
   * Determine WiFi interface purpose (wan, wlan, lan, unknown)
   */
  private async determineWiFiPurpose(name: string): Promise<BaseNetworkInterface['purpose']> {
    try {
      // Check if it's configured as a hotspot
      if (this.isHotspotInterface(name)) {
        return 'wlan';
      }

      // Check WiFi mode using iw command
      const { stdout } = await execAsync(`iw dev ${name} info 2>/dev/null`);
      const modeMatch = stdout.match(/type (\w+)/);

      if (modeMatch && modeMatch[1] === 'AP') {
        return 'wlan'; // Access Point mode = hotspot
      }

      if (modeMatch && modeMatch[1] === 'managed') {
        // Check if it has internet connectivity
        try {
          await execAsync(`ping -c 1 -W 5 -I ${name} 8.8.8.8 >/dev/null 2>&1`);
          return 'wan'; // Has internet connectivity
        } catch {
          return 'lan'; // No internet, likely local network
        }
      }

      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Determine Ethernet interface purpose (wan, lan, unknown)
   */
  private async determineEthernetPurpose(
    name: string,
    baseInfo: Omit<BaseNetworkInterface, 'type' | 'purpose'>
  ): Promise<BaseNetworkInterface['purpose']> {
    try {
      // If interface is down or has no IP, it's likely unused
      if (baseInfo.state === 'down' || !baseInfo.ipAddress) {
        return 'unknown';
      }

      // Check if it has internet connectivity
      if (baseInfo.gateway) {
        try {
          await execAsync(`ping -c 1 -W 5 -I ${name} 8.8.8.8 >/dev/null 2>&1`);
          return 'wan'; // Has internet connectivity
        } catch {
          return 'lan'; // Has gateway but no internet, likely local network
        }
      }

      return 'lan'; // No gateway, likely local network
    } catch {
      return 'unknown';
    }
  }

  /**
   * Check if an interface is a bridge
   */
  private async isBridgeInterface(name: string): Promise<boolean> {
    try {
      // Check if it's listed as a bridge
      const { stdout } = await execAsync('ip link show type bridge 2>/dev/null');
      return stdout.includes(name);
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
   * Get bridge-specific information
   */
  private async getBridgeInterfaceInfo(name: string, baseInfo: BaseNetworkInterface): Promise<BridgeInterface> {
    const [bridgeInfoResult, stpResult] = await Promise.allSettled([
      execAsync(`brctl show ${name} 2>/dev/null || ip link show ${name} 2>/dev/null`),
      execAsync(`brctl showstp ${name} 2>/dev/null`),
    ]);

    const bridgeInfo: BridgeInterface = {
      ...baseInfo,
      type: 'bridge',
    };

    // Parse bridge information
    if (bridgeInfoResult.status === 'fulfilled') {
      const output = bridgeInfoResult.value.stdout;

      // Extract bridge ID if available
      const bridgeIdMatch = output.match(/bridge id\s+([a-f0-9:.]+)/);
      if (bridgeIdMatch && bridgeIdMatch[1]) {
        bridgeInfo.bridgeId = bridgeIdMatch[1];
      }

      // Extract connected interfaces
      const interfaceMatches = output.match(/^\s+(\w+)$/gm);
      if (interfaceMatches) {
        bridgeInfo.interfaces = interfaceMatches.map(match => match.trim());
      }
    }

    // Parse STP information
    if (stpResult.status === 'fulfilled') {
      bridgeInfo.stp = stpResult.value.stdout.includes('enabled');
    }

    return bridgeInfo;
  }

  /**
   * Get virtual interface-specific information
   */
  private async getVirtualInterfaceInfo(name: string, baseInfo: BaseNetworkInterface): Promise<VirtualInterface> {
    const [peerResult, containerResult] = await Promise.allSettled([
      execAsync(`ip link show ${name} 2>/dev/null`),
      execAsync(`docker ps --format "table {{.ID}}\\t{{.Names}}" 2>/dev/null`),
    ]);

    const virtualInfo: VirtualInterface = {
      ...baseInfo,
      type: 'virtual',
    };

    // Parse peer interface for veth pairs
    if (peerResult.status === 'fulfilled') {
      const peerMatch = peerResult.value.stdout.match(/veth\w+@if\d+/);
      if (peerMatch) {
        virtualInfo.peerInterface = peerMatch[0];
      }
    }

    // Try to find associated container (basic implementation)
    if (containerResult.status === 'fulfilled' && name.startsWith('veth')) {
      // This is a simplified approach - in practice, you'd need more sophisticated container detection
      const containers = containerResult.value.stdout.split('\n').slice(1);
      if (containers.length > 0 && containers[0]) {
        const containerInfo = containers[0].split('\t');
        if (containerInfo[0]) {
          virtualInfo.containerId = containerInfo[0];
        }
      }
    }

    return virtualInfo;
  }

  /**
   * Get ethernet-specific information
   */
  private async getEthernetInterfaceInfo(name: string, baseInfo: BaseNetworkInterface): Promise<EthernetInterface> {
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

    // Add hotspot-specific information if this is a hotspot interface
    return this.addHotspotInfoToWiFi(wifiInfo);
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
   * Add hotspot-specific information to WiFi interface
   */
  private addHotspotInfoToWiFi(wifiInfo: WiFiInterface): WiFiInterface {
    if (wifiInfo.purpose !== 'wlan') {
      return wifiInfo;
    }

    const hostapdConfig = this.readHostapdConfig();

    // Add hotspot-specific properties
    const hotspotWifi = { ...wifiInfo };

    // Override SSID and security from hostapd config if available
    if (hostapdConfig.ssid) {
      hotspotWifi.ssid = hostapdConfig.ssid;
    }

    if (hostapdConfig.wpa) {
      hotspotWifi.security = hostapdConfig.wpa === '3' ? 'WPA3' : 'WPA2';
    }

    if (hostapdConfig.channel) {
      hotspotWifi.channel = parseInt(hostapdConfig.channel);
    }

    return hotspotWifi;
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
   * Find the interface with internet connectivity (WAN purpose)
   */
  private async findInternetInterface(interfaces: NetworkInterface[]): Promise<NetworkInterface | undefined> {
    // First, look for interfaces with WAN purpose
    const wanInterfaces = interfaces.filter(iface => iface.purpose === 'wan' && iface.state === 'up');

    for (const iface of wanInterfaces) {
      if (iface.ipAddress && iface.gateway) {
        // Test internet connectivity
        try {
          await execAsync(`ping -c 1 -W 5 -I ${iface.name} 8.8.8.8 >/dev/null 2>&1`);
          return iface;
        } catch {
          // Continue to next interface
        }
      }
    }

    // Fallback: test all up interfaces with IP and gateway
    for (const iface of interfaces) {
      if (iface.state === 'up' && iface.ipAddress && iface.gateway && iface.purpose !== 'docker') {
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
   * Find the hotspot interface (WLAN purpose)
   */
  private findHotspotInterface(interfaces: NetworkInterface[]): NetworkInterface | undefined {
    return interfaces.find(iface => iface.purpose === 'wlan');
  }

  /**
   * Find the Tailscale interface
   */
  private findTailscaleInterface(interfaces: NetworkInterface[]): NetworkInterface | undefined {
    return interfaces.find(iface => iface.type === 'tailscale');
  }

  /**
   * Find LAN interfaces
   */
  private findLanInterfaces(interfaces: NetworkInterface[]): NetworkInterface[] {
    return interfaces.filter(iface => iface.purpose === 'lan');
  }

  /**
   * Find Docker interfaces
   */
  private findDockerInterfaces(interfaces: NetworkInterface[]): NetworkInterface[] {
    return interfaces.filter(iface => iface.purpose === 'docker');
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
