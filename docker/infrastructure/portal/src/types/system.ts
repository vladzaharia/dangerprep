export interface SystemInfo {
  hostname: string;
  uptime: string;
  load_avg: string[];
  memory: {
    total: number;
    available: number;
    percent: number;
    used: number;
  };
  temperature: string;
  timestamp: string;
}

export interface DockerService {
  name: string;
  status: string;
  image: string;
  created: string;
  ports: Record<string, any>;
  health: string;
}

export interface DockerServicesResponse {
  services: DockerService[];
}

export interface StoragePartition {
  device: string;
  mountpoint: string;
  fstype: string;
  total: number;
  used: number;
  free: number;
  percent: number;
}

export interface StorageInfo {
  partitions: StoragePartition[];
}

export interface NetworkInterface {
  name: string;
  addresses: {
    type: string;
    address: string;
    netmask?: string;
  }[];
}

export interface NetworkInfo {
  interfaces: NetworkInterface[];
  stats: {
    bytes_sent: number;
    bytes_recv: number;
    packets_sent: number;
    packets_recv: number;
  };
}

export interface ServiceActionResponse {
  success?: string;
  error?: string;
}

export interface ServiceLogsResponse {
  logs: string;
}

export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
}
