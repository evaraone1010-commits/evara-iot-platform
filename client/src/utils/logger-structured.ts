interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, any>;
  error?: Error;
  category?: string;
}

interface LoggerConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  enableConsole: boolean;
  enableRemote: boolean;
  remoteEndpoint?: string;
}

class StructuredLogger {
  private config: LoggerConfig;
  private isDevelopment = import.meta.env.DEV;
  private isProduction = import.meta.env.PROD;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: this.isDevelopment ? 'debug' : 'info',
      enableConsole: true,
      enableRemote: this.isProduction,
      ...config
    };
  }

  private createLogEntry(level: LogEntry['level'], message: string, context?: Record<string, any>, error?: Error): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      error,
      category: context?.category
    };
  }

  private formatMessage(entry: LogEntry): string {
    const { timestamp, level, message, context } = entry;
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${contextStr}`;
  }

  private log(entry: LogEntry): void {
    // Console logging
    if (this.config.enableConsole) {
      const formattedMessage = this.formatMessage(entry);
      
      switch (entry.level) {
        case 'debug':
          console.debug(formattedMessage, entry.context, entry.error);
          break;
        case 'info':
          console.info(formattedMessage, entry.context, entry.error);
          break;
        case 'warn':
          console.warn(formattedMessage, entry.context, entry.error);
          break;
        case 'error':
          console.error(formattedMessage, entry.context, entry.error);
          break;
      }
    }

    // Remote logging (in production)
    if (this.config.enableRemote && this.config.remoteEndpoint) {
      this.sendToRemote(entry);
    }
  }

  private async sendToRemote(entry: LogEntry): Promise<void> {
    try {
      if (!this.config.remoteEndpoint) return;
      
      await fetch(this.config.remoteEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(entry),
      });
    } catch (error) {
      console.error('Failed to send log to remote endpoint:', error);
    }
  }

  // Standard logging methods
  debug(message: string, context?: Record<string, any>): void {
    if (this.shouldLog('debug')) {
      this.log(this.createLogEntry('debug', message, context));
    }
  }

  info(message: string, context?: Record<string, any>): void {
    if (this.shouldLog('info')) {
      this.log(this.createLogEntry('info', message, context));
    }
  }

  warn(message: string, context?: Record<string, any>): void {
    if (this.shouldLog('warn')) {
      this.log(this.createLogEntry('warn', message, context));
    }
  }

  error(message: string, error?: Error, context?: Record<string, any>): void {
    if (this.shouldLog('error')) {
      this.log(this.createLogEntry('error', message, context, error));
    }
  }

  // Specialized logging methods
  auth(action: string, userId?: string, context?: Record<string, any>): void {
    this.info(`Auth: ${action}`, {
      category: 'auth',
      userId,
      ...context
    });
  }

  api(method: string, endpoint: string, statusCode?: number, duration?: number, context?: Record<string, any>): void {
    this.info(`API: ${method} ${endpoint}`, {
      category: 'api',
      method,
      endpoint,
      statusCode,
      duration,
      ...context
    });
  }

  telemetry(nodeId: string, action: string, context?: Record<string, any>): void {
    this.info(`Telemetry: ${action} for node ${nodeId}`, {
      category: 'telemetry',
      nodeId,
      action,
      ...context
    });
  }

  performance(operation: string, duration: number, context?: Record<string, any>): void {
    this.info(`Performance: ${operation} took ${duration}ms`, {
      category: 'performance',
      operation,
      duration,
      ...context
    });
  }

  user(action: string, context?: Record<string, any>): void {
    this.info(`User: ${action}`, {
      category: 'user',
      ...context
    });
  }

  private shouldLog(level: LogEntry['level']): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.config.level);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  // Update configuration
  updateConfig(newConfig: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

// Create singleton instance
const logger = new StructuredLogger({
  remoteEndpoint: import.meta.env.VITE_LOG_ENDPOINT
});

export default logger;
export { StructuredLogger };
export type { LogEntry, LoggerConfig };
