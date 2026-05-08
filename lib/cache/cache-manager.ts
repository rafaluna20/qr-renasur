import { LRUCache } from 'lru-cache';
import { Redis } from 'ioredis';
import { StructuredLogger } from '../observability/structured-logger';

/**
 * Opciones de configuración para el CacheManager
 */
interface CacheManagerConfig {
  useRedis?: boolean;
  redisUrl?: string;
  l1MaxSize?: number;
  l1TTL?: number;
  defaultTTL?: number;
}

/**
 * Estrategia de invalidación de caché
 */
export type CacheInvalidationStrategy = 'immediate' | 'lazy' | 'time-based';

/**
 * Gestor de caché empresarial con dos niveles:
 * - L1: LRU Cache en memoria (ultra-rápido, local a la instancia)
 * - L2: Redis (compartido entre instancias, persistente)
 */
export class CacheManager {
  private logger: StructuredLogger;
  private l1Cache: LRUCache<string, any>;
  private l2Cache: Redis | null = null;
  private useRedis: boolean;
  private defaultTTL: number;

  constructor(config: CacheManagerConfig = {}) {
    this.logger = new StructuredLogger({ action: 'cache_manager' });
    this.useRedis = config.useRedis ?? false;
    this.defaultTTL = config.defaultTTL ?? 3600; // 1 hora por defecto

    // L1: Caché en memoria (LRU)
    this.l1Cache = new LRUCache({
      max: config.l1MaxSize ?? 500, // Máximo 500 items
      ttl: (config.l1TTL ?? 300) * 1000, // 5 minutos por defecto
      updateAgeOnGet: true,
      updateAgeOnHas: true,
    });

    // L2: Redis (si está disponible)
    if (this.useRedis && config.redisUrl) {
      try {
        this.l2Cache = new Redis(config.redisUrl, {
          maxRetriesPerRequest: 3,
          retryStrategy: (times) => {
            if (times > 3) {
              this.logger.error('Redis connection failed after 3 retries', new Error('Redis unavailable'));
              return null; // Stop retrying
            }
            return Math.min(times * 100, 2000); // Exponential backoff
          },
        });

        this.l2Cache.on('error', (error) => {
          this.logger.error('Redis error', error);
        });

        this.l2Cache.on('connect', () => {
          this.logger.info('Redis connected successfully');
        });
      } catch (error: any) {
        this.logger.error('Error initializing Redis', error);
        this.useRedis = false;
      }
    }

    if (!this.useRedis) {
      this.logger.info('CacheManager initialized without Redis (L1 only)');
    } else {
      this.logger.info('CacheManager initialized with L1 + L2 (Redis)');
    }
  }

  /**
   * Obtiene un valor del caché (L1 → L2 → null)
   */
  async get<T = any>(key: string): Promise<T | null> {
    const startTime = Date.now();

    try {
      // Intentar L1 primero
      const l1Value = this.l1Cache.get(key);
      if (l1Value !== undefined) {
        this.logger.performance('cache_get_l1_hit', Date.now() - startTime, { key });
        return l1Value as T;
      }

      // Si no está en L1 y tenemos Redis, intentar L2
      if (this.useRedis && this.l2Cache) {
        const l2Value = await this.l2Cache.get(key);
        
        if (l2Value !== null) {
          // Cache hit en L2: Deserializar y guardar en L1
          const parsed = JSON.parse(l2Value) as T;
          this.l1Cache.set(key, parsed);
          
          this.logger.performance('cache_get_l2_hit', Date.now() - startTime, { key });
          return parsed;
        }
      }

      // Cache miss
      this.logger.performance('cache_get_miss', Date.now() - startTime, { key });
      return null;
    } catch (error: any) {
      this.logger.error('Error getting from cache', error, { key });
      return null;
    }
  }

  /**
   * Guarda un valor en el caché (L1 + L2)
   */
  async set<T = any>(key: string, value: T, ttl?: number): Promise<void> {
    const startTime = Date.now();
    const effectiveTTL = ttl ?? this.defaultTTL;

    try {
      // Guardar en L1
      this.l1Cache.set(key, value);

      // Guardar en L2 (Redis) si está disponible
      if (this.useRedis && this.l2Cache) {
        const serialized = JSON.stringify(value);
        await this.l2Cache.setex(key, effectiveTTL, serialized);
      }

      this.logger.performance('cache_set', Date.now() - startTime, {
        key,
        ttl: effectiveTTL,
        layers: this.useRedis ? 'L1+L2' : 'L1',
      });
    } catch (error: any) {
      this.logger.error('Error setting cache', error, { key });
    }
  }

  /**
   * Invalida una clave específica en ambos niveles
   */
  async invalidate(key: string): Promise<void> {
    try {
      // Eliminar de L1
      this.l1Cache.delete(key);

      // Eliminar de L2
      if (this.useRedis && this.l2Cache) {
        await this.l2Cache.del(key);
      }

      this.logger.info('Cache key invalidated', { key });
    } catch (error: any) {
      this.logger.error('Error invalidating cache', error, { key });
    }
  }

  /**
   * Invalida todas las claves que coinciden con un patrón
   */
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      // L1: Buscar claves que coincidan
      const l1Keys = Array.from(this.l1Cache.keys());
      const regex = new RegExp(pattern.replace('*', '.*'));
      
      for (const key of l1Keys) {
        if (regex.test(key)) {
          this.l1Cache.delete(key);
        }
      }

      // L2: Redis SCAN pattern
      if (this.useRedis && this.l2Cache) {
        let cursor = '0';
        let deletedCount = 0;

        do {
          const [nextCursor, keys] = await this.l2Cache.scan(
            cursor,
            'MATCH',
            pattern,
            'COUNT',
            100
          );
          cursor = nextCursor;

          if (keys.length > 0) {
            await this.l2Cache.del(...keys);
            deletedCount += keys.length;
          }
        } while (cursor !== '0');

        this.logger.info('Cache pattern invalidated', { pattern, deletedCount });
      }
    } catch (error: any) {
      this.logger.error('Error invalidating pattern', error, { pattern });
    }
  }

  /**
   * Limpia todo el caché
   */
  async clear(): Promise<void> {
    try {
      this.l1Cache.clear();

      if (this.useRedis && this.l2Cache) {
        await this.l2Cache.flushdb();
      }

      this.logger.info('Cache cleared completely');
    } catch (error: any) {
      this.logger.error('Error clearing cache', error);
    }
  }

  /**
   * Obtiene estadísticas del caché
   */
  getStats(): {
    l1: { size: number; maxSize: number; hits?: number; misses?: number };
    l2: { connected: boolean };
  } {
    return {
      l1: {
        size: this.l1Cache.size,
        maxSize: this.l1Cache.max,
      },
      l2: {
        connected: this.useRedis && this.l2Cache?.status === 'ready',
      },
    };
  }

  /**
   * Implementa patrón Stale-While-Revalidate (SWR)
   * Retorna dato en caché inmediatamente y revalida en background
   */
  async getWithSWR<T = any>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = await this.get<T>(key);

    if (cached !== null) {
      // Verificar si necesita revalidación (10% antes de expirar)
      const needsRevalidation = this.needsRevalidation(key);
      
      if (needsRevalidation) {
        // Revalidar en background (no esperar)
        this.revalidateInBackground(key, fetcher, ttl);
      }

      return cached;
    }

    // No hay caché: fetch y guardar
    const fresh = await fetcher();
    await this.set(key, fresh, ttl);
    return fresh;
  }

  /**
   * Cache-aside pattern: Obtener o calcular
   */
  async getOrSet<T = any>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Intentar obtener del caché
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // No hay caché: calcular y guardar
    const fresh = await fetcher();
    await this.set(key, fresh, ttl);
    return fresh;
  }

  /**
   * Write-through: Escribe en caché y en origen
   */
  async writeThrough<T = any>(
    key: string,
    value: T,
    writer: (value: T) => Promise<void>,
    ttl?: number
  ): Promise<void> {
    // Escribir en origen primero
    await writer(value);

    // Luego actualizar caché
    await this.set(key, value, ttl);
  }

  /**
   * Write-behind: Escribe en caché inmediatamente, en origen después
   */
  async writeBehind<T = any>(
    key: string,
    value: T,
    writer: (value: T) => Promise<void>,
    ttl?: number
  ): Promise<void> {
    // Actualizar caché primero
    await this.set(key, value, ttl);

    // Escribir en origen en background
    setImmediate(async () => {
      try {
        await writer(value);
      } catch (error: any) {
        this.logger.error('Error in write-behind', error, { key });
      }
    });
  }

  // ========================================================================
  // MÉTODOS PRIVADOS
  // ========================================================================

  private needsRevalidation(key: string): boolean {
    // En L1, verificar si está cerca de expirar
    // Esto es una aproximación ya que LRUCache no expone TTL restante
    // En producción, guardar metadata de expiración
    return Math.random() < 0.1; // 10% de probabilidad de revalidar
  }

  private async revalidateInBackground<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<void> {
    setImmediate(async () => {
      try {
        const fresh = await fetcher();
        await this.set(key, fresh, ttl);
        this.logger.info('Cache revalidated in background', { key });
      } catch (error: any) {
        this.logger.error('Error revalidating cache', error, { key });
      }
    });
  }

  /**
   * Cierra conexiones y limpia recursos
   */
  async destroy(): Promise<void> {
    this.l1Cache.clear();

    if (this.l2Cache) {
      await this.l2Cache.quit();
    }

    this.logger.info('CacheManager destroyed');
  }
}

/**
 * Instancia singleton para uso global
 */
let cacheManagerInstance: CacheManager | null = null;

export function getCacheManager(): CacheManager {
  if (!cacheManagerInstance) {
    cacheManagerInstance = new CacheManager({
      useRedis: !!process.env.REDIS_URL,
      redisUrl: process.env.REDIS_URL,
      l1MaxSize: 500,
      l1TTL: 300, // 5 minutos
      defaultTTL: 3600, // 1 hora
    });
  }
  return cacheManagerInstance;
}

/**
 * Helper para generar claves de caché consistentes
 */
export class CacheKeyBuilder {
  private parts: string[] = [];

  constructor(prefix: string) {
    this.parts.push(prefix);
  }

  add(part: string | number): this {
    this.parts.push(String(part));
    return this;
  }

  build(): string {
    return this.parts.join(':');
  }

  static cuadernos(): string {
    return 'cuadernos:list';
  }

  static cuaderno(id: number): string {
    return `cuaderno:${id}`;
  }

  static asientos(role: string, employeeId: string, filter?: any): string {
    const filterParts: string[] = [];
    
    if (filter?.state) {
      filterParts.push(`state:${filter.state}`);
    }
    if (filter?.cuaderno_id) {
      filterParts.push(`cuaderno:${filter.cuaderno_id}`);
    }
    if (filter?.date_from) {
      filterParts.push(`from:${filter.date_from}`);
    }
    if (filter?.date_to) {
      filterParts.push(`to:${filter.date_to}`);
    }

    const filterKey = filterParts.length > 0 ? `:${filterParts.join(':')}` : '';
    return `asientos:${role}:${employeeId}${filterKey}`;
  }

  static asiento(id: number): string {
    return `asiento:${id}`;
  }

  static user(userId: string): string {
    return `user:${userId}`;
  }
}
