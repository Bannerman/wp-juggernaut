type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Default level is info unless LOG_LEVEL environment variable is set
const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || (process.env.NODE_ENV === 'development' ? 'debug' : 'info');

function formatMessage(module: string, message: string): string {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${module}] ${message}`;
}

export interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

export function createLogger(moduleName: string): Logger {
  return {
    debug(message: string, ...args: any[]) {
      if (LOG_LEVELS[currentLevel] <= LOG_LEVELS.debug) {
        console.debug(formatMessage(moduleName, message), ...args);
      }
    },
    info(message: string, ...args: any[]) {
      if (LOG_LEVELS[currentLevel] <= LOG_LEVELS.info) {
        console.log(formatMessage(moduleName, message), ...args);
      }
    },
    warn(message: string, ...args: any[]) {
      if (LOG_LEVELS[currentLevel] <= LOG_LEVELS.warn) {
        console.warn(formatMessage(moduleName, message), ...args);
      }
    },
    error(message: string, ...args: any[]) {
      if (LOG_LEVELS[currentLevel] <= LOG_LEVELS.error) {
        console.error(formatMessage(moduleName, message), ...args);
      }
    },
  };
}
