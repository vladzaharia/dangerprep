import * as si from 'systeminformation';
import Docker from 'dockerode';
import { readFileSync } from 'fs';
import { SystemInfo, DockerService, StorageInfo, NetworkInfo } from '@/types/system';

const docker = new Docker({ socketPath: process.env.DOCKER_HOST || '/var/run/docker.sock' });

export async function getSystemInfo(): Promise<SystemInfo> {
  try {
    const [time, currentLoad, mem, osInfo] = await Promise.all([
      si.time(),
      si.currentLoad(),
      si.mem(),
      si.osInfo()
    ]);

    // Get temperature if available
    let temperature = 'N/A';
    try {
      const hostSysPath = process.env.HOST_SYS_PATH || '/host/sys';
      const tempData = readFileSync(`${hostSysPath}/class/thermal/thermal_zone0/temp`, 'utf8');
      temperature = `${Math.floor(parseInt(tempData.trim()) / 1000)}°C`;
    } catch (e) {
      // Temperature not available
    }

    // Format uptime
    const uptimeHours = Math.floor(time.uptime / 3600);
    const uptimeMinutes = Math.floor((time.uptime % 3600) / 60);
    const uptime = `${uptimeHours}h ${uptimeMinutes}m`;

    return {
      hostname: osInfo.hostname,
      uptime,
      load_avg: [
        currentLoad.avgLoad.toFixed(2),
        currentLoad.currentLoad.toFixed(2),
        '0.00' // Placeholder for 15min average
      ],
      memory: {
        total: mem.total,
        available: mem.available,
        percent: ((mem.used / mem.total) * 100),
        used: mem.used
      },
      temperature,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    throw new Error(`Failed to get system info: ${error}`);
  }
}

export async function getDockerServices(): Promise<{ services: DockerService[] }> {
  try {
    const containers = await docker.listContainers({ all: true });
    
    const services: DockerService[] = containers
      .filter(container => {
        // Only include DangerPrep services
        const name = container.Names[0]?.replace('/', '') || '';
        return ['traefik', 'jellyfin', 'komga', 'kiwix', 'portal', 'sync', 'portainer', 'watchtower'].some(
          service => name.includes(service)
        );
      })
      .map(container => ({
        name: container.Names[0]?.replace('/', '') || 'unknown',
        status: container.State,
        image: container.Image,
        created: new Date(container.Created * 1000).toISOString(),
        ports: container.Ports.reduce((acc, port) => {
          if (port.PublicPort) {
            acc[`${port.PrivatePort}/${port.Type}`] = port.PublicPort;
          }
          return acc;
        }, {} as Record<string, any>),
        health: container.Status.includes('healthy') ? 'healthy' : 
                container.Status.includes('unhealthy') ? 'unhealthy' : 'unknown'
      }));

    return { services };
  } catch (error) {
    throw new Error(`Failed to get Docker services: ${error}`);
  }
}

export async function getStorageInfo(): Promise<StorageInfo> {
  try {
    const fsSize = await si.fsSize();
    
    const partitions = fsSize
      .filter(fs => fs.fs.startsWith('/dev') || fs.mount === '/')
      .map(fs => ({
        device: fs.fs,
        mountpoint: fs.mount,
        fstype: fs.type,
        total: fs.size,
        used: fs.used,
        free: fs.available,
        percent: fs.use
      }));

    return { partitions };
  } catch (error) {
    throw new Error(`Failed to get storage info: ${error}`);
  }
}

export async function getNetworkInfo(): Promise<NetworkInfo> {
  try {
    const [networkInterfaces, networkStats] = await Promise.all([
      si.networkInterfaces(),
      si.networkStats()
    ]);

    const interfaces = networkInterfaces
      .filter(iface => iface.iface !== 'lo')
      .map(iface => ({
        name: iface.iface,
        addresses: [
          ...(iface.ip4 ? [{
            type: 'IPv4',
            address: iface.ip4,
            netmask: iface.ip4subnet
          }] : []),
          ...(iface.ip6 ? [{
            type: 'IPv6',
            address: iface.ip6,
          }] : [])
        ]
      }));

    const totalStats = networkStats.reduce((acc, stat) => ({
      bytes_sent: acc.bytes_sent + (stat.tx_bytes || 0),
      bytes_recv: acc.bytes_recv + (stat.rx_bytes || 0),
      packets_sent: acc.packets_sent + (stat.tx_packets || 0),
      packets_recv: acc.packets_recv + (stat.rx_packets || 0),
    }), { bytes_sent: 0, bytes_recv: 0, packets_sent: 0, packets_recv: 0 });

    return {
      interfaces,
      stats: totalStats
    };
  } catch (error) {
    throw new Error(`Failed to get network info: ${error}`);
  }
}

export async function controlDockerService(serviceName: string, action: 'start' | 'stop' | 'restart'): Promise<void> {
  try {
    const container = docker.getContainer(serviceName);
    
    switch (action) {
      case 'start':
        await container.start();
        break;
      case 'stop':
        await container.stop();
        break;
      case 'restart':
        await container.restart();
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    throw new Error(`Failed to ${action} service ${serviceName}: ${error}`);
  }
}

export async function getServiceLogs(serviceName: string): Promise<string> {
  try {
    const container = docker.getContainer(serviceName);
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail: 100,
      timestamps: true
    });
    
    return logs.toString();
  } catch (error) {
    throw new Error(`Failed to get logs for ${serviceName}: ${error}`);
  }
}
