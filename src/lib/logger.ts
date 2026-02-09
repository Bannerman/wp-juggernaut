/**
 * Simple logger utility for Juggernaut
 */

class Logger {
  private module: string;

  constructor(module: string) {
    this.module = module;
  }

  private formatMessage(message: string): string {
    return `[${this.module}] ${message}`;
  }

  info(message: string, ...args: unknown[]): void {
    console.log(this.formatMessage(message), ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(this.formatMessage(message), ...args);
  }

  error(message: string, ...args: unknown[]): void {
    console.error(this.formatMessage(message), ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    // Only log debug messages in development
    if (process.env.NODE_ENV === 'development') {
      console.debug(this.formatMessage(message), ...args);
    }
  }
}

/**
 * Creates a new logger instance for a specific module
 * @param module The name of the module (e.g., 'sync', 'push')
 * @returns A Logger instance
 */
export const createLogger = (module: string): Logger => new Logger(module);
