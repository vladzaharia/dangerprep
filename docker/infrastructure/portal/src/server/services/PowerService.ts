import { exec } from 'child_process';
import { promisify } from 'util';

import { LoggerFactory, LogLevel } from '@dangerprep/logging';

const execAsync = promisify(exec);

/**
 * Service for managing system power operations
 * Handles kiosk restart, system reboot, shutdown, and desktop mode switching
 */
export class PowerService {
  private logger = LoggerFactory.createConsoleLogger(
    'PowerService',
    process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO
  );

  /**
   * Restart the Firefox kiosk browser
   * Kills the Firefox process and lets the kiosk script restart it automatically
   */
  async restartKiosk(): Promise<{ success: boolean; message: string }> {
    this.logger.info('Restarting Firefox kiosk browser');

    try {
      // Kill Firefox kiosk process
      // The gnome-kiosk-script has a while loop that will automatically restart it
      await execAsync('pkill -f "firefox.*kiosk"');

      this.logger.info('Firefox kiosk process killed, will restart automatically');

      return {
        success: true,
        message: 'Kiosk browser is restarting...',
      };
    } catch (error) {
      this.logger.error('Failed to restart kiosk browser', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // pkill returns non-zero if no process found, which might be okay
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('no process found') || errorMessage.includes('No such process')) {
        this.logger.warn('No Firefox kiosk process found to kill');
        return {
          success: true,
          message: 'No kiosk browser process found. It may already be stopped.',
        };
      }

      return {
        success: false,
        message: `Failed to restart kiosk browser: ${errorMessage}`,
      };
    }
  }

  /**
   * Reboot the system
   * Uses sudo reboot to restart the entire system
   */
  async rebootSystem(): Promise<{ success: boolean; message: string }> {
    this.logger.warn('System reboot requested');

    try {
      // Execute reboot command
      // Note: This will not return as the system will be rebooting
      execAsync('sudo reboot').catch(() => {
        // Ignore errors as the system will be shutting down
      });

      this.logger.info('System reboot initiated');

      return {
        success: true,
        message: 'System is rebooting...',
      };
    } catch (error) {
      this.logger.error('Failed to reboot system', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      return {
        success: false,
        message: `Failed to reboot system: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Shutdown the system
   * Uses sudo shutdown to power off the system
   */
  async shutdownSystem(): Promise<{ success: boolean; message: string }> {
    this.logger.warn('System shutdown requested');

    try {
      // Execute shutdown command
      // Note: This will not return as the system will be shutting down
      execAsync('sudo shutdown -h now').catch(() => {
        // Ignore errors as the system will be shutting down
      });

      this.logger.info('System shutdown initiated');

      return {
        success: true,
        message: 'System is shutting down...',
      };
    } catch (error) {
      this.logger.error('Failed to shutdown system', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      return {
        success: false,
        message: `Failed to shutdown system: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Switch from kiosk mode to desktop mode
   * Runs dp-desktop script and restarts the display manager
   */
  async switchToDesktop(): Promise<{ success: boolean; message: string }> {
    this.logger.info('Switching to desktop mode');

    try {
      // Run dp-desktop script to update session configuration
      await execAsync('sudo /usr/local/bin/dp-desktop');

      this.logger.info('Desktop mode configured, restarting display manager');

      // Restart display manager to apply changes
      // Note: This will kill the current session
      execAsync('sudo systemctl restart gdm3').catch(() => {
        // Ignore errors as the display manager will be restarting
      });

      this.logger.info('Display manager restart initiated');

      return {
        success: true,
        message: 'Switching to desktop mode...',
      };
    } catch (error) {
      this.logger.error('Failed to switch to desktop mode', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      return {
        success: false,
        message: `Failed to switch to desktop mode: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Get current kiosk status
   * Checks if Firefox kiosk process is running
   */
  async getKioskStatus(): Promise<{
    isRunning: boolean;
    processCount: number;
  }> {
    try {
      const { stdout } = await execAsync('pgrep -f "firefox.*kiosk" | wc -l');
      const processCount = parseInt(stdout.trim()) || 0;

      this.logger.debug('Kiosk status checked', { processCount });

      return {
        isRunning: processCount > 0,
        processCount,
      };
    } catch (error) {
      this.logger.warn('Failed to get kiosk status', {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        isRunning: false,
        processCount: 0,
      };
    }
  }
}
