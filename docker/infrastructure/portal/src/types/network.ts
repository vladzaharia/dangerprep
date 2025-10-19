/**
 * Network interface type definitions
 */

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
  type:
    | 'ethernet'
    | 'wifi'
    | 'tailscale'
    | 'bridge'
    | 'virtual'
    | 'hotspot'
    | 'loopback'
    | 'unknown';
  purpose: 'wan' | 'lan' | 'wlan' | 'docker' | 'loopback' | 'unknown';
  state: 'up' | 'down' | 'unknown';
  ipAddress?: string;
  ipv6Address?: string;
  gateway?: string;
  netmask?: string;
  dnsServers?: string[];
  macAddress?: string;
  mtu?: number;
  // Interface flags
  flags?: InterfaceFlags;
  // ISP information (for WAN interfaces)
  ispName?: string;
  publicIpv4?: string;
  publicIpv6?: string;
  // WAN-specific metrics
  dhcpStatus?: boolean;
  connectionUptime?: number; // in seconds
  latencyToGateway?: number; // in milliseconds
  packetLoss?: number; // percentage
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
  routes?: RouteInfo[];
}

/**
 * Ethernet interface information
 */
export interface EthernetInterface extends BaseNetworkInterface {
  type: 'ethernet';
  speed?: string;
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
}

/**
 * Connected client information for WiFi hotspots
 */
export interface ConnectedClient {
  macAddress: string;
  ipAddress?: string;
  hostname?: string;
  signalStrength?: number; // dBm
  connectedTime?: string; // duration or timestamp
  txRate?: string;
  rxRate?: string;
}

/**
 * WiFi interface information
 */
export interface WiFiInterface extends BaseNetworkInterface {
  type: 'wifi';
  ssid?: string;
  signalStrength?: number;
  frequency?: string;
  channel?: number;
  security?: string;
  mode?: 'managed' | 'ap' | 'monitor' | 'unknown';
  password?: string; // For AP mode (hotspot) only
  connectedClients?: ConnectedClient[]; // For AP mode - detailed client information
  maxClients?: number; // For AP mode - maximum number of clients
  hidden?: boolean; // For AP mode - whether SSID is hidden
  bssid?: string;
  linkQuality?: number;
  noiseLevel?: number;
  bitRate?: string;
  txPower?: string;
  channelWidth?: string;
  regulatoryDomain?: string;
  supportedRates?: string[];
  beaconInterval?: number;
  dtimPeriod?: number;
  roamingCapability?: boolean;
}

/**
 * Tailscale peer information (comprehensive)
 */
export interface TailscalePeer {
  id: string;
  publicKey: string;
  hostname: string;
  dnsName: string;
  os: string;
  userId: number;
  tailscaleIPs: string[];
  allowedIPs: string[];
  tags?: string[];
  addrs?: string[];
  curAddr?: string;
  relay?: string;
  peerRelay?: string;
  rxBytes: number;
  txBytes: number;
  created: string;
  lastWrite?: string;
  lastSeen?: string;
  lastHandshake?: string;
  online: boolean;
  exitNode: boolean;
  exitNodeOption: boolean;
  active: boolean;
  peerAPIURL?: string[];
  taildropTarget?: number;
  noFileSharingReason?: string;
  sshHostKeys?: string[];
  capabilities?: string[];
  capMap?: Record<string, unknown>;
  inNetworkMap: boolean;
  inMagicSock: boolean;
  inEngine: boolean;
  expired?: boolean;
  keyExpiry?: string;
  primaryRoutes?: string[];
  // Legacy/computed fields for backward compatibility
  ipAddress: string; // First Tailscale IP
  subnetRoutes?: string[]; // Alias for primaryRoutes
  sshEnabled?: boolean; // Computed from sshHostKeys
}

/**
 * Tailscale exit node information
 */
export interface TailscaleExitNode {
  id: string;
  name: string;
  location?: string;
  online: boolean;
  suggested?: boolean;
}

/**
 * Tailscale settings
 */
export interface TailscaleSettings {
  running: boolean;
  acceptDNS: boolean;
  acceptRoutes: boolean;
  ssh: boolean;
  exitNode: string | null;
  exitNodeAllowLAN: boolean;
  advertiseExitNode: boolean;
  advertiseRoutes: string[];
  shieldsUp: boolean;
  advertiseConnector: boolean;
  snatSubnetRoutes: boolean;
  statefulFiltering: boolean;
  // Additional status information
  version?: string;
  backendState?: string;
  health?: string[];
  certDomains?: string[];
  latestVersion?: string;
  tailnetDisplayName?: string;
}

/**
 * Tailscale self node information
 */
export interface TailscaleSelf {
  id: string;
  publicKey: string;
  hostname: string;
  dnsName: string;
  os: string;
  userId: number;
  tailscaleIPs: string[];
  allowedIPs: string[];
  addrs: string[];
  curAddr?: string;
  relay?: string;
  peerRelay?: string;
  rxBytes: number;
  txBytes: number;
  created: string;
  lastWrite?: string;
  lastSeen?: string;
  lastHandshake?: string;
  online: boolean;
  exitNode: boolean;
  exitNodeOption: boolean;
  active: boolean;
  peerAPIURL?: string[];
  taildropTarget?: number;
  noFileSharingReason?: string;
  capabilities?: string[];
  capMap?: Record<string, unknown>;
  inNetworkMap: boolean;
  inMagicSock: boolean;
  inEngine: boolean;
  keyExpiry?: string;
}

/**
 * Tailscale tailnet information
 */
export interface TailscaleTailnet {
  name: string;
  magicDNSSuffix: string;
  magicDNSEnabled: boolean;
}

/**
 * Tailscale user information
 */
export interface TailscaleUser {
  id: number;
  loginName: string;
  displayName: string;
}

/**
 * Tailscale full status
 */
export interface TailscaleStatus {
  version: string;
  tun: boolean;
  backendState: string;
  haveNodeKey: boolean;
  authURL?: string;
  tailscaleIPs: string[];
  self: TailscaleSelf;
  health: string[];
  magicDNSSuffix: string;
  currentTailnet?: TailscaleTailnet;
  certDomains?: string[];
  clientVersion?: {
    latestVersion: string;
  };
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
  exitNode?: boolean; // Currently using an exit node
  exitNodeId?: string; // ID of current exit node
  routeAdvertising?: string[];
  // Current settings
  acceptDNS?: boolean;
  acceptRoutes?: boolean;
  sshEnabled?: boolean;
  shieldsUp?: boolean;
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
export type NetworkInterface =
  | EthernetInterface
  | WiFiInterface
  | TailscaleInterface
  | HotspotInterface
  | BaseNetworkInterface;

/**
 * Network summary for listing interfaces
 */
export interface NetworkSummary {
  interfaces: NetworkInterface[];
  internetInterface?: string;
  hotspotInterface?: string;
  tailscaleInterface?: string;
  totalInterfaces: number;
}
