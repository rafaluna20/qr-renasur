import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { StructuredLogger } from '../observability/structured-logger';
import { getOdooClient } from '../odoo-client';
import type { AsientoOffline } from '../cuaderno/offline-storage';

/**
 * Datos del job de sincronización
 */
export interface SyncJobData {
  asientos: AsientoOffline[];
  userId: string;
  employeeId: string;
  priority: 'high' | 'normal' | 'low';
  requestId?: string;
}

/**
 * Resultado de sincronización de un asiento individual
 */
export interface AsientoSyncResult {
  offline_uuid: string;
  status: 'success' | 'success_partial' | 'error';
  odoo_id?: number;
  error?: string;
  warning?: string;
  retryable?: boolean;
}

/**
 * Resultado completo del job
 */
export interface SyncJobResult {
  success: boolean;
  synced: number;
  errors: number;
  partials: number;
  results: AsientoSyncResult[];
  duration: number;
}

/**
 * Opciones de configuración para el SyncQueueManager
 */
interface SyncQueueManagerConfig {
  useRedis?: boolean;
  redisUrl?: string;
  concurrency?: number;
  rateLimit?: { max: number; duration: number };
}

/**
 * Gestor de cola de sincronización asíncrona para asientos de obra
 * 
 * Características:
 * - Procesamiento no bloqueante
 * - Reintentos automáticos con backoff exponencial
 * - Rate limiting para no sobrecargar Odoo
 * - Procesamiento en paralelo controlado
 * - Notificaciones de progreso en tiempo real
 * - Persistencia de jobs para auditoría
 */
export class SyncQueueManager {
  private logger: StructuredLogger;
  private queue: Queue<SyncJobData, SyncJobResult> | null = null;
  private worker: Worker<SyncJobData, SyncJobResult> | null = null;
  private queueEvents: QueueEvents | null = null;
  private useRedis: boolean;
  private connection: Redis | null = null;

  constructor(config: SyncQueueManagerConfig = {}) {
    this.logger = new StructuredLogger({ action: 'sync_queue_manager' });
    this.useRedis = config.useRedis ?? !!process.env.REDIS_URL;

    if (this.useRedis) {
      try {
        // Configurar conexión Redis para BullMQ
        this.connection = new Redis(config.redisUrl || process.env.REDIS_URL!, {
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        });

        // Crear cola
        this.queue = new Queue<SyncJobData, SyncJobResult>('asiento-sync', {
          connection: this.connection,
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 5000, // 5s, 25s, 125s
            },
            removeOnComplete: {
              age: 86400, // Mantener 24 horas
              count: 1000, // Máximo 1000 jobs completados
            },
            removeOnFail: false, // Nunca eliminar fallos (para debugging)
          },
        });

        // Crear worker
        this.worker = new Worker<SyncJobData, SyncJobResult>(
          'asiento-sync',
          async (job) => await this.processSync(job),
          {
            connection: this.connection.duplicate(),
            concurrency: config.concurrency ?? 5,
            limiter: config.rateLimit ?? {
              max: 10, // Máximo 10 requests
              duration: 1000, // por segundo
            },
          }
        );

        // Configurar event handlers
        this.setupEventHandlers();

        // Queue events para monitoreo
        this.queueEvents = new QueueEvents('asiento-sync', {
          connection: this.connection.duplicate(),
        });

        this.logger.info('SyncQueueManager initialized with Redis/BullMQ');
      } catch (error: any) {
        this.logger.error('Error initializing SyncQueueManager', error);
        this.useRedis = false;
        this.logger.warn('Falling back to in-memory processing (no queue)');
      }
    } else {
      this.logger.info('SyncQueueManager initialized without Redis (direct processing)');
    }
  }

  /**
   * Encola un job de sincronización
   */
  async enqueueSync(data: SyncJobData): Promise<string> {
    if (!this.useRedis || !this.queue) {
      // Sin cola: procesar directamente
      this.logger.warn('Processing sync directly without queue');
      const result = await this.processSyncDirect(data);
      return `direct-${Date.now()}`;
    }

    try {
      const job = await this.queue.add('sync-asientos', data, {
        priority: this.getPriorityValue(data.priority),
        jobId: `sync-${data.userId}-${Date.now()}`,
      });

      this.logger.info('Sync job enqueued', {
        jobId: job.id,
        userId: data.userId,
        asientosCount: data.asientos.length,
        priority: data.priority,
      });

      return job.id!;
    } catch (error: any) {
      this.logger.error('Error enqueueing sync job', error);
      throw new Error('No se pudo encolar la sincronización');
    }
  }

  /**
   * Obtiene el estado de un job
   */
  async getJobStatus(jobId: string): Promise<{
    state: string;
    progress?: number;
    result?: SyncJobResult;
    failedReason?: string;
  }> {
    if (!this.queue) {
      return { state: 'unknown' };
    }

    try {
      const job = await this.queue.getJob(jobId);
      if (!job) {
        return { state: 'not_found' };
      }

      const state = await job.getState();
      const progress = job.progress as number | undefined;
      const result = job.returnvalue;
      const failedReason = job.failedReason;

      return { state, progress, result, failedReason };
    } catch (error: any) {
      this.logger.error('Error getting job status', error, { jobId });
      return { state: 'error' };
    }
  }

  /**
   * Obtiene estadísticas de la cola
   */
  async getQueueStats(userId?: string): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    if (!this.queue) {
      return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
    }

    try {
      const counts = await this.queue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed'
      );

      // Si se proporciona userId, filtrar
      if (userId) {
        // Implementación simplificada: contar todos
        // En producción: usar Redis SCAN para filtrar por userId
        return {
          waiting: counts.waiting || 0,
          active: counts.active || 0,
          completed: counts.completed || 0,
          failed: counts.failed || 0,
          delayed: counts.delayed || 0,
        };
      }

      return {
        waiting: counts.waiting || 0,
        active: counts.active || 0,
        completed: counts.completed || 0,
        failed: counts.failed || 0,
        delayed: counts.delayed || 0,
      };
    } catch (error: any) {
      this.logger.error('Error getting queue stats', error);
      return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
    }
  }

  /**
   * Cancela un job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    if (!this.queue) {
      return false;
    }

    try {
      const job = await this.queue.getJob(jobId);
      if (job) {
        await job.remove();
        this.logger.info('Job cancelled', { jobId });
        return true;
      }
      return false;
    } catch (error: any) {
      this.logger.error('Error cancelling job', error, { jobId });
      return false;
    }
  }

  /**
   * Limpia jobs completados antiguos
   */
  async cleanOldJobs(ageInHours: number = 24): Promise<number> {
    if (!this.queue) {
      return 0;
    }

    try {
      const grace = ageInHours * 60 * 60 * 1000;
      const cleaned = await this.queue.clean(grace, 100, 'completed');
      this.logger.info('Old jobs cleaned', { count: cleaned.length });
      return cleaned.length;
    } catch (error: any) {
      this.logger.error('Error cleaning old jobs', error);
      return 0;
    }
  }

  // ========================================================================
  // PROCESAMIENTO DE SINCRONIZACIÓN
  // ========================================================================

  /**
   * Procesa un job de sincronización
   */
  private async processSync(job: Job<SyncJobData, SyncJobResult>): Promise<SyncJobResult> {
    const startTime = Date.now();
    const { asientos, userId, employeeId, requestId } = job.data;

    this.logger.info('Processing sync job', {
      jobId: job.id,
      userId,
      asientosCount: asientos.length,
      requestId,
    });

    const results: AsientoSyncResult[] = [];

    // Procesar en micro-batches de 5 asientos
    const batchSize = 5;
    const batches = this.chunkArray(asientos, batchSize);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      // Procesar batch en paralelo
      const batchResults = await Promise.allSettled(
        batch.map((asiento) => this.syncSingleAsiento(asiento, userId))
      );

      // Convertir a resultados
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const asiento = batch[j];

        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            offline_uuid: asiento.offline_uuid,
            status: 'error',
            error: result.reason?.message || 'Error desconocido',
            retryable: true,
          });
        }
      }

      // Actualizar progreso
      const progress = Math.round(((i + 1) / batches.length) * 100);
      await job.updateProgress(progress);

      // TODO: Notificar progreso vía WebSocket/SSE
    }

    const duration = Date.now() - startTime;
    const synced = results.filter((r) => r.status === 'success').length;
    const errors = results.filter((r) => r.status === 'error').length;
    const partials = results.filter((r) => r.status === 'success_partial').length;

    this.logger.info('Sync job completed', {
      jobId: job.id,
      userId,
      duration,
      synced,
      errors,
      partials,
      total: asientos.length,
    });

    return {
      success: errors === 0,
      synced,
      errors,
      partials,
      results,
      duration,
    };
  }

  /**
   * Sincroniza un asiento individual con Odoo
   */
  private async syncSingleAsiento(
    asiento: AsientoOffline,
    userId: string
  ): Promise<AsientoSyncResult> {
    const odoo = getOdooClient();

    try {
      // Preparar valores para Odoo
      const vals: Record<string, any> = {
        cuaderno_id: parseInt(asiento.cuaderno_id),
        date: asiento.date,
        clima: asiento.clima || 'soleado',
        ocurrencias: asiento.ocurrencias || '',
        x_personal: asiento.personal || '',
        x_equipos: asiento.equipos || '',
        x_hash_seguridad: asiento.security_hash || '',
      };

      // Campos opcionales
      if (asiento.latitude && asiento.latitude !== 0) {
        vals.latitude = parseFloat(String(asiento.latitude));
      }
      if (asiento.longitude && asiento.longitude !== 0) {
        vals.longitude = parseFloat(String(asiento.longitude));
      }
      if (asiento.gps_accuracy && asiento.gps_accuracy !== 0) {
        vals.gps_accuracy = parseFloat(String(asiento.gps_accuracy));
      }
      if (asiento.residente_id) {
        vals.residente_id = parseInt(asiento.residente_id);
      }

      // Crear asiento en Odoo
      const createdId = await odoo.create('obra.cuaderno.asiento', vals);

      if (!createdId || isNaN(Number(createdId))) {
        throw new Error(`Odoo retornó ID inválido: ${createdId}`);
      }

      this.logger.info('Asiento created in Odoo', {
        offline_uuid: asiento.offline_uuid,
        odoo_id: createdId,
      });

      // Transición de estado si corresponde
      if (asiento.state === 'signed_residente') {
        try {
          await odoo.execute_kw(
            'obra.cuaderno.asiento',
            'action_sign_residente',
            [[Number(createdId)]],
            {}
          );

          this.logger.info('Asiento signed in Odoo', {
            offline_uuid: asiento.offline_uuid,
            odoo_id: createdId,
          });
        } catch (signErr: any) {
          // Creado pero no firmado
          this.logger.error('Error signing asiento', signErr, {
            offline_uuid: asiento.offline_uuid,
            odoo_id: createdId,
          });

          return {
            offline_uuid: asiento.offline_uuid,
            odoo_id: Number(createdId),
            status: 'success_partial',
            warning: `Asiento creado pero sin firmar: ${signErr.message}`,
          };
        }
      }

      // TODO: Subir fotos si las hay
      // if (asiento.photos?.length) { ... }

      return {
        offline_uuid: asiento.offline_uuid,
        odoo_id: Number(createdId),
        status: 'success',
      };
    } catch (error: any) {
      this.logger.error('Error syncing asiento', error, {
        offline_uuid: asiento.offline_uuid,
        cuaderno_id: asiento.cuaderno_id,
      });

      return {
        offline_uuid: asiento.offline_uuid,
        status: 'error',
        error: error?.message || 'Error desconocido',
        retryable: this.isRetryableError(error),
      };
    }
  }

  /**
   * Procesa sincronización directamente (sin cola)
   */
  private async processSyncDirect(data: SyncJobData): Promise<SyncJobResult> {
    const startTime = Date.now();
    const results: AsientoSyncResult[] = [];

    for (const asiento of data.asientos) {
      try {
        const result = await this.syncSingleAsiento(asiento, data.userId);
        results.push(result);
      } catch (error: any) {
        results.push({
          offline_uuid: asiento.offline_uuid,
          status: 'error',
          error: error.message,
          retryable: true,
        });
      }
    }

    const duration = Date.now() - startTime;
    const synced = results.filter((r) => r.status === 'success').length;
    const errors = results.filter((r) => r.status === 'error').length;
    const partials = results.filter((r) => r.status === 'success_partial').length;

    return {
      success: errors === 0,
      synced,
      errors,
      partials,
      results,
      duration,
    };
  }

  // ========================================================================
  // HELPERS Y EVENT HANDLERS
  // ========================================================================

  private setupEventHandlers(): void {
    if (!this.worker) return;

    this.worker.on('completed', (job) => {
      this.logger.info('Job completed successfully', {
        jobId: job.id,
        duration: job.finishedOn! - job.processedOn!,
      });
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error('Job failed', error, {
        jobId: job?.id,
        attemptsMade: job?.attemptsMade,
        attemptsTotal: job?.opts.attempts,
      });

      // Alertar si es el último intento
      if (job && job.attemptsMade >= (job.opts.attempts || 1)) {
        this.logger.audit('SYNC_JOB_PERMANENTLY_FAILED', {
          jobId: job.id,
          userId: job.data.userId,
          asientosCount: job.data.asientos.length,
          error: error.message,
        });
      }
    });

    this.worker.on('progress', (job, progress) => {
      this.logger.debug('Job progress updated', {
        jobId: job.id,
        progress,
      });
    });
  }

  private getPriorityValue(priority: 'high' | 'normal' | 'low'): number {
    switch (priority) {
      case 'high':
        return 1;
      case 'normal':
        return 5;
      case 'low':
        return 10;
      default:
        return 5;
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private isRetryableError(error: any): boolean {
    // Errores de red: reintentar
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return true;
    }

    // Errores de Odoo: algunos son reintentos, otros no
    if (error.message?.includes('connection')) {
      return true;
    }

    // Errores de validación: no reintentar
    if (error.message?.includes('validation') || error.message?.includes('constraint')) {
      return false;
    }

    // Por defecto: no reintentar
    return false;
  }

  /**
   * Cierra la cola y el worker
   */
  async destroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
    }
    if (this.queue) {
      await this.queue.close();
    }
    if (this.queueEvents) {
      await this.queueEvents.close();
    }
    if (this.connection) {
      await this.connection.quit();
    }

    this.logger.info('SyncQueueManager destroyed');
  }
}

/**
 * Instancia singleton
 */
let syncQueueManagerInstance: SyncQueueManager | null = null;

export function getSyncQueueManager(): SyncQueueManager {
  if (!syncQueueManagerInstance) {
    syncQueueManagerInstance = new SyncQueueManager({
      useRedis: !!process.env.REDIS_URL,
      redisUrl: process.env.REDIS_URL,
      concurrency: 5,
      rateLimit: {
        max: 10,
        duration: 1000,
      },
    });
  }
  return syncQueueManagerInstance;
}
