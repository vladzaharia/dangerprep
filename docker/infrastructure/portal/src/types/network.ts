/**
 * Network interface type definitions
 */

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
  gateway?: string;
  netmask?: string;
  dnsServers?: string[];
  macAddress?: string;
  mtu?: number;
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
  exitNodeOption?: boolean; // Can be used as exit node
  sshEnabled?: boolean; // SSH is enabled on this peer
  subnetRoutes?: string[]; // Advertised subnet routes
  relay?: string; // Relay server being used
  tags?: string[]; // Tailscale tags
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
  acceptDNS: boolean;
  acceptRoutes: boolean;
  ssh: boolean;
  exitNode: string | null;
  exitNodeAllowLAN: boolean;
  advertiseExitNode: boolean;
  advertiseRoutes: string[];
  shieldsUp: boolean;
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
