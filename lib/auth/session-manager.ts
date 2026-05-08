import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { StructuredLogger } from '../observability/structured-logger';
import { nanoid } from 'nanoid';

/**
 * Datos de sesión del usuario
 */
export interface SessionData extends JWTPayload {
  userId: string;
  employeeId: string;
  role: 'residente' | 'supervisor' | 'admin';
  deviceId: string;
  ipAddress: string;
  createdAt: number;
  lastActivity: number;
  permissions: string[];
  sessionId: string;
}

/**
 * Opciones de configuración para el SessionManager
 */
interface SessionManagerConfig {
  useRedis?: boolean;
  sessionDuration?: number; // en ms
  refreshWindow?: number; // en ms
  jwtSecret?: string;
}

/**
 * Gestor de sesiones empresarial con soporte para Redis y fallback en memoria
 */
export class EnterpriseSessionManager {
  private logger: StructuredLogger;
  private sessionDuration: number;
  private refreshWindow: number;
  private jwtSecret: Uint8Array;
  private useRedis: boolean;
  
  // Fallback: almacenamiento en memoria (solo para desarrollo)
  private memoryStore: Map<string, SessionData> = new Map();
  private memoryExpiration: Map<string, number> = new Map();
  
  // Cleanup interval para memoria
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: SessionManagerConfig = {}) {
    this.logger = new StructuredLogger({ action: 'session_manager' });
    this.sessionDuration = config.sessionDuration || 8 * 60 * 60 * 1000; // 8 horas
    this.refreshWindow = config.refreshWindow || 30 * 60 * 1000; // 30 minutos
    this.useRedis = config.useRedis || false;
    
    const secret = config.jwtSecret || process.env.JWT_SECRET || 'change-this-secret-in-production';
    this.jwtSecret = new TextEncoder().encode(secret);
    
    // Advertir si está en producción sin Redis
    if (process.env.NODE_ENV === 'production' && !this.useRedis) {
      this.logger.warn('SessionManager en producción sin Redis - no recomendado para alta disponibilidad');
    }
    
    // Iniciar limpieza periódica del almacenamiento en memoria
    if (!this.useRedis) {
      this.startMemoryCleanup();
    }
  }

  /**
   * Crea una nueva sesión y retorna el JWT
   */
  async createSession(
    data: Omit<SessionData, 'createdAt' | 'lastActivity' | 'sessionId' | 'iat' | 'exp'>
  ): Promise<string> {
    const sessionId = nanoid(32);
    const now = Date.now();
    
    const session = {
      ...data,
      sessionId,
      createdAt: now,
      lastActivity: now,
    } as SessionData;

    try {
      // Almacenar sesión
      if (this.useRedis) {
        await this.storeInRedis(sessionId, session);
      } else {
        this.storeInMemory(sessionId, session);
      }

      // Generar JWT
      const token = await new SignJWT({ ...session })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime(Math.floor((now + this.sessionDuration) / 1000))
        .setIssuedAt(Math.floor(now / 1000))
        .setJti(sessionId)
        .sign(this.jwtSecret);

      // Registrar dispositivo del usuario
      await this.registerUserDevice(session.userId, session.deviceId);

      // Audit log
      this.logger.audit('SESSION_CREATED', {
        userId: data.userId,
        employeeId: data.employeeId,
        role: data.role,
        ipAddress: data.ipAddress,
        deviceId: data.deviceId,
        sessionId,
      });

      return token;
    } catch (error: any) {
      this.logger.error('Error creando sesión', error);
      throw new Error('No se pudo crear la sesión');
    }
  }

  /**
   * Valida un token JWT y retorna los datos de sesión
   */
  async validateSession(token: string, currentIpAddress: string): Promise<SessionData | null> {
    try {
      // Verificar JWT
      const verified = await jwtVerify(token, this.jwtSecret);
      const session = verified.payload as SessionData;

      if (!session.sessionId) {
        this.logger.warn('Token sin sessionId', { jti: verified.payload.jti });
        return null;
      }

      // Verificar que la sesión exista en el storage
      const storedSession = this.useRedis
        ? await this.getFromRedis(session.sessionId)
        : this.getFromMemory(session.sessionId);

      if (!storedSession) {
        this.logger.warn('Sesión no encontrada en storage', { sessionId: session.sessionId });
        return null;
      }

      // Verificar cambio de IP (detección de hijacking)
      if (storedSession.ipAddress !== currentIpAddress) {
        this.logger.audit('IP_CHANGE_DETECTED', {
          userId: storedSession.userId,
          sessionId: session.sessionId,
          oldIp: storedSession.ipAddress,
          newIp: currentIpAddress,
        });
        
        // En producción: Podríamos forzar re-autenticación
        // Por ahora, solo logueamos y actualizamos la IP
        storedSession.ipAddress = currentIpAddress;
      }

      // Actualizar última actividad
      storedSession.lastActivity = Date.now();
      
      if (this.useRedis) {
        await this.storeInRedis(session.sessionId, storedSession);
      } else {
        this.storeInMemory(session.sessionId, storedSession);
      }

      return storedSession;
    } catch (error: any) {
      this.logger.warn('Token inválido o expirado', {
        error: error.message,
        token: token.substring(0, 20),
      });
      return null;
    }
  }

  /**
   * Revoca una sesión específica
   */
  async revokeSession(sessionId: string, reason: string): Promise<void> {
    try {
      const session = this.useRedis
        ? await this.getFromRedis(sessionId)
        : this.getFromMemory(sessionId);

      if (session) {
        // Eliminar del storage
        if (this.useRedis) {
          await this.deleteFromRedis(sessionId);
        } else {
          this.deleteFromMemory(sessionId);
        }

        this.logger.audit('SESSION_REVOKED', {
          userId: session.userId,
          sessionId,
          reason,
        });
      }
    } catch (error: any) {
      this.logger.error('Error revocando sesión', error, { sessionId, reason });
    }
  }

  /**
   * Revoca todas las sesiones de un usuario
   */
  async revokeAllUserSessions(userId: string, reason: string = 'manual'): Promise<void> {
    try {
      if (this.useRedis) {
        // Implementar búsqueda en Redis
        this.logger.warn('revokeAllUserSessions con Redis no implementado completamente');
      } else {
        // Buscar y eliminar todas las sesiones del usuario en memoria
        const userSessions: string[] = [];
        
        for (const [sessionId, session] of this.memoryStore.entries()) {
          if (session.userId === userId) {
            userSessions.push(sessionId);
          }
        }

        for (const sessionId of userSessions) {
          this.deleteFromMemory(sessionId);
        }

        this.logger.audit('ALL_USER_SESSIONS_REVOKED', {
          userId,
          reason,
          count: userSessions.length,
        });
      }
    } catch (error: any) {
      this.logger.error('Error revocando sesiones del usuario', error, { userId, reason });
    }
  }

  /**
   * Obtiene información de sesiones activas de un usuario
   */
  async getUserActiveSessions(userId: string): Promise<SessionData[]> {
    if (this.useRedis) {
      // TODO: Implementar búsqueda en Redis
      this.logger.warn('getUserActiveSessions con Redis no implementado');
      return [];
    } else {
      const sessions: SessionData[] = [];
      const now = Date.now();

      for (const [sessionId, session] of this.memoryStore.entries()) {
        if (session.userId === userId) {
          const expiration = this.memoryExpiration.get(sessionId);
          if (expiration && expiration > now) {
            sessions.push(session);
          }
        }
      }

      return sessions;
    }
  }

  /**
   * Refresca una sesión extendiendo su expiración
   */
  async refreshSession(sessionId: string): Promise<string | null> {
    try {
      const session = this.useRedis
        ? await this.getFromRedis(sessionId)
        : this.getFromMemory(sessionId);

      if (!session) {
        return null;
      }

      const now = Date.now();
      session.lastActivity = now;

      // Generar nuevo token
      const token = await new SignJWT({ ...session })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime(Math.floor((now + this.sessionDuration) / 1000))
        .setIssuedAt(Math.floor(now / 1000))
        .setJti(sessionId)
        .sign(this.jwtSecret);

      // Actualizar en storage
      if (this.useRedis) {
        await this.storeInRedis(sessionId, session);
      } else {
        this.storeInMemory(sessionId, session);
      }

      this.logger.info('Sesión refrescada', { sessionId, userId: session.userId });

      return token;
    } catch (error: any) {
      this.logger.error('Error refrescando sesión', error, { sessionId });
      return null;
    }
  }

  /**
   * Verifica si una sesión necesita ser refrescada
   */
  needsRefresh(session: SessionData): boolean {
    const now = Date.now();
    const expiresAt = session.createdAt + this.sessionDuration;
    const refreshThreshold = expiresAt - this.refreshWindow;
    return now >= refreshThreshold;
  }

  // ========================================================================
  // MÉTODOS PRIVADOS - Almacenamiento en Redis
  // ========================================================================

  private async storeInRedis(sessionId: string, session: SessionData): Promise<void> {
    // TODO: Implementar con @upstash/redis cuando esté disponible
    throw new Error('Redis storage no implementado - usar modo memoria para desarrollo');
  }

  private async getFromRedis(sessionId: string): Promise<SessionData | null> {
    // TODO: Implementar con @upstash/redis cuando esté disponible
    throw new Error('Redis storage no implementado - usar modo memoria para desarrollo');
  }

  private async deleteFromRedis(sessionId: string): Promise<void> {
    // TODO: Implementar con @upstash/redis cuando esté disponible
    throw new Error('Redis storage no implementado - usar modo memoria para desarrollo');
  }

  // ========================================================================
  // MÉTODOS PRIVADOS - Almacenamiento en Memoria (Fallback)
  // ========================================================================

  private storeInMemory(sessionId: string, session: SessionData): void {
    this.memoryStore.set(sessionId, session);
    this.memoryExpiration.set(sessionId, session.createdAt + this.sessionDuration);
  }

  private getFromMemory(sessionId: string): SessionData | null {
    const session = this.memoryStore.get(sessionId);
    if (!session) return null;

    // Verificar expiración
    const expiration = this.memoryExpiration.get(sessionId);
    if (expiration && expiration < Date.now()) {
      this.deleteFromMemory(sessionId);
      return null;
    }

    return session;
  }

  private deleteFromMemory(sessionId: string): void {
    this.memoryStore.delete(sessionId);
    this.memoryExpiration.delete(sessionId);
  }

  private startMemoryCleanup(): void {
    // Limpiar sesiones expiradas cada 5 minutos
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const expiredSessions: string[] = [];

      for (const [sessionId, expiration] of this.memoryExpiration.entries()) {
        if (expiration < now) {
          expiredSessions.push(sessionId);
        }
      }

      for (const sessionId of expiredSessions) {
        this.deleteFromMemory(sessionId);
      }

      if (expiredSessions.length > 0) {
        this.logger.info('Sesiones expiradas limpiadas', { count: expiredSessions.length });
      }
    }, 5 * 60 * 1000);
  }

  // ========================================================================
  // MÉTODOS AUXILIARES
  // ========================================================================

  private async registerUserDevice(userId: string, deviceId: string): Promise<void> {
    // TODO: Implementar registro de dispositivos en BD
    // Por ahora solo logueamos
    this.logger.info('Dispositivo registrado', { userId, deviceId });
  }

  /**
   * Limpia recursos al destruir la instancia
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.memoryStore.clear();
    this.memoryExpiration.clear();
  }
}

/**
 * Instancia singleton para uso global
 */
let sessionManagerInstance: EnterpriseSessionManager | null = null;

export function getSessionManager(): EnterpriseSessionManager {
  if (!sessionManagerInstance) {
    sessionManagerInstance = new EnterpriseSessionManager({
      useRedis: process.env.REDIS_URL ? true : false,
      jwtSecret: process.env.JWT_SECRET,
    });
  }
  return sessionManagerInstance;
}

/**
 * Helper para extraer el token del header Authorization
 */
export function extractTokenFromHeader(authHeader: string | null): string | null {
  if (!authHeader) return null;
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }
  
  return parts[1];
}

/**
 * Helper para obtener IP del request
 */
export function getClientIp(request: Request): string {
  // Intentar obtener de headers de proxy
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }
  
  // Fallback
  return 'unknown';
}
