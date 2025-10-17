import { exec } from 'child_process';
import { readFileSync } from 'fs';
import { promisify } from 'util';

import { LoggerFactory, LogLevel } from '@dangerprep/logging';

import type { TailscaleInterface } from '../../types/network';

import { WifiConfigService } from './WifiConfigService';

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
  password?: string | undefined; // For AP mode (hotspot) only
  connectedClients?: ConnectedClient[] | undefined; // For AP mode - detailed client information
}

/**
 * Connected client information for WiFi hotspots
 */
export interface ConnectedClient {
  macAddress: string;
  ipAddress?: string | undefined;
  hostname?: string | undefined;
  signalStrength?: number | undefined; // dBm
  connectedTime?: string | undefined; // duration or timestamp
  txRate?: string | undefined;
  rxRate?: string | undefined;
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
export type NetworkInterface =
  | EthernetInterface
  | WiFiInterface
  | TailscaleInterface
  | BridgeInterface
  | VirtualInterface
  | BaseNetworkInterface;

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
  private readonly wifiConfigService = new WifiConfigService();
  private logger = LoggerFactory.createStructuredLogger(
    'NetworkService',
    '/var/log/dangerprep/portal.log',
    process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO
  );

  /**
   * Get DHCP leases to map MAC addresses to IP addresses and hostnames
   */
  private async getDhcpLeases(): Promise<Map<string, { ip: string; hostname?: string }>> {
    const leaseMap = new Map<string, { ip: string; hostname?: string }>();

    try {
      // Try to read dnsmasq leases file
      const { stdout } = await execAsync(
        'cat /var/lib/misc/dnsmasq.leases 2>/dev/null || cat /var/lib/dnsmasq/dnsmasq.leases 2>/dev/null || echo ""'
      );

      if (stdout.trim()) {
        const lines = stdout.trim().split('\n');
        for (const line of lines) {
          // Format: timestamp mac ip hostname client-id
          const parts = line.split(/\s+/);
          if (parts.length >= 3) {
            const mac = parts[1]?.toLowerCase();
            const ip = parts[2];
            const hostname = parts[3] !== '*' ? parts[3] : undefined;

            if (mac && ip) {
              leaseMap.set(mac, hostname ? { ip, hostname } : { ip });
            }
          }
        }
      }
    } catch (error) {
      this.logger.warn('Could not read DHCP leases', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return leaseMap;
  }

  /**
   * Parse connected clients from iw station dump output
   */
  private async parseConnectedClients(stationDumpOutput: string): Promise<ConnectedClient[]> {
    this.logger.debug('parseConnectedClients called', {
      outputLength: stationDumpOutput.length,
    });
    const clients: ConnectedClient[] = [];
    const stations = stationDumpOutput.split('Station ').filter(section => section.trim());
    this.logger.debug('Found stations in output', { stationCount: stations.length });

    // Get DHCP leases for IP/hostname mapping
    const dhcpLeases = await this.getDhcpLeases();
    this.logger.debug('Retrieved DHCP leases', { leaseCount: dhcpLeases.size });

    for (const station of stations) {
      const lines = station.split('\n');
      if (lines.length === 0) continue;

      // Extract MAC address from first line
      const macMatch = lines[0]?.match(/([a-f0-9:]{17})/);
      if (!macMatch || !macMatch[1]) {
        this.logger.debug('Could not extract MAC from station line', {
          line: lines[0],
        });
        continue;
      }

      const macAddress = macMatch[1];
      this.logger.debug('Processing client', { macAddress });
      const client: ConnectedClient = {
        macAddress,
      };

      // Try to get IP and hostname from DHCP leases
      const lease = dhcpLeases.get(macAddress.toLowerCase());
      if (lease) {
        client.ipAddress = lease.ip;
        if (lease.hostname) {
          client.hostname = lease.hostname;
        }
        this.logger.debug('Found DHCP lease', {
          macAddress,
          ip: lease.ip,
          hostname: lease.hostname,
        });
      } else {
        this.logger.debug('No DHCP lease found', { macAddress });
      }

      // Parse additional information from subsequent lines
      for (const line of lines) {
        const trimmed = line.trim();

        // Signal strength
        const signalMatch = trimmed.match(/signal:\s*(-?\d+)\s*dBm/);
        if (signalMatch && signalMatch[1]) {
          client.signalStrength = parseInt(signalMatch[1]);
        }

        // TX bitrate
        const txMatch = trimmed.match(/tx bitrate:\s*([\d.]+\s*\w+)/);
        if (txMatch) {
          client.txRate = txMatch[1];
        }

        // RX bitrate
        const rxMatch = trimmed.match(/rx bitrate:\s*([\d.]+\s*\w+)/);
        if (rxMatch) {
          client.rxRate = rxMatch[1];
        }

        // Connected time (inactive time can give us an idea)
        const inactiveMatch = trimmed.match(/inactive time:\s*(\d+)\s*ms/);
        if (inactiveMatch && inactiveMatch[1]) {
          const inactiveMs = parseInt(inactiveMatch[1]);
          if (inactiveMs < 60000) {
            // Less than 1 minute inactive
            client.connectedTime = `${Math.floor(inactiveMs / 1000)}s ago`;
          }
        }
      }

      this.logger.debug('Parsed client', { client });
      clients.push(client);
    }

    this.logger.debug('Returning parsed clients', { clientCount: clients.length });
    return clients;
  }

  /**
   * Get all network interfaces
   */
  async getAllInterfaces(): Promise<NetworkInterface[]> {
    this.logger.debug('getAllInterfaces called');
    await this.refreshCacheIfNeeded();
    const interfaces = Array.from(this.interfaceCache.values());
    this.logger.debug('Returning interfaces', {
      count: interfaces.length,
      interfaces: interfaces.map(i => ({ name: i.name, type: i.type, state: i.state })),
    });
    return interfaces;
  }

  /**
   * Get network summary with all interfaces and special interface mappings
   */
  async getNetworkSummary(): Promise<NetworkSummary> {
    this.logger.debug('getNetworkSummary called');
    const interfaces = await this.getAllInterfaces();

    this.logger.debug('Finding special interfaces');
    // Find special interfaces
    const internetInterface = await this.findInternetInterface(interfaces);
    const hotspotInterface = this.findHotspotInterface(interfaces);
    const tailscaleInterface = this.findTailscaleInterface(interfaces);

    // Find additional interface categories
    const lanInterfaces = this.findLanInterfaces(interfaces);
    const dockerInterfaces = this.findDockerInterfaces(interfaces);

    this.logger.debug('Special interfaces found', {
      internet: internetInterface?.name || 'none',
      hotspot: hotspotInterface?.name || 'none',
      tailscale: tailscaleInterface?.name || 'none',
      lan: lanInterfaces.map(i => i.name),
      docker: dockerInterfaces.map(i => i.name),
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

    this.logger.debug('Network summary created', {
      totalInterfaces: summary.totalInterfaces,
      internetInterface: summary.internetInterface,
      hotspotInterface: summary.hotspotInterface,
      tailscaleInterface: summary.tailscaleInterface,
      lanInterfaces: summary.lanInterfaces,
      dockerInterfaces: summary.dockerInterfaces,
      interfacesByPurpose: summary.interfacesByPurpose,
    });

    return summary;
  }

  /**
   * Get specific interface by name
   */
  async getInterface(name: string): Promise<NetworkInterface | undefined> {
    this.logger.debug('getInterface called', { name });
    await this.refreshCacheIfNeeded();
    const interface_ = this.interfaceCache.get(name);
    this.logger.debug('Interface lookup result', {
      name,
      found: !!interface_,
      type: interface_?.type,
      state: interface_?.state,
    });
    return interface_;
  }

  /**
   * Get interface by keyword (hotspot, internet, tailscale)
   */
  async getInterfaceByKeyword(
    keyword: 'hotspot' | 'internet' | 'tailscale'
  ): Promise<NetworkInterface | undefined> {
    this.logger.debug('getInterfaceByKeyword called', { keyword });
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

    this.logger.debug('Keyword lookup result', {
      keyword,
      found: !!result,
      name: result?.name,
      type: result?.type,
      state: result?.state,
    });
    return result;
  }

  /**
   * Refresh interface cache if needed
   */
  private async refreshCacheIfNeeded(): Promise<void> {
    const now = Date.now();
    const cacheAge = now - this.lastCacheUpdate;
    const isStale = cacheAge > this.cacheTimeout;

    this.logger.debug('Cache check', {
      age: `${cacheAge}ms`,
      stale: isStale,
      timeout: `${this.cacheTimeout}ms`,
    });

    if (isStale) {
      this.logger.debug('Cache is stale, refreshing');
      await this.refreshInterfaceCache();
      this.lastCacheUpdate = now;
      this.logger.debug('Cache refreshed');
    } else {
      this.logger.debug('Using cached interface data');
    }
  }

  /**
   * Refresh the interface cache by detecting all interfaces
   */
  private async refreshInterfaceCache(): Promise<void> {
    this.logger.debug('Starting interface cache refresh');
    this.interfaceCache.clear();

    try {
      this.logger.debug('Executing "ip link show" to get interface list');
      // Get all network interfaces
      const { stdout } = await execAsync('ip link show');
      const interfaceNames = this.parseInterfaceNames(stdout);
      this.logger.debug('Found interfaces', {
        count: interfaceNames.length,
        interfaces: interfaceNames,
      });

      // Get detailed information for each interface
      for (const name of interfaceNames) {
        this.logger.debug('Getting details for interface', { name });
        try {
          const interfaceInfo = await this.getInterfaceDetails(name);
          if (interfaceInfo) {
            this.interfaceCache.set(name, interfaceInfo);
            this.logger.debug('Cached interface', {
              name,
              type: interfaceInfo.type,
              state: interfaceInfo.state,
            });
          } else {
            this.logger.debug('No details returned for interface', { name });
          }
        } catch (error) {
          this.logger.warn('Failed to get details for interface', {
            name,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      this.logger.debug('Interface cache refresh complete', {
        cachedCount: this.interfaceCache.size,
      });
    } catch (error) {
      this.logger.error('Failed to refresh interface cache', {
        error: error instanceof Error ? error.message : String(error),
      });
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
      if (match && match[1] && match[1] !== 'lo') {
        // Skip loopback
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
      this.logger.warn('Failed to get interface details', {
        name,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  /**
   * Get base interface information (IP, state, etc.)
   */
  private async getBaseInterfaceInfo(
    name: string
  ): Promise<Omit<BaseNetworkInterface, 'type' | 'purpose'>> {
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
      // Get comprehensive hostapd information
      const hostapdInfo = await this.getHostapdInfo();

      // Check if this interface is the active hotspot interface
      if (hostapdInfo.isRunning && hostapdInfo.activeInterface === name) {
        return 'wlan'; // This is the active hotspot interface
      }

      // Check if it's configured as a hotspot in hostapd config
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
    } catch (error) {
      this.logger.warn('Error determining WiFi purpose', {
        name,
        error: error instanceof Error ? error.message : String(error),
      });
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
  private async getInterfaceIpInfo(
    name: string
  ): Promise<
    Partial<Pick<BaseNetworkInterface, 'ipAddress' | 'netmask' | 'gateway' | 'dnsServers'>>
  > {
    try {
      const [ipResult, gatewayResult, dnsResult] = await Promise.allSettled([
        execAsync(`ip addr show ${name}`),
        execAsync(`ip route show dev ${name} | grep default`),
        execAsync(
          `resolvectl status ${name} 2>/dev/null || systemd-resolve --status ${name} 2>/dev/null || cat /etc/resolv.conf`
        ),
      ]);

      const result: Partial<
        Pick<BaseNetworkInterface, 'ipAddress' | 'netmask' | 'gateway' | 'dnsServers'>
      > = {};

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
      this.logger.warn('Failed to get IP info', {
        name,
        error: error instanceof Error ? error.message : String(error),
      });
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
  private async getBridgeInterfaceInfo(
    name: string,
    baseInfo: BaseNetworkInterface
  ): Promise<BridgeInterface> {
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
  private async getVirtualInterfaceInfo(
    name: string,
    baseInfo: BaseNetworkInterface
  ): Promise<VirtualInterface> {
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
  private async getEthernetInterfaceInfo(
    name: string,
    baseInfo: BaseNetworkInterface
  ): Promise<EthernetInterface> {
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
  private async getWiFiInterfaceInfo(
    name: string,
    baseInfo: Omit<BaseNetworkInterface, 'type'>
  ): Promise<WiFiInterface> {
    this.logger.info('Getting WiFi interface info', { name });

    const [iwConfigResult, iwInfoResult, clientsCountResult, clientsDetailResult] =
      await Promise.allSettled([
        execAsync(`iwconfig ${name} 2>/dev/null`),
        execAsync(`iw dev ${name} info 2>/dev/null`),
        execAsync(`iw dev ${name} station dump 2>/dev/null | grep Station | wc -l`),
        execAsync(`iw dev ${name} station dump 2>/dev/null`),
      ]);

    const wifiInfo: WiFiInterface = {
      ...baseInfo,
      type: 'wifi',
    };

    this.logger.debug('WiFi command results', {
      name,
      iwConfigSuccess: iwConfigResult.status === 'fulfilled',
      iwInfoSuccess: iwInfoResult.status === 'fulfilled',
      clientsCountSuccess: clientsCountResult.status === 'fulfilled',
      clientsDetailSuccess: clientsDetailResult.status === 'fulfilled',
    });

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
          this.logger.info('Detected WiFi mode from iw info', {
            name,
            mode: wifiInfo.mode,
          });
        } else {
          this.logger.warn('Unknown WiFi mode detected', {
            name,
            detectedMode: mode,
          });
        }
      } else {
        this.logger.warn('Could not detect WiFi mode from iw info', {
          name,
          iwInfoOutput: iwinfo.substring(0, 200),
        });
      }

      // Channel
      const channelMatch = iwinfo.match(/channel (\d+)/);
      if (channelMatch && channelMatch[1]) {
        wifiInfo.channel = parseInt(channelMatch[1]);
      }
    } else {
      this.logger.warn('Failed to get iw info', {
        name,
        reason: iwInfoResult.status === 'rejected' ? String(iwInfoResult.reason) : 'unknown',
      });
    }

    // Connected clients - fetch for hotspot interfaces (purpose === 'wlan') or AP mode interfaces
    const isHotspotOrAP = baseInfo.purpose === 'wlan' || wifiInfo.mode === 'ap';

    if (isHotspotOrAP) {
      this.logger.info('Processing hotspot/AP interface, fetching connected clients', {
        name,
        purpose: baseInfo.purpose,
        mode: wifiInfo.mode,
        reason: baseInfo.purpose === 'wlan' ? 'purpose=wlan' : 'mode=ap',
      });

      // Get detailed client information - always try to parse, even if empty
      if (clientsDetailResult.status === 'fulfilled') {
        this.logger.info('Parsing client details', { name });
        const clientDetails = await this.parseConnectedClients(clientsDetailResult.value.stdout);
        this.logger.info('Parsed client details', {
          name,
          clientCount: clientDetails.length,
          clients: clientDetails,
        });
        // Always set the array, even if empty, so we know we tried to fetch it
        wifiInfo.connectedClients = clientDetails;
      } else {
        this.logger.warn('Failed to get station dump', {
          name,
          reason:
            clientsDetailResult.status === 'rejected'
              ? String(clientsDetailResult.reason)
              : 'unknown',
        });
      }
    } else {
      this.logger.debug('Not a hotspot/AP interface, skipping connected clients', {
        name,
        purpose: baseInfo.purpose,
        mode: wifiInfo.mode,
      });
    }

    // Add hotspot-specific information if this is a hotspot interface
    return await this.addHotspotInfoToWiFi(wifiInfo);
  }

  /**
   * Get Tailscale-specific information
   */
  private async getTailscaleInterfaceInfo(
    _name: string,
    baseInfo: Omit<BaseNetworkInterface, 'type'>
  ): Promise<TailscaleInterface> {
    const [statusResult] = await Promise.allSettled([
      execAsync('tailscale status --json 2>/dev/null'),
    ]);

    const tailscaleInfo = {
      ...baseInfo,
      type: 'tailscale',
      status: 'disconnected',
    } as TailscaleInterface;

    // Parse status
    if (statusResult.status === 'fulfilled') {
      try {
        const status = JSON.parse(statusResult.value.stdout);
        tailscaleInfo.status = status.BackendState === 'Running' ? 'connected' : 'disconnected';
        tailscaleInfo.tailnetName = status.CurrentTailnet?.Name;
        tailscaleInfo.exitNode = status.ExitNodeStatus?.Online || false;
        tailscaleInfo.exitNodeId = status.ExitNodeStatus?.TailscaleIPs?.[0] || undefined;

        // Parse current settings from Self
        if (status.Self) {
          tailscaleInfo.acceptDNS = status.Self.CapMap?.['accept-dns'] !== false;
          tailscaleInfo.acceptRoutes = status.Self.CapMap?.['accept-routes'] !== false;
          tailscaleInfo.sshEnabled = status.Self.CapMap?.ssh !== false;
          tailscaleInfo.shieldsUp = status.Self.CapMap?.['shields-up'] !== false;
          tailscaleInfo.routeAdvertising = status.Self.PrimaryRoutes || [];
        }

        // Parse peers with enhanced information
        if (status.Peer) {
          tailscaleInfo.peers = Object.values(status.Peer).map((peer: any) => ({
            hostname: peer.HostName,
            ipAddress: peer.TailscaleIPs?.[0] || '',
            online: peer.Online,
            lastSeen: peer.LastSeen,
            os: peer.OS,
            exitNode: peer.ExitNode || false,
            exitNodeOption: peer.ExitNodeOption || false,
            sshEnabled: peer.CapMap?.ssh !== false,
            subnetRoutes: peer.PrimaryRoutes || [],
            relay: peer.Relay || undefined,
            tags: peer.Tags || [],
          }));
        }
      } catch (error) {
        this.logger.warn('Failed to parse Tailscale status JSON', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return tailscaleInfo;
  }

  /**
   * Add hotspot-specific information to WiFi interface
   */
  private async addHotspotInfoToWiFi(wifiInfo: WiFiInterface): Promise<WiFiInterface> {
    // Add hotspot info for interfaces that are either:
    // 1. Configured as hotspot in hostapd (purpose === 'wlan')
    // 2. Running in AP mode (mode === 'ap')
    // This is more lenient to handle cases where mode detection might fail
    const isHotspot = wifiInfo.purpose === 'wlan' || wifiInfo.mode === 'ap';

    this.logger.info('Checking if WiFi interface is hotspot', {
      name: wifiInfo.name,
      purpose: wifiInfo.purpose,
      mode: wifiInfo.mode,
      isHotspot,
      hasConnectedClients: !!wifiInfo.connectedClients,
      connectedClientsCount: wifiInfo.connectedClients?.length || 0,
    });

    if (!isHotspot) {
      this.logger.debug('Not a hotspot interface, returning as-is', { name: wifiInfo.name });
      return wifiInfo;
    }

    try {
      const hostapdInfo = await this.getHostapdInfo();
      const hostapdConfig = hostapdInfo.config;

      // Get WiFi configuration including password
      const wifiConfig = this.wifiConfigService.getWifiConfig();
      this.logger.debug('Retrieved WiFi config', {
        name: wifiInfo.name,
        ssid: wifiConfig.ssid,
        hasPassword: !!wifiConfig.password,
      });

      // Add hotspot-specific properties
      const hotspotWifi = { ...wifiInfo };
      this.logger.debug('Creating hotspot WiFi from base WiFi', {
        hasConnectedClients: !!wifiInfo.connectedClients,
        count: wifiInfo.connectedClients?.length || 0,
      });

      // Add password for hotspot
      if (wifiConfig.password) {
        hotspotWifi.password = wifiConfig.password;
      }

      // Use actual runtime values if available, otherwise fall back to config
      if (hostapdInfo.isRunning && hostapdInfo.activeInterface === wifiInfo.name) {
        // Use runtime information for active hotspot
        if (hostapdInfo.actualSSID) {
          hotspotWifi.ssid = hostapdInfo.actualSSID;
        }

        this.logger.debug('After applying hostapd runtime info', {
          connectedClientsCount: hotspotWifi.connectedClients?.length || 0,
          hasDetails: !!hotspotWifi.connectedClients,
        });

        if (hostapdInfo.runtimeInfo) {
          if (hostapdInfo.runtimeInfo.channel) {
            hotspotWifi.channel = hostapdInfo.runtimeInfo.channel;
          }
          if (hostapdInfo.runtimeInfo.macAddress) {
            hotspotWifi.macAddress = hostapdInfo.runtimeInfo.macAddress;
          }
        }
      }

      // Override with config values if runtime values not available
      if (!hotspotWifi.ssid && hostapdConfig.ssid) {
        hotspotWifi.ssid = hostapdConfig.ssid;
      }

      if (hostapdConfig.wpa) {
        hotspotWifi.security = hostapdConfig.wpa === '3' ? 'WPA3' : 'WPA2';
      }

      if (!hotspotWifi.channel && hostapdConfig.channel) {
        hotspotWifi.channel = parseInt(hostapdConfig.channel);
      }

      // Add additional hostapd config information
      if (hostapdConfig.country_code) {
        hotspotWifi.frequency = this.getFrequencyFromChannel(
          hotspotWifi.channel || parseInt(hostapdConfig.channel || '6')
        );
      }

      if (hostapdConfig.max_num_sta) {
        // This would require extending the WiFiInterface to include maxClients
        // For now, we'll add it as a custom property
        (hotspotWifi as any).maxClients = parseInt(hostapdConfig.max_num_sta);
      }

      if (hostapdConfig.ignore_broadcast_ssid === '1') {
        (hotspotWifi as any).hidden = true;
      }

      this.logger.info('Returning hotspot WiFi with client information', {
        name: wifiInfo.name,
        ssid: hotspotWifi.ssid,
        hasPassword: !!hotspotWifi.password,
        hasConnectedClients: !!hotspotWifi.connectedClients,
        connectedClientsCount: hotspotWifi.connectedClients?.length || 0,
      });
      return hotspotWifi;
    } catch (error) {
      this.logger.warn('Error adding hotspot info to WiFi interface', {
        name: wifiInfo.name,
        error: error instanceof Error ? error.message : String(error),
      });
      return wifiInfo;
    }
  }

  /**
   * Get frequency band from WiFi channel
   */
  private getFrequencyFromChannel(channel: number): string {
    if (channel <= 14) {
      return '2.4GHz';
    } else if (channel >= 36 && channel <= 165) {
      return '5GHz';
    } else if (channel >= 1 && channel <= 233) {
      return '6GHz';
    }
    return 'Unknown';
  }

  /**
   * Read hostapd configuration with enhanced parsing
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
    } catch (error) {
      this.logger.warn('Could not read hostapd config', {
        path: this.hostapdPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }

  /**
   * Get comprehensive hostapd information including runtime status
   */
  private async getHostapdInfo(): Promise<{
    config: Record<string, string>;
    isRunning: boolean;
    activeInterface?: string;
    actualSSID?: string;
    connectedClients?: number;
    runtimeInfo?: Record<string, any>;
  }> {
    const config = this.readHostapdConfig();

    try {
      // Check if hostapd is running
      const { stdout: psOutput } = await execAsync('ps aux | grep "[h]ostapd" || true');
      const isRunning = psOutput.trim().length > 0;

      let activeInterface: string | undefined;
      let actualSSID: string | undefined;
      let connectedClients: number | undefined;
      let runtimeInfo: Record<string, any> | undefined;

      if (isRunning) {
        // Get active interface from running hostapd process
        const interfaceMatch = psOutput.match(/-i\s+(\w+)/);
        if (interfaceMatch) {
          activeInterface = interfaceMatch[1];
        } else {
          // Fallback: get interface from config file being used
          const configMatch = psOutput.match(/\/etc\/hostapd\/\S+/);
          if (configMatch) {
            try {
              const configContent = readFileSync(configMatch[0], 'utf-8');
              const interfaceConfigMatch = configContent.match(/^interface=(.+)$/m);
              if (interfaceConfigMatch && interfaceConfigMatch[1]) {
                activeInterface = interfaceConfigMatch[1].trim();
              }
            } catch {
              // Ignore errors reading config
            }
          }
        }

        // Get actual SSID and connected clients if we have an active interface
        if (activeInterface) {
          try {
            // Get actual SSID from the interface
            const { stdout: iwOutput } = await execAsync(
              `iw dev ${activeInterface} info 2>/dev/null || true`
            );
            const ssidMatch = iwOutput.match(/ssid (.+)/);
            if (ssidMatch && ssidMatch[1]) {
              actualSSID = ssidMatch[1].trim();
            }

            // Get connected clients count
            const { stdout: stationOutput } = await execAsync(
              `iw dev ${activeInterface} station dump 2>/dev/null | grep Station | wc -l || echo "0"`
            );
            connectedClients = parseInt(stationOutput.trim()) || 0;

            // Get additional runtime info
            const { stdout: infoOutput } = await execAsync(
              `iw dev ${activeInterface} info 2>/dev/null || true`
            );
            if (infoOutput) {
              runtimeInfo = this.parseIwInfo(infoOutput);
            }
          } catch (error) {
            this.logger.warn('Could not get runtime info for interface', {
              interface: activeInterface,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      return {
        config,
        isRunning,
        ...(activeInterface && { activeInterface }),
        ...(actualSSID && { actualSSID }),
        ...(connectedClients !== undefined && { connectedClients }),
        ...(runtimeInfo && { runtimeInfo }),
      };
    } catch (error) {
      this.logger.warn('Error getting hostapd info', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { config, isRunning: false };
    }
  }

  /**
   * Parse iw info output into structured data
   */
  private parseIwInfo(iwOutput: string): Record<string, any> {
    const info: Record<string, any> = {};

    const lines = iwOutput.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();

      // Parse various fields
      if (trimmed.includes('type ')) {
        const typeMatch = trimmed.match(/type (\w+)/);
        if (typeMatch) info.type = typeMatch[1];
      }

      if (trimmed.includes('channel ')) {
        const channelMatch = trimmed.match(/channel (\d+)/);
        if (channelMatch && channelMatch[1]) info.channel = parseInt(channelMatch[1]);
      }

      if (trimmed.includes('txpower ')) {
        const powerMatch = trimmed.match(/txpower ([\d.]+) dBm/);
        if (powerMatch && powerMatch[1]) info.txpower = parseFloat(powerMatch[1]);
      }

      if (trimmed.includes('addr ')) {
        const addrMatch = trimmed.match(/addr ([a-f0-9:]{17})/);
        if (addrMatch) info.macAddress = addrMatch[1];
      }
    }

    return info;
  }

  /**
   * Find the interface with internet connectivity (WAN purpose)
   */
  private async findInternetInterface(
    interfaces: NetworkInterface[]
  ): Promise<NetworkInterface | undefined> {
    // First, look for interfaces with WAN purpose
    const wanInterfaces = interfaces.filter(
      iface => iface.purpose === 'wan' && iface.state === 'up'
    );

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
    return [(mask >>> 24) & 0xff, (mask >>> 16) & 0xff, (mask >>> 8) & 0xff, mask & 0xff].join('.');
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
   * Get detailed hostapd status for API consumption
   */
  async getHostapdStatus(): Promise<{
    isConfigured: boolean;
    isRunning: boolean;
    configuredInterface?: string;
    activeInterface?: string;
    ssid?: string;
    actualSSID?: string;
    channel?: number;
    connectedClients?: number;
    security?: string;
    countryCode?: string;
    maxClients?: number;
    hidden?: boolean;
  }> {
    try {
      const hostapdInfo = await this.getHostapdInfo();
      const config = hostapdInfo.config;

      const status = {
        isConfigured: Object.keys(config).length > 0,
        isRunning: hostapdInfo.isRunning,
      };

      // Add configuration information
      if (config.interface) {
        (status as any).configuredInterface = config.interface;
      }

      if (config.ssid) {
        (status as any).ssid = config.ssid;
      }

      if (config.channel) {
        (status as any).channel = parseInt(config.channel);
      }

      if (config.wpa) {
        (status as any).security = config.wpa === '3' ? 'WPA3' : 'WPA2';
      }

      if (config.country_code) {
        (status as any).countryCode = config.country_code;
      }

      if (config.max_num_sta) {
        (status as any).maxClients = parseInt(config.max_num_sta);
      }

      if (config.ignore_broadcast_ssid === '1') {
        (status as any).hidden = true;
      }

      // Add runtime information if available
      if (hostapdInfo.isRunning) {
        if (hostapdInfo.activeInterface) {
          (status as any).activeInterface = hostapdInfo.activeInterface;
        }

        if (hostapdInfo.actualSSID) {
          (status as any).actualSSID = hostapdInfo.actualSSID;
        }

        if (hostapdInfo.connectedClients !== undefined) {
          (status as any).connectedClients = hostapdInfo.connectedClients;
        }
      }

      return status;
    } catch (error) {
      this.logger.error('Error getting hostapd status', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        isConfigured: false,
        isRunning: false,
      };
    }
  }

  /**
   * Clear the interface cache (useful for testing or manual refresh)
   */
  clearCache(): void {
    this.logger.debug('Clearing interface cache');
    const previousSize = this.interfaceCache.size;
    this.interfaceCache.clear();
    this.lastCacheUpdate = 0;
    this.logger.debug('Cache cleared', {
      previousSize,
      newSize: this.interfaceCache.size,
    });
  }
}
