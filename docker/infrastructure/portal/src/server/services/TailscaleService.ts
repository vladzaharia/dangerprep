import { exec } from 'child_process';
import { promisify } from 'util';

import { LoggerFactory, LogLevel } from '@dangerprep/logging';

import type { TailscaleSettings, TailscaleExitNode } from '../../types/network';

const execAsync = promisify(exec);

/**
 * Service for managing Tailscale configuration and settings
 * Handles getting/setting exit nodes, DNS, routes, SSH, and other Tailscale preferences
 */
export class TailscaleService {
  private logger = LoggerFactory.createStructuredLogger(
    'TailscaleService',
    '/var/log/dangerprep/portal.log',
    process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO
  );

  /**
   * Get current Tailscale settings
   */
  async getSettings(): Promise<TailscaleSettings> {
    this.logger.debug('Getting Tailscale settings');

    try {
      // Get status to parse current settings
      const { stdout } = await execAsync('tailscale status --json 2>/dev/null');
      const status = JSON.parse(stdout);

      // Parse settings from status
      // BackendState can be: Running, Stopped, NeedsLogin, NeedsMachineAuth, etc.
      const running = status.BackendState === 'Running';

      // Try to get exitNodeAllowLAN from Prefs if available, otherwise check CapMap
      let exitNodeAllowLAN = false;
      if (status.Self?.Prefs?.ExitNodeAllowLANAccess !== undefined) {
        exitNodeAllowLAN = status.Self.Prefs.ExitNodeAllowLANAccess;
      } else if (status.Prefs?.ExitNodeAllowLANAccess !== undefined) {
        exitNodeAllowLAN = status.Prefs.ExitNodeAllowLANAccess;
      } else if (status.Self?.CapMap?.['exit-node-allow-lan-access'] !== undefined) {
        exitNodeAllowLAN = status.Self.CapMap['exit-node-allow-lan-access'];
      }

      const settings: TailscaleSettings = {
        running,
        acceptDNS: status.Self?.CapMap?.['accept-dns'] !== false,
        acceptRoutes: status.Self?.CapMap?.['accept-routes'] !== false,
        ssh: status.Self?.CapMap?.ssh !== false,
        exitNode: status.ExitNodeStatus?.TailscaleIPs?.[0] || null,
        exitNodeAllowLAN,
        advertiseExitNode: status.Self?.CapMap?.['advertise-exit-node'] !== false,
        advertiseRoutes: status.Self?.PrimaryRoutes || [],
        shieldsUp: status.Self?.CapMap?.['shields-up'] !== false,
        advertiseConnector: status.Self?.CapMap?.['advertise-connector'] !== false,
        snatSubnetRoutes: status.Self?.CapMap?.['snat-subnet-routes'] !== false,
        statefulFiltering: status.Self?.CapMap?.['stateful-filtering'] !== false,
      };

      this.logger.debug('Tailscale settings retrieved', { settings });
      return settings;
    } catch (error) {
      this.logger.error('Failed to get Tailscale settings', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error('Failed to get Tailscale settings');
    }
  }

  /**
   * Get available exit nodes
   */
  async getExitNodes(): Promise<TailscaleExitNode[]> {
    this.logger.debug('Getting available exit nodes');

    try {
      // Try to use exit-node list command (available in newer versions)
      try {
        const { stdout } = await execAsync('tailscale exit-node list --json 2>/dev/null');
        const exitNodes = JSON.parse(stdout);

        this.logger.debug('Exit nodes retrieved from list command', {
          count: exitNodes.length,
        });

        return exitNodes.map(
          (node: {
            ID?: string;
            TailscaleIPs?: string[];
            Name?: string;
            HostName?: string;
            Location?: string;
            Online?: boolean;
          }) => ({
            id: node.ID || node.TailscaleIPs?.[0] || '',
            name: node.Name || node.HostName || '',
            location: node.Location,
            online: node.Online !== false,
            suggested: false,
          })
        );
      } catch {
        // Fallback: parse from status
        const { stdout } = await execAsync('tailscale status --json 2>/dev/null');
        const status = JSON.parse(stdout);

        const exitNodes: TailscaleExitNode[] = [];

        if (status.Peer) {
          type TailscalePeerRaw = {
            ExitNodeOption?: boolean;
            TailscaleIPs?: string[];
            ID?: string;
            HostName?: string;
            DNSName?: string;
            Online?: boolean;
          };

          (Object.values(status.Peer) as TailscalePeerRaw[]).forEach(peer => {
            if (peer.ExitNodeOption) {
              exitNodes.push({
                id: peer.TailscaleIPs?.[0] || peer.ID || '',
                name: peer.HostName || peer.DNSName || '',
                online: peer.Online !== false,
                suggested: false,
              });
            }
          });
        }

        this.logger.debug('Exit nodes retrieved from status', {
          count: exitNodes.length,
        });

        return exitNodes;
      }
    } catch (error) {
      this.logger.error('Failed to get exit nodes', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get suggested exit node
   */
  async getSuggestedExitNode(): Promise<TailscaleExitNode | null> {
    this.logger.debug('Getting suggested exit node');

    try {
      const { stdout } = await execAsync('tailscale exit-node suggest 2>/dev/null');

      // Parse the output (format varies, may need adjustment)
      const lines = stdout.trim().split('\n');
      if (lines.length > 0 && lines[0]) {
        const match = lines[0].match(/(\S+)\s+\(([^)]+)\)/);
        if (match && match[1] && match[2]) {
          return {
            id: match[1],
            name: match[1],
            location: match[2],
            online: true,
            suggested: true,
          };
        }
      }

      return null;
    } catch (error) {
      this.logger.warn('Failed to get suggested exit node', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Set exit node
   */
  async setExitNode(nodeId: string | null): Promise<{ success: boolean; message: string }> {
    this.logger.info('Setting exit node', { nodeId });

    try {
      const command = nodeId ? `tailscale set --exit-node=${nodeId}` : 'tailscale set --exit-node=';

      await execAsync(command);

      this.logger.info('Exit node set successfully', { nodeId });
      return {
        success: true,
        message: nodeId ? `Exit node set to ${nodeId}` : 'Exit node disabled',
      };
    } catch (error) {
      this.logger.error('Failed to set exit node', {
        nodeId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        message: `Failed to set exit node: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Set exit node allow LAN access
   */
  async setExitNodeAllowLAN(allow: boolean): Promise<{ success: boolean; message: string }> {
    this.logger.info('Setting exit node LAN access', { allow });

    try {
      const command = `tailscale set --exit-node-allow-lan-access=${allow}`;
      await execAsync(command);

      this.logger.info('Exit node LAN access set successfully', { allow });
      return {
        success: true,
        message: `Exit node LAN access ${allow ? 'enabled' : 'disabled'}`,
      };
    } catch (error) {
      this.logger.error('Failed to set exit node LAN access', {
        allow,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        message: `Failed to set exit node LAN access: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Set accept DNS
   */
  async setAcceptDNS(accept: boolean): Promise<{ success: boolean; message: string }> {
    this.logger.info('Setting accept DNS', { accept });

    try {
      const command = `tailscale set --accept-dns=${accept}`;
      await execAsync(command);

      this.logger.info('Accept DNS set successfully', { accept });
      return {
        success: true,
        message: `DNS ${accept ? 'enabled' : 'disabled'}`,
      };
    } catch (error) {
      this.logger.error('Failed to set accept DNS', {
        accept,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        message: `Failed to set accept DNS: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Set accept routes
   */
  async setAcceptRoutes(accept: boolean): Promise<{ success: boolean; message: string }> {
    this.logger.info('Setting accept routes', { accept });

    try {
      const command = `tailscale set --accept-routes=${accept}`;
      await execAsync(command);

      this.logger.info('Accept routes set successfully', { accept });
      return {
        success: true,
        message: `Routes ${accept ? 'enabled' : 'disabled'}`,
      };
    } catch (error) {
      this.logger.error('Failed to set accept routes', {
        accept,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        message: `Failed to set accept routes: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Set SSH
   */
  async setSSH(enabled: boolean): Promise<{ success: boolean; message: string }> {
    this.logger.info('Setting SSH', { enabled });

    try {
      const command = enabled ? 'tailscale set --ssh' : 'tailscale set --ssh=false';
      await execAsync(command);

      this.logger.info('SSH set successfully', { enabled });
      return {
        success: true,
        message: `SSH ${enabled ? 'enabled' : 'disabled'}`,
      };
    } catch (error) {
      this.logger.error('Failed to set SSH', {
        enabled,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        message: `Failed to set SSH: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Set advertise exit node
   */
  async setAdvertiseExitNode(advertise: boolean): Promise<{ success: boolean; message: string }> {
    this.logger.info('Setting advertise exit node', { advertise });

    try {
      const command = `tailscale set --advertise-exit-node=${advertise}`;
      await execAsync(command);

      this.logger.info('Advertise exit node set successfully', { advertise });
      return {
        success: true,
        message: `Exit node advertising ${advertise ? 'enabled' : 'disabled'}`,
      };
    } catch (error) {
      this.logger.error('Failed to set advertise exit node', {
        advertise,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        message: `Failed to set advertise exit node: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Set shields up
   */
  async setShieldsUp(enabled: boolean): Promise<{ success: boolean; message: string }> {
    this.logger.info('Setting shields up', { enabled });

    try {
      const command = `tailscale set --shields-up=${enabled}`;
      await execAsync(command);

      this.logger.info('Shields up set successfully', { enabled });
      return {
        success: true,
        message: `Shields up ${enabled ? 'enabled' : 'disabled'}`,
      };
    } catch (error) {
      this.logger.error('Failed to set shields up', {
        enabled,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        message: `Failed to set shields up: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Start Tailscale (tailscale up)
   */
  async startTailscale(): Promise<{ success: boolean; message: string }> {
    this.logger.info('Starting Tailscale');

    try {
      await execAsync('tailscale up');

      this.logger.info('Tailscale started successfully');
      return {
        success: true,
        message: 'Tailscale started successfully',
      };
    } catch (error) {
      this.logger.error('Failed to start Tailscale', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        message: `Failed to start Tailscale: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Stop Tailscale (tailscale down)
   */
  async stopTailscale(): Promise<{ success: boolean; message: string }> {
    this.logger.info('Stopping Tailscale');

    try {
      await execAsync('tailscale down');

      this.logger.info('Tailscale stopped successfully');
      return {
        success: true,
        message: 'Tailscale stopped successfully',
      };
    } catch (error) {
      this.logger.error('Failed to stop Tailscale', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        message: `Failed to stop Tailscale: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Update multiple settings at once
   */
  async updateSettings(
    settings: Partial<TailscaleSettings>
  ): Promise<{ success: boolean; message: string }> {
    this.logger.info('Updating Tailscale settings', settings);

    try {
      const flags: string[] = [];

      if (settings.exitNode !== undefined) {
        flags.push(`--exit-node=${settings.exitNode || ''}`);
      }
      if (settings.exitNodeAllowLAN !== undefined) {
        flags.push(`--exit-node-allow-lan-access=${settings.exitNodeAllowLAN}`);
      }
      if (settings.acceptDNS !== undefined) {
        flags.push(`--accept-dns=${settings.acceptDNS}`);
      }
      if (settings.acceptRoutes !== undefined) {
        flags.push(`--accept-routes=${settings.acceptRoutes}`);
      }
      if (settings.ssh !== undefined) {
        flags.push(settings.ssh ? '--ssh' : '--ssh=false');
      }
      if (settings.advertiseExitNode !== undefined) {
        flags.push(`--advertise-exit-node=${settings.advertiseExitNode}`);
      }
      if (settings.shieldsUp !== undefined) {
        flags.push(`--shields-up=${settings.shieldsUp}`);
      }
      if (settings.advertiseRoutes !== undefined) {
        flags.push(`--advertise-routes=${settings.advertiseRoutes.join(',')}`);
      }
      if (settings.advertiseConnector !== undefined) {
        flags.push(`--advertise-connector=${settings.advertiseConnector}`);
      }
      if (settings.snatSubnetRoutes !== undefined) {
        flags.push(`--snat-subnet-routes=${settings.snatSubnetRoutes}`);
      }
      if (settings.statefulFiltering !== undefined) {
        flags.push(`--stateful-filtering=${settings.statefulFiltering}`);
      }

      if (flags.length === 0) {
        return {
          success: true,
          message: 'No settings to update',
        };
      }

      const command = `tailscale set ${flags.join(' ')}`;
      await execAsync(command);

      this.logger.info('Settings updated successfully', settings);
      return {
        success: true,
        message: 'Settings updated successfully',
      };
    } catch (error) {
      this.logger.error('Failed to update settings', {
        settings,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        message: `Failed to update settings: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
