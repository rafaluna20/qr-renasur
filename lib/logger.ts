/**
 * Logger Estructurado
 * 
 * Proporciona logging consistente en toda la aplicación.
 * En producción, estos logs pueden integrarse con servicios
 * como Winston, Pino, o enviarse a ELK Stack.
 */

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

interface LogMetadata {
  [key: string]: any;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  metadata?: LogMetadata;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class Logger {
  private serviceName: string;
  private minLevel: LogLevel;

  constructor(serviceName: string = 'qr-generator') {
    this.serviceName = serviceName;
    this.minLevel = this.getMinLevel();
  }

  private getMinLevel(): LogLevel {
    const env = process.env.NODE_ENV;
    const configuredLevel = process.env.LOG_LEVEL?.toLowerCase();

    if (configuredLevel) {
      return configuredLevel as LogLevel;
    }

    // Default levels por entorno
    if (env === 'production') return LogLevel.INFO;
    if (env === 'test') return LogLevel.WARN;
    return LogLevel.DEBUG;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const minIndex = levels.indexOf(this.minLevel);
    const currentIndex = levels.indexOf(level);
    return currentIndex >= minIndex;
  }

  private formatLog(entry: LogEntry): string {
    const { level, message, timestamp, metadata, error } = entry;

    // En desarrollo: formato legible
    if (process.env.NODE_ENV !== 'production') {
      const emoji = {
        [LogLevel.DEBUG]: '🔍',
        [LogLevel.INFO]: 'ℹ️',
        [LogLevel.WARN]: '⚠️',
        [LogLevel.ERROR]: '❌',
      }[level];

      let output = `${emoji} [${level.toUpperCase()}] ${timestamp} - ${message}`;
      
      if (metadata && Object.keys(metadata).length > 0) {
        output += `\n  Metadata: ${JSON.stringify(metadata, null, 2)}`;
      }
      
      if (error) {
        output += `\n  Error: ${error.name}: ${error.message}`;
        if (error.stack) {
          output += `\n  Stack: ${error.stack}`;
        }
      }
      
      return output;
    }

    // En producción: formato JSON para parseo
    return JSON.stringify({
      service: this.serviceName,
      ...entry,
    });
  }

  public log(level: LogLevel, message: string, metadata?: LogMetadata): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      metadata,
    };

    const formatted = this.formatLog(entry);

    // Console output basado en nivel
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(formatted);
        break;
      case LogLevel.INFO:
        console.info(formatted);
        break;
      case LogLevel.WARN:
        console.warn(formatted);
        break;
      case LogLevel.ERROR:
        console.error(formatted);
        break;
    }
  }

  /**
   * Log de debugging (solo en development)
   */
  debug(message: string, metadata?: LogMetadata): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  /**
   * Log informativo
   */
  info(message: string, metadata?: LogMetadata): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  /**
   * Log de warning
   */
  warn(message: string, metadata?: LogMetadata): void {
    this.log(LogLevel.WARN, message, metadata);
  }

  /**
   * Log de error con soporte para Error objects
   */
  error(message: string, error?: Error, metadata?: LogMetadata): void {
    const entry: LogEntry = {
      level: LogLevel.ERROR,
      message,
      timestamp: new Date().toISOString(),
      metadata,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
    };

    const formatted = this.formatLog(entry);
    console.error(formatted);
  }

  /**
   * Crear logger específico para un módulo
   */
  child(moduleName: string): Logger {
    const childLogger = new Logger(`${this.serviceName}:${moduleName}`);
    childLogger.minLevel = this.minLevel;
    return childLogger;
  }
}

// Exportar instancia singleton
export const logger = new Logger();

// Exportar class para crear loggers específicos
export { Logger };

// Helpers para logging de API requests
export interface APIRequestLog {
  method: string;
  url: string;
  userId?: string | number;
  ip?: string;
  userAgent?: string;
  duration?: number;
  status?: number;
}

export function logAPIRequest(data: APIRequestLog): void {
  const { method, url, userId, duration, status } = data;
  
  const level = status && status >= 500 ? LogLevel.ERROR :
                status && status >= 400 ? LogLevel.WARN :
                LogLevel.INFO;

  const message = `${method} ${url} - ${status || 'pending'}`;
  
  logger.log(level, message, {
    ...data,
    type: 'api_request',
  });
}

// Helper para logging de operaciones Odoo
export interface OdooOperationLog {
  model: string;
  method: string;
  duration: number;
  success: boolean;
  recordCount?: number;
  error?: string;
}

export function logOdooOperation(data: OdooOperationLog): void {
  const { model, method, success, duration } = data;
  
  const level = success ? LogLevel.INFO : LogLevel.ERROR;
  const message = `Odoo ${method} on ${model} - ${success ? 'success' : 'failed'} (${duration}ms)`;
  
  logger.log(level, message, {
    ...data,
    type: 'odoo_operation',
  });
}
