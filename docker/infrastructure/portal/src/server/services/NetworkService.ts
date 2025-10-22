import { exec } from 'child_process';
import { readFileSync } from 'fs';
import { promisify } from 'util';

import { LoggerFactory, LogLevel } from '@dangerprep/logging';

import type { TailscaleInterface } from '../../types/network';

import { ISPService } from './ISPService';
import { WifiConfigService } from './WifiConfigService';

const execAsync = promisify(exec);

/**
 * Route information
 */
export interface RouteInfo {
  destination: string;
  gateway: string;
  metric?: number;
  flags?: string;
}

/**
 * Interface flags
 */
export interface InterfaceFlags {
  up?: boolean;
  broadcast?: boolean;
  running?: boolean;
  multicast?: boolean;
  loopback?: boolean;
  pointToPoint?: boolean;
  noarp?: boolean;
  promisc?: boolean;
  allmulti?: boolean;
  master?: boolean;
  slave?: boolean;
  debug?: boolean;
  dormant?: boolean;
  simplex?: boolean;
  lower_up?: boolean;
  lower_down?: boolean;
}

/**
 * Base network interface information
 */
export interface BaseNetworkInterface {
  name: string;
  type: 'ethernet' | 'wifi' | 'tailscale' | 'bridge' | 'virtual' | 'loopback' | 'unknown';
  purpose: 'wan' | 'lan' | 'wlan' | 'docker' | 'loopback' | 'unknown';
  state: 'up' | 'down' | 'unknown';
  ipAddress?: string | undefined;
  ipv6Address?: string | undefined;
  gateway?: string | undefined;
  netmask?: string | undefined;
  dnsServers?: string[] | undefined;
  macAddress?: string | undefined;
  mtu?: number | undefined;
  // Interface flags
  flags?: InterfaceFlags | undefined;
  // ISP information (for WAN interfaces)
  ispName?: string | undefined;
  publicIpv4?: string | undefined;
  publicIpv6?: string | undefined;
  // WAN-specific metrics
  dhcpStatus?: boolean | undefined;
  connectionUptime?: number | undefined; // in seconds
  latencyToGateway?: number | undefined; // in milliseconds
  packetLoss?: number | undefined; // percentage
  // Interface statistics
  rxBytes?: number;
  txBytes?: number;
  rxPackets?: number;
  txPackets?: number;
  rxErrors?: number;
  txErrors?: number;
  rxDropped?: number;
  txDropped?: number;
  broadcastPackets?: number;
  multicastPackets?: number;
  // Routing information (for WAN interfaces)
  routes?: RouteInfo[] | undefined;
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
  autoNegotiation?: boolean;
  powerManagement?: string;
  offloadFeatures?: {
    tso?: boolean;
    gso?: boolean;
    gro?: boolean;
    lro?: boolean;
    rxvlan?: boolean;
    txvlan?: boolean;
  };
  wakeOnLan?: boolean;
  rxBytes?: number;
  txBytes?: number;
  rxPackets?: number;
  txPackets?: number;
  rxErrors?: number;
  txErrors?: number;
  rxDropped?: number;
  txDropped?: number;
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
  maxClients?: number | undefined; // For AP mode - maximum number of clients
  hidden?: boolean | undefined; // For AP mode - whether SSID is hidden
  bssid?: string | undefined; // MAC address of access point
  linkQuality?: number | undefined; // Link quality percentage
  noiseLevel?: number | undefined; // Noise level in dBm
  bitRate?: string | undefined; // Current bit rate
  txPower?: string | undefined; // TX power level
  channelWidth?: string | undefined; // e.g., "20MHz", "40MHz", "80MHz", "160MHz"
  regulatoryDomain?: string | undefined; // Country code
  supportedRates?: string[] | undefined; // Supported data rates
  beaconInterval?: number | undefined; // Beacon interval in ms
  dtimPeriod?: number | undefined; // DTIM period
  roamingCapability?: boolean | undefined; // Whether roaming is enabled
  rxBytes?: number;
  txBytes?: number;
  rxPackets?: number;
  txPackets?: number;
  rxErrors?: number;
  txErrors?: number;
  rxDropped?: number;
  txDropped?: number;
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
  private readonly ispService = new ISPService();
  private logger = LoggerFactory.createConsoleLogger(
    'NetworkService',
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

      let interfaceWithTypePurpose = { ...baseInfo, type, purpose };

      // Add ISP information and routing for WAN interfaces
      if (purpose === 'wan') {
        try {
          const [ispInfo, routes] = await Promise.all([
            this.ispService.getISPInfo(),
            this.getInterfaceRoutes(name),
          ]);
          interfaceWithTypePurpose = {
            ...interfaceWithTypePurpose,
            ispName: ispInfo.ispName,
            publicIpv4: ispInfo.publicIpv4,
            publicIpv6: ispInfo.publicIpv6,
            ...(routes && { routes }),
          };
        } catch (error) {
          this.logger.warn('Failed to fetch ISP information or routes', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

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
    const [ipInfo, macInfo, mtuInfo, statsInfo, flagsInfo, bcastMcastInfo, dhcpInfo, uptimeInfo] =
      await Promise.allSettled([
        this.getInterfaceIpInfo(name),
        this.getInterfaceMacAddress(name),
        this.getInterfaceMtu(name),
        this.getInterfaceStats(name),
        this.getInterfaceFlags(name),
        this.getBroadcastMulticastStats(name),
        this.checkDhcpStatus(name),
        this.getConnectionUptime(name),
      ]);

    const state = await this.getInterfaceState(name);

    // Get gateway metrics if we have a gateway
    let gatewayMetrics = {};
    if (ipInfo.status === 'fulfilled' && ipInfo.value.gateway) {
      gatewayMetrics = await this.getGatewayMetrics(ipInfo.value.gateway);
    }

    return {
      name,
      state,
      ...(ipInfo.status === 'fulfilled' && ipInfo.value),
      ...(macInfo.status === 'fulfilled' && { macAddress: macInfo.value }),
      ...(mtuInfo.status === 'fulfilled' && { mtu: mtuInfo.value }),
      ...(statsInfo.status === 'fulfilled' && statsInfo.value),
      ...(flagsInfo.status === 'fulfilled' && { flags: flagsInfo.value }),
      ...(bcastMcastInfo.status === 'fulfilled' && bcastMcastInfo.value),
      ...(dhcpInfo.status === 'fulfilled' && { dhcpStatus: dhcpInfo.value }),
      ...(uptimeInfo.status === 'fulfilled' && { connectionUptime: uptimeInfo.value }),
      ...gatewayMetrics,
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
    Partial<
      Pick<BaseNetworkInterface, 'ipAddress' | 'ipv6Address' | 'netmask' | 'gateway' | 'dnsServers'>
    >
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
        Pick<
          BaseNetworkInterface,
          'ipAddress' | 'ipv6Address' | 'netmask' | 'gateway' | 'dnsServers'
        >
      > = {};

      // Parse IP address and netmask
      if (ipResult.status === 'fulfilled') {
        const ipMatch = ipResult.value.stdout.match(/inet (\d+\.\d+\.\d+\.\d+)\/(\d+)/);
        if (ipMatch && ipMatch[1] && ipMatch[2]) {
          result.ipAddress = ipMatch[1];
          result.netmask = this.cidrToNetmask(parseInt(ipMatch[2]));
        }

        // Parse IPv6 address
        const ipv6Match = ipResult.value.stdout.match(/inet6 ([a-f0-9:]+)\/\d+/);
        if (ipv6Match && ipv6Match[1]) {
          result.ipv6Address = ipv6Match[1];
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
   * Get interface statistics (RX/TX bytes, packets, errors, dropped)
   */
  private async getInterfaceStats(
    name: string
  ): Promise<
    Partial<
      Pick<
        BaseNetworkInterface,
        | 'rxBytes'
        | 'txBytes'
        | 'rxPackets'
        | 'txPackets'
        | 'rxErrors'
        | 'txErrors'
        | 'rxDropped'
        | 'txDropped'
      >
    >
  > {
    try {
      const stats: Partial<
        Pick<
          BaseNetworkInterface,
          | 'rxBytes'
          | 'txBytes'
          | 'rxPackets'
          | 'txPackets'
          | 'rxErrors'
          | 'txErrors'
          | 'rxDropped'
          | 'txDropped'
        >
      > = {};

      // Try to read individual stat files
      const [
        rxBytesResult,
        txBytesResult,
        rxPacketsResult,
        txPacketsResult,
        rxErrorsResult,
        txErrorsResult,
        rxDroppedResult,
        txDroppedResult,
      ] = await Promise.allSettled([
        execAsync(`cat /sys/class/net/${name}/statistics/rx_bytes`),
        execAsync(`cat /sys/class/net/${name}/statistics/tx_bytes`),
        execAsync(`cat /sys/class/net/${name}/statistics/rx_packets`),
        execAsync(`cat /sys/class/net/${name}/statistics/tx_packets`),
        execAsync(`cat /sys/class/net/${name}/statistics/rx_errors`),
        execAsync(`cat /sys/class/net/${name}/statistics/tx_errors`),
        execAsync(`cat /sys/class/net/${name}/statistics/rx_dropped`),
        execAsync(`cat /sys/class/net/${name}/statistics/tx_dropped`),
      ]);

      if (rxBytesResult.status === 'fulfilled') {
        stats.rxBytes = parseInt(rxBytesResult.value.stdout.trim());
      }
      if (txBytesResult.status === 'fulfilled') {
        stats.txBytes = parseInt(txBytesResult.value.stdout.trim());
      }
      if (rxPacketsResult.status === 'fulfilled') {
        stats.rxPackets = parseInt(rxPacketsResult.value.stdout.trim());
      }
      if (txPacketsResult.status === 'fulfilled') {
        stats.txPackets = parseInt(txPacketsResult.value.stdout.trim());
      }
      if (rxErrorsResult.status === 'fulfilled') {
        stats.rxErrors = parseInt(rxErrorsResult.value.stdout.trim());
      }
      if (txErrorsResult.status === 'fulfilled') {
        stats.txErrors = parseInt(txErrorsResult.value.stdout.trim());
      }
      if (rxDroppedResult.status === 'fulfilled') {
        stats.rxDropped = parseInt(rxDroppedResult.value.stdout.trim());
      }
      if (txDroppedResult.status === 'fulfilled') {
        stats.txDropped = parseInt(txDroppedResult.value.stdout.trim());
      }

      return stats;
    } catch (error) {
      this.logger.warn('Failed to get interface stats', {
        name,
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }

  /**
   * Get routing information for an interface
   */
  private async getInterfaceRoutes(name: string): Promise<RouteInfo[] | undefined> {
    try {
      const { stdout } = await execAsync(`ip route show dev ${name}`);
      const routes: RouteInfo[] = [];

      const lines = stdout.split('\n').filter((line: string) => line.trim());
      for (const line of lines) {
        const parts = line.split(/\s+/);
        if (parts.length >= 2) {
          const route: RouteInfo = {
            destination: parts[0] as string,
            gateway: (parts[2] as string) || 'direct',
          };

          // Parse metric if present
          const metricIndex = parts.indexOf('metric');
          if (metricIndex !== -1 && parts[metricIndex + 1]) {
            route.metric = parseInt(parts[metricIndex + 1] as string);
          }

          routes.push(route);
        }
      }

      return routes.length > 0 ? routes : undefined;
    } catch (error) {
      this.logger.warn('Failed to get interface routes', {
        name,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  /**
   * Get interface flags (UP, RUNNING, BROADCAST, etc.)
   */
  private async getInterfaceFlags(name: string): Promise<InterfaceFlags | undefined> {
    try {
      const { stdout } = await execAsync(`ip link show ${name}`);
      const flags: InterfaceFlags = {};

      // Extract flags from output like: <UP,BROADCAST,RUNNING,MULTICAST>
      const flagsMatch = stdout.match(/<([^>]+)>/);
      if (flagsMatch && flagsMatch[1]) {
        const flagList = flagsMatch[1].split(',');
        for (const flag of flagList) {
          const lowerFlag = flag.toLowerCase();
          if (lowerFlag === 'up') flags.up = true;
          if (lowerFlag === 'broadcast') flags.broadcast = true;
          if (lowerFlag === 'running') flags.running = true;
          if (lowerFlag === 'multicast') flags.multicast = true;
          if (lowerFlag === 'loopback') flags.loopback = true;
          if (lowerFlag === 'pointopoint') flags.pointToPoint = true;
          if (lowerFlag === 'noarp') flags.noarp = true;
          if (lowerFlag === 'promisc') flags.promisc = true;
          if (lowerFlag === 'allmulti') flags.allmulti = true;
          if (lowerFlag === 'master') flags.master = true;
          if (lowerFlag === 'slave') flags.slave = true;
          if (lowerFlag === 'debug') flags.debug = true;
          if (lowerFlag === 'dormant') flags.dormant = true;
          if (lowerFlag === 'simplex') flags.simplex = true;
          if (lowerFlag === 'lower_up') flags.lower_up = true;
          if (lowerFlag === 'lower_down') flags.lower_down = true;
        }
      }

      return Object.keys(flags).length > 0 ? flags : undefined;
    } catch (error) {
      this.logger.warn('Failed to get interface flags', {
        name,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  /**
   * Get broadcast and multicast packet statistics
   */
  private async getBroadcastMulticastStats(
    name: string
  ): Promise<{ broadcastPackets?: number; multicastPackets?: number }> {
    try {
      const [_bcastResult, mcastResult] = await Promise.allSettled([
        execAsync(`cat /sys/class/net/${name}/statistics/rx_packets 2>/dev/null`),
        execAsync(`cat /sys/class/net/${name}/statistics/multicast 2>/dev/null`),
      ]);

      const stats: { broadcastPackets?: number; multicastPackets?: number } = {};

      // Try to get broadcast packets from /proc/net/dev
      try {
        const { stdout } = await execAsync(`grep ${name} /proc/net/dev`);
        const parts = stdout.split(/\s+/);
        if (parts.length > 8) {
          // Broadcast packets are typically in a specific column
          stats.broadcastPackets = parseInt(parts[8] as string);
        }
      } catch {
        // Ignore if not available
      }

      if (mcastResult.status === 'fulfilled') {
        stats.multicastPackets = parseInt(mcastResult.value.stdout.trim());
      }

      return stats;
    } catch (error) {
      this.logger.warn('Failed to get broadcast/multicast stats', {
        name,
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }

  /**
   * Check DHCP status for an interface
   */
  private async checkDhcpStatus(name: string): Promise<boolean> {
    try {
      // Check if dhclient is running for this interface
      const { stdout } = await execAsync(`ps aux | grep dhclient | grep ${name} | grep -v grep`);
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get connection uptime for an interface
   */
  private async getConnectionUptime(name: string): Promise<number | undefined> {
    try {
      // Get interface creation time from /sys/class/net/{name}/
      const { stdout } = await execAsync(`stat -c %Y /sys/class/net/${name}`);
      const creationTime = parseInt(stdout.trim());
      const currentTime = Math.floor(Date.now() / 1000);
      return Math.max(0, currentTime - creationTime);
    } catch {
      return undefined;
    }
  }

  /**
   * Get latency and packet loss to gateway
   */
  private async getGatewayMetrics(
    gateway: string | undefined
  ): Promise<{ latency?: number; packetLoss?: number }> {
    if (!gateway) {
      return {};
    }

    try {
      // Ping gateway 4 times with 1 second timeout
      const { stdout } = await execAsync(`ping -c 4 -W 1 ${gateway} 2>/dev/null || true`);

      const metrics: { latency?: number; packetLoss?: number } = {};

      // Extract average latency
      const avgMatch = stdout.match(/min\/avg\/max\/stddev = [\d.]+\/([\d.]+)\/[\d.]+\/[\d.]+/);
      if (avgMatch && avgMatch[1]) {
        metrics.latency = parseFloat(avgMatch[1]);
      }

      // Extract packet loss
      const lossMatch = stdout.match(/(\d+(?:\.\d+)?)% packet loss/);
      if (lossMatch && lossMatch[1]) {
        metrics.packetLoss = parseFloat(lossMatch[1]);
      }

      return metrics;
    } catch (error) {
      this.logger.debug('Failed to get gateway metrics', {
        gateway,
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
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
        bridgeInfo.interfaces = interfaceMatches.map((match: string) => match.trim());
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
    const [speedResult, duplexResult, driverResult, linkResult, autoNegResult, ethtoolFullResult] =
      await Promise.allSettled([
        execAsync(`ethtool ${name} 2>/dev/null | grep Speed`),
        execAsync(`ethtool ${name} 2>/dev/null | grep Duplex`),
        execAsync(`readlink /sys/class/net/${name}/device/driver 2>/dev/null`),
        execAsync(`ethtool ${name} 2>/dev/null | grep "Link detected"`),
        execAsync(`ethtool ${name} 2>/dev/null | grep "Auto-negotiation"`),
        execAsync(`ethtool ${name} 2>/dev/null`),
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

    // Parse auto-negotiation
    if (autoNegResult.status === 'fulfilled') {
      ethernetInfo.autoNegotiation = autoNegResult.value.stdout.includes('on');
    }

    // Parse full ethtool output for advanced features
    if (ethtoolFullResult.status === 'fulfilled') {
      const ethtoolOutput = ethtoolFullResult.value.stdout;

      // Power management
      const pmMatch = ethtoolOutput.match(/Power Management: (on|off)/i);
      if (pmMatch && pmMatch[1]) {
        ethernetInfo.powerManagement = pmMatch[1].toLowerCase();
      }

      // Offload features
      ethernetInfo.offloadFeatures = {
        tso: ethtoolOutput.includes('tcp-segmentation-offload') && ethtoolOutput.includes('on'),
        gso: ethtoolOutput.includes('generic-segmentation-offload') && ethtoolOutput.includes('on'),
        gro: ethtoolOutput.includes('generic-receive-offload') && ethtoolOutput.includes('on'),
        lro: ethtoolOutput.includes('large-receive-offload') && ethtoolOutput.includes('on'),
        rxvlan: ethtoolOutput.includes('rx-vlan-offload') && ethtoolOutput.includes('on'),
        txvlan: ethtoolOutput.includes('tx-vlan-offload') && ethtoolOutput.includes('on'),
      };

      // Wake-on-LAN
      const wolMatch = ethtoolOutput.match(/Wake-on: ([a-z])/i);
      if (wolMatch && wolMatch[1]) {
        ethernetInfo.wakeOnLan = wolMatch[1].toLowerCase() !== 'd';
      }
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

    const [iwConfigResult, iwInfoResult, clientsCountResult, clientsDetailResult, linkResult] =
      await Promise.allSettled([
        execAsync(`iwconfig ${name} 2>/dev/null`),
        execAsync(`iw dev ${name} info 2>/dev/null`),
        execAsync(`iw dev ${name} station dump 2>/dev/null | grep Station | wc -l`),
        execAsync(`iw dev ${name} station dump 2>/dev/null`),
        execAsync(`iw dev ${name} link 2>/dev/null`),
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

      // Noise level
      const noiseMatch = iwconfig.match(/Noise level=(-?\d+) dBm/);
      if (noiseMatch && noiseMatch[1]) {
        wifiInfo.noiseLevel = parseInt(noiseMatch[1]);
      }

      // Link quality
      const qualityMatch = iwconfig.match(/Link Quality[=:](\d+)\/(\d+)/);
      if (qualityMatch && qualityMatch[1] && qualityMatch[2]) {
        wifiInfo.linkQuality = Math.round(
          (parseInt(qualityMatch[1]) / parseInt(qualityMatch[2])) * 100
        );
      }

      // Bit rate
      const bitRateMatch = iwconfig.match(/Bit Rate[=:]([^\n]+)/);
      if (bitRateMatch && bitRateMatch[1]) {
        wifiInfo.bitRate = bitRateMatch[1].trim();
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

    // Parse link information (BSSID for connected networks)
    if (linkResult.status === 'fulfilled') {
      const linkInfo = linkResult.value.stdout;

      // BSSID (MAC address of connected AP)
      const bssidMatch = linkInfo.match(/Connected to ([a-f0-9:]{17})/i);
      if (bssidMatch && bssidMatch[1]) {
        wifiInfo.bssid = bssidMatch[1];
      }
    }

    // Parse iwconfig output for advanced metrics
    if (iwConfigResult.status === 'fulfilled') {
      const iwconfig = iwConfigResult.value.stdout;

      // TX Power
      const txPowerMatch = iwconfig.match(/Tx-Power[=:]([^\n]+)/);
      if (txPowerMatch && txPowerMatch[1]) {
        wifiInfo.txPower = txPowerMatch[1].trim();
      }

      // Supported rates
      const ratesMatch = iwconfig.match(/Bit Rates[=:]([^\n]+)/);
      if (ratesMatch && ratesMatch[1]) {
        wifiInfo.supportedRates = ratesMatch[1]
          .split(/\s+/)
          .filter((rate: string) => rate.match(/\d+/))
          .map((rate: string) => rate.trim());
      }

      // Roaming capability
      wifiInfo.roamingCapability = !iwconfig.includes('Roaming:off');
    }

    // Parse iw output for advanced metrics
    if (iwInfoResult.status === 'fulfilled') {
      const iwinfo = iwInfoResult.value.stdout;

      // Channel width
      const widthMatch = iwinfo.match(/channel width: (\d+MHz)/i);
      if (widthMatch && widthMatch[1]) {
        wifiInfo.channelWidth = widthMatch[1];
      }

      // Beacon interval
      const beaconMatch = iwinfo.match(/beacon interval: (\d+)/i);
      if (beaconMatch && beaconMatch[1]) {
        wifiInfo.beaconInterval = parseInt(beaconMatch[1]);
      }

      // DTIM period
      const dtimMatch = iwinfo.match(/dtim period: (\d+)/i);
      if (dtimMatch && dtimMatch[1]) {
        wifiInfo.dtimPeriod = parseInt(dtimMatch[1]);
      }
    }

    // Get regulatory domain
    try {
      const { stdout: regOutput } = await execAsync(
        `iw reg get 2>/dev/null | grep country | head -1`
      );
      const countryMatch = regOutput.match(/country ([A-Z]{2})/);
      if (countryMatch && countryMatch[1]) {
        wifiInfo.regulatoryDomain = countryMatch[1];
      }
    } catch {
      // Ignore if not available
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

        // Parse peers with comprehensive information
        if (status.Peer) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tailscaleInfo.peers = Object.values(status.Peer).map((peer: any) => ({
            id: peer.ID || '',
            publicKey: peer.PublicKey || '',
            hostname: peer.HostName || '',
            dnsName: peer.DNSName || '',
            os: peer.OS || '',
            userId: peer.UserID || 0,
            tailscaleIPs: peer.TailscaleIPs || [],
            allowedIPs: peer.AllowedIPs || [],
            tags: peer.Tags || undefined,
            addrs: peer.Addrs || undefined,
            curAddr: peer.CurAddr || undefined,
            relay: peer.Relay || undefined,
            peerRelay: peer.PeerRelay || undefined,
            rxBytes: peer.RxBytes || 0,
            txBytes: peer.TxBytes || 0,
            created: peer.Created || '',
            lastWrite: peer.LastWrite || undefined,
            lastSeen: peer.LastSeen || undefined,
            lastHandshake: peer.LastHandshake || undefined,
            online: peer.Online || false,
            exitNode: peer.ExitNode || false,
            exitNodeOption: peer.ExitNodeOption || false,
            active: peer.Active || false,
            peerAPIURL: peer.PeerAPIURL || undefined,
            taildropTarget: peer.TaildropTarget || undefined,
            noFileSharingReason: peer.NoFileSharingReason || undefined,
            sshHostKeys: peer.sshHostKeys || undefined,
            capabilities: peer.Capabilities || undefined,
            capMap: peer.CapMap || undefined,
            inNetworkMap: peer.InNetworkMap || false,
            inMagicSock: peer.InMagicSock || false,
            inEngine: peer.InEngine || false,
            expired: peer.Expired || undefined,
            keyExpiry: peer.KeyExpiry || undefined,
            primaryRoutes: peer.PrimaryRoutes || undefined,
            // Legacy/computed fields
            ipAddress: peer.TailscaleIPs?.[0] || '',
            subnetRoutes: peer.PrimaryRoutes || undefined,
            sshEnabled: peer.sshHostKeys && peer.sshHostKeys.length > 0,
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
        hotspotWifi.maxClients = parseInt(hostapdConfig.max_num_sta);
      }

      if (hostapdConfig.ignore_broadcast_ssid === '1') {
        hotspotWifi.hidden = true;
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
    runtimeInfo?: {
      type?: string;
      channel?: number;
      txpower?: number;
      macAddress?: string;
    };
  }> {
    const config = this.readHostapdConfig();

    try {
      // Check if hostapd is running
      const { stdout: psOutput } = await execAsync('ps aux | grep "[h]ostapd" || true');
      const isRunning = psOutput.trim().length > 0;

      let activeInterface: string | undefined;
      let actualSSID: string | undefined;
      let connectedClients: number | undefined;
      let runtimeInfo:
        | {
            type?: string;
            channel?: number;
            txpower?: number;
            macAddress?: string;
          }
        | undefined;

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
  private parseIwInfo(iwOutput: string): {
    type?: string;
    channel?: number;
    txpower?: number;
    macAddress?: string;
  } {
    const info: {
      type?: string;
      channel?: number;
      txpower?: number;
      macAddress?: string;
    } = {};

    const lines = iwOutput.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();

      // Parse various fields
      if (trimmed.includes('type ')) {
        const typeMatch = trimmed.match(/type (\w+)/);
        if (typeMatch && typeMatch[1]) info.type = typeMatch[1];
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
        if (addrMatch && addrMatch[1]) info.macAddress = addrMatch[1];
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
    const systemdMatch = output.match(/DNS Servers:\s*([\d.\s]+)/);
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

      const status: {
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
      } = {
        isConfigured: Object.keys(config).length > 0,
        isRunning: hostapdInfo.isRunning,
      };

      // Add configuration information
      if (config.interface) {
        status.configuredInterface = config.interface;
      }

      if (config.ssid) {
        status.ssid = config.ssid;
      }

      if (config.channel) {
        status.channel = parseInt(config.channel);
      }

      if (config.wpa) {
        status.security = config.wpa === '3' ? 'WPA3' : 'WPA2';
      }

      if (config.country_code) {
        status.countryCode = config.country_code;
      }

      if (config.max_num_sta) {
        status.maxClients = parseInt(config.max_num_sta);
      }

      if (config.ignore_broadcast_ssid === '1') {
        status.hidden = true;
      }

      // Add runtime information if available
      if (hostapdInfo.isRunning) {
        if (hostapdInfo.activeInterface) {
          status.activeInterface = hostapdInfo.activeInterface;
        }

        if (hostapdInfo.actualSSID) {
          status.actualSSID = hostapdInfo.actualSSID;
        }

        if (hostapdInfo.connectedClients !== undefined) {
          status.connectedClients = hostapdInfo.connectedClients;
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
