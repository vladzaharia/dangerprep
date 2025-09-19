/**
 * Signal handling utility for graceful shutdown and operation cancellation
 */

export interface CancellationToken {
  isCancelled: boolean;
  onCancel: (callback: () => void) => void;
  throwIfCancelled: () => void;
}

export class SignalHandler {
  private static instance: SignalHandler;
  private cancellationCallbacks: (() => void)[] = [];
  private _isCancelled = false;
  private _isShuttingDown = false;

  private constructor() {
    this.setupSignalHandlers();
  }

  static getInstance(): SignalHandler {
    if (!SignalHandler.instance) {
      SignalHandler.instance = new SignalHandler();
    }
    return SignalHandler.instance;
  }

  private setupSignalHandlers(): void {
    const gracefulShutdown = (signal: string) => {
      if (this._isShuttingDown) {
        console.log('\n🛑 Force exit requested');
        process.exit(1);
      }

      this._isShuttingDown = true;
      this._isCancelled = true;
      
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
      console.log('💡 Press Ctrl+C again to force exit');
      
      // Execute all cancellation callbacks
      this.cancellationCallbacks.forEach(callback => {
        try {
          callback();
        } catch (error) {
          console.warn('⚠️  Error during cleanup:', error);
        }
      });
      
      // Give operations a chance to clean up
      setTimeout(() => {
        console.log('✅ Graceful shutdown complete');
        process.exit(0);
      }, 2000);
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  }

  /**
   * Create a cancellation token that can be used to check for cancellation
   */
  createCancellationToken(): CancellationToken {
    return {
      get isCancelled() {
        return SignalHandler.getInstance()._isCancelled;
      },
      onCancel: (callback: () => void) => {
        SignalHandler.getInstance().cancellationCallbacks.push(callback);
      },
      throwIfCancelled: () => {
        if (SignalHandler.getInstance()._isCancelled) {
          throw new Error('Operation was cancelled');
        }
      }
    };
  }

  /**
   * Register a cleanup callback to be called on shutdown
   */
  onShutdown(callback: () => void): void {
    this.cancellationCallbacks.push(callback);
  }

  /**
   * Check if the application is shutting down
   */
  get isShuttingDown(): boolean {
    return this._isShuttingDown;
  }

  /**
   * Check if operations should be cancelled
   */
  get isCancelled(): boolean {
    return this._isCancelled;
  }
}

/**
 * Convenience function to get a cancellation token
 */
export function createCancellationToken(): CancellationToken {
  return SignalHandler.getInstance().createCancellationToken();
}

/**
 * Convenience function to register shutdown callbacks
 */
export function onShutdown(callback: () => void): void {
  SignalHandler.getInstance().onShutdown(callback);
}
