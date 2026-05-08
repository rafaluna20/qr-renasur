import pino from 'pino';
import { getOdooClient } from '../odoo-client';

/**
 * Contexto de logging que acompaña cada mensaje
 */
export interface LogContext {
  requestId?: string;
  userId?: string;
  employeeId?: string;
  role?: string;
  action?: string;
  resource?: string;
  timestamp: number;
  duration?: number;
  environment: string;
  version: string;
  [key: string]: any;
}

/**
 * Configuración del logger según el entorno
 */
const getLoggerConfig = () => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  return {
    level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
    formatters: {
      level: (label: string) => ({ level: label.toUpperCase() }),
      bindings: (bindings: any) => ({
        pid: bindings.pid,
        hostname: bindings.hostname,
        node_version: process.version,
      }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    // En desarrollo: logs bonitos con colores
    // En producción: JSON estructurado para análisis
    transport: isDevelopment ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    } : undefined,
  };
};

/**
 * Logger estructurado empresarial con capacidades avanzadas
 */
export class StructuredLogger {
  private logger: pino.Logger;
  private context: Partial<LogContext>;

  constructor(context: Partial<LogContext> = {}) {
    this.context = {
      ...context,
      environment: process.env.NODE_ENV || 'development',
      version: process.env.APP_VERSION || '2.0.2',
      timestamp: Date.now(),
    };

    this.logger = pino(getLoggerConfig());
  }

  /**
   * Log informativo
   */
  info(message: string, data?: Record<string, any>): void {
    this.logger.info({
      ...this.context,
      ...data,
      message,
    });
  }

  /**
   * Log de depuración
   */
  debug(message: string, data?: Record<string, any>): void {
    this.logger.debug({
      ...this.context,
      ...data,
      message,
    });
  }

  /**
   * Log de advertencia
   */
  warn(message: string, data?: Record<string, any>): void {
    this.logger.warn({
      ...this.context,
      ...data,
      message,
    });
  }

  /**
   * Log de error con análisis automático de criticidad
   */
  error(message: string, error: Error, data?: Record<string, any>): void {
    const errorData = {
      ...this.context,
      ...data,
      message,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      },
    };

    this.logger.error(errorData);

    // Enviar alerta si es crítico
    if (this.isCriticalError(error)) {
      this.sendCriticalAlert(message, error, data);
    }
  }

  /**
   * Log de auditoría para cumplimiento legal
   */
  audit(action: string, data: Record<string, any>): void {
    const auditData = {
      ...this.context,
      ...data,
      action,
      audit: true,
      timestamp: Date.now(),
    };

    this.logger.info(auditData, `AUDIT: ${action}`);

    // Guardar en base de datos de auditoría (asíncrono, no bloquea)
    this.saveToAuditLog(action, data).catch((err) => {
      this.logger.error({ message: 'Error guardando audit log', error: err });
    });
  }

  /**
   * Métrica de negocio
   */
  metric(name: string, value: number, tags?: Record<string, string>): void {
    this.logger.info({
      ...this.context,
      metric: name,
      value,
      tags,
      timestamp: Date.now(),
    });

    // TODO: Enviar a sistema de métricas (Prometheus, CloudWatch, etc.)
    // this.sendMetric(name, value, tags);
  }

  /**
   * Log de performance con detección automática de lentitud
   */
  performance(operation: string, duration: number, metadata?: Record<string, any>): void {
    const perfData = {
      ...this.context,
      ...metadata,
      operation,
      duration,
      performance: true,
    };

    if (duration > 5000) {
      // Operación muy lenta
      this.logger.warn(perfData, `⚠️ Performance: ${operation} took ${duration}ms (SLOW)`);
      this.sendSlowOperationAlert(operation, duration);
    } else if (duration > 2000) {
      // Operación lenta
      this.logger.info(perfData, `⏱️ Performance: ${operation} took ${duration}ms`);
    } else {
      // Operación normal
      this.logger.debug(perfData, `✓ Performance: ${operation} took ${duration}ms`);
    }
  }

  /**
   * Determina si un error es crítico y requiere alerta inmediata
   */
  private isCriticalError(error: Error): boolean {
    const criticalPatterns = [
      /database.*connection/i,
      /odoo.*failed/i,
      /odoo.*connection/i,
      /authentication.*failed/i,
      /permission.*denied/i,
      /unauthorized/i,
      /redis.*connection/i,
      /cannot connect/i,
    ];

    return criticalPatterns.some((pattern) =>
      pattern.test(error.message) || pattern.test(error.name)
    );
  }

  /**
   * Envía alerta crítica (Slack, email, etc.)
   */
  private async sendCriticalAlert(
    message: string,
    error: Error,
    data?: any
  ): Promise<void> {
    try {
      const webhookUrl = process.env.SLACK_WEBHOOK_URL;
      
      if (!webhookUrl) {
        this.logger.debug('No hay SLACK_WEBHOOK_URL configurado, omitiendo alerta');
        return;
      }

      const alertPayload = {
        text: `🚨 *ALERTA CRÍTICA*: ${message}`,
        attachments: [
          {
            color: 'danger',
            fields: [
              {
                title: 'Error',
                value: error.message,
                short: false,
              },
              {
                title: 'Usuario',
                value: this.context.userId || 'N/A',
                short: true,
              },
              {
                title: 'Acción',
                value: this.context.action || 'N/A',
                short: true,
              },
              {
                title: 'Timestamp',
                value: new Date().toISOString(),
                short: true,
              },
              {
                title: 'Environment',
                value: this.context.environment,
                short: true,
              },
            ],
          },
        ],
      };

      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alertPayload),
      });
    } catch (alertError) {
      // Nunca fallar por error de alerting
      this.logger.error({ message: 'Error enviando alerta crítica', error: alertError });
    }
  }

  /**
   * Alerta de operación lenta
   */
  private async sendSlowOperationAlert(operation: string, duration: number): Promise<void> {
    try {
      const webhookUrl = process.env.SLACK_WEBHOOK_URL;
      
      if (!webhookUrl) return;

      const alertPayload = {
        text: `⏱️ *Operación Lenta Detectada*: ${operation}`,
        attachments: [
          {
            color: 'warning',
            fields: [
              {
                title: 'Duración',
                value: `${duration}ms (umbral: 5000ms)`,
                short: true,
              },
              {
                title: 'Usuario',
                value: this.context.userId || 'N/A',
                short: true,
              },
            ],
          },
        ],
      };

      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alertPayload),
      });
    } catch (error) {
      // Silenciar errores de alerting
    }
  }

  /**
   * Guarda el log de auditoría en Odoo para cumplimiento legal
   */
  private async saveToAuditLog(action: string, data: Record<string, any>): Promise<void> {
    try {
      // Solo en producción y si hay usuario autenticado
      if (process.env.NODE_ENV !== 'production' || !this.context.employeeId) {
        return;
      }

      const odoo = getOdooClient();

      // Verificar si existe el modelo de auditoría
      // Si no existe, solo logueamos pero no fallamos
      const auditData = {
        action,
        user_id: this.context.employeeId ? parseInt(this.context.employeeId) : false,
        data: JSON.stringify(data),
        request_id: this.context.requestId || 'N/A',
        timestamp: new Date().toISOString(),
        resource: this.context.resource || 'N/A',
      };

      // Intentar crear el registro de auditoría
      // Si el modelo no existe en Odoo, simplemente lo ignoramos
      await odoo.create('audit.log', auditData).catch(() => {
        // Modelo no existe, ignorar silenciosamente
      });
    } catch (error) {
      // No fallar nunca por errores de auditoría
      this.logger.debug({ message: 'Error guardando audit log en Odoo', error });
    }
  }

  /**
   * Crea un child logger con contexto adicional
   */
  child(additionalContext: Partial<LogContext>): StructuredLogger {
    return new StructuredLogger({
      ...this.context,
      ...additionalContext,
    });
  }
}

/**
 * Logger global para uso rápido
 * Para casos con contexto específico, crear instancia con new StructuredLogger(context)
 */
export const globalLogger = new StructuredLogger({
  action: 'global',
});

/**
 * Helper para medir performance de funciones
 */
export function withPerformanceLogging<T extends (...args: any[]) => any>(
  fn: T,
  operationName: string,
  logger: StructuredLogger = globalLogger
): T {
  return ((...args: any[]) => {
    const start = Date.now();
    try {
      const result = fn(...args);

      // Si es promesa, esperar y loguear
      if (result instanceof Promise) {
        return result.finally(() => {
          const duration = Date.now() - start;
          logger.performance(operationName, duration);
        });
      }

      // Función síncrona
      const duration = Date.now() - start;
      logger.performance(operationName, duration);
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      logger.performance(operationName, duration, { error: true });
      throw error;
    }
  }) as T;
}

/**
 * Decorator para loguear performance automáticamente
 */
export function LogPerformance(operationName?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const opName = operationName || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      const logger = new StructuredLogger({ action: opName });
      const start = Date.now();

      try {
        const result = await originalMethod.apply(this, args);
        const duration = Date.now() - start;
        logger.performance(opName, duration);
        return result;
      } catch (error: any) {
        const duration = Date.now() - start;
        logger.performance(opName, duration, { error: true });
        logger.error(`Error en ${opName}`, error);
        throw error;
      }
    };

    return descriptor;
  };
}
