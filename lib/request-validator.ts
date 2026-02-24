/**
 * Middleware de Validación de Requests
 * 
 * Proporciona funciones para validar y sanitizar
 * datos de entrada en API routes.
 */

import { NextRequest } from 'next/server';
import { z, ZodSchema } from 'zod';
import { logger } from './logger';

/**
 * Extraer y validar el body de un request
 */
export async function validateRequestBody<T>(
  req: NextRequest,
  schema: ZodSchema<T>
): Promise<T> {
  try {
    const body = await req.json();
    return schema.parse(body);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('JSON inválido en el body del request');
    }
    throw error;
  }
}

/**
 * Extraer metadata útil del request
 */
export function extractRequestMetadata(req: NextRequest) {
  // Extraer IP de headers (Next.js no expone req.ip directamente)
  const forwardedFor = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const ip = forwardedFor?.split(',')[0] || realIp || 'unknown';

  return {
    method: req.method,
    url: req.url,
    ip,
    userAgent: req.headers.get('user-agent') || 'unknown',
    contentType: req.headers.get('content-type'),
  };
}

/**
 * Verificar que el método HTTP es el correcto
 */
export function validateMethod(
  req: NextRequest,
  allowedMethods: string[]
): boolean {
  return allowedMethods.includes(req.method);
}

/**
 * Rate limiting simple (en memoria)
 * NOTA: En producción usar Redis o servicio externo
 */
class InMemoryRateLimiter {
  private requests: Map<string, number[]> = new Map();
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs: number = 60000, maxRequests: number = 100) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  check(identifier: string): { allowed: boolean; remaining: number } {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Obtener requests del identifier
    let requestTimestamps = this.requests.get(identifier) || [];

    // Filtrar requests fuera de la ventana
    requestTimestamps = requestTimestamps.filter(ts => ts > windowStart);

    // Verificar límite
    if (requestTimestamps.length >= this.maxRequests) {
      this.requests.set(identifier, requestTimestamps);
      return {
        allowed: false,
        remaining: 0,
      };
    }

    // Añadir nuevo request
    requestTimestamps.push(now);
    this.requests.set(identifier, requestTimestamps);

    return {
      allowed: true,
      remaining: this.maxRequests - requestTimestamps.length,
    };
  }

  // Limpiar requests antiguos periódicamente
  cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    for (const [identifier, timestamps] of this.requests.entries()) {
      const filtered = timestamps.filter(ts => ts > windowStart);
      if (filtered.length === 0) {
        this.requests.delete(identifier);
      } else {
        this.requests.set(identifier, filtered);
      }
    }
  }
}

// Instancia global (en producción, usar Redis)
const globalRateLimiter = new InMemoryRateLimiter(60000, 100);

// Cleanup cada 5 minutos
if (typeof window === 'undefined') {
  setInterval(() => globalRateLimiter.cleanup(), 5 * 60 * 1000);
}

/**
 * Verificar rate limit
 */
export function checkRateLimit(
  req: NextRequest,
  options?: {
    windowMs?: number;
    maxRequests?: number;
    identifier?: string;
  }
): { allowed: boolean; remaining: number } {
  // Extraer IP para identifier
  const metadata = extractRequestMetadata(req);
  const identifier = options?.identifier || metadata.ip;
  
  // Si se especifican opciones custom, crear limiter temporal
  if (options?.windowMs || options?.maxRequests) {
    const limiter = new InMemoryRateLimiter(
      options.windowMs || 60000,
      options.maxRequests || 100
    );
    return limiter.check(identifier);
  }

  // Usar limiter global
  return globalRateLimiter.check(identifier);
}

/**
 * Schemas de validación comunes
 */
export const commonSchemas = {
  /**
   * ID numérico positivo
   */
  positiveId: z.number().positive('ID debe ser un número positivo'),

  /**
   * ID que puede ser string o number
   */
  flexibleId: z.union([
    z.number().positive(),
    z.string().regex(/^\d+$/, 'ID debe ser numérico')
  ]).transform(val => Number(val)),

  /**
   * Email válido
   */
  email: z.string().email('Email inválido'),

  /**
   * DNI peruano (8 dígitos)
   */
  dni: z.string().regex(/^\d{8}$/, 'DNI debe tener 8 dígitos'),

  /**
   * Teléfono peruano (9 dígitos, empieza con 9)
   */
  phone: z.string().regex(/^9\d{8}$/, 'Teléfono debe empezar con 9 y tener 9 dígitos'),

  /**
   * Fecha ISO 8601
   */
  isoDate: z.string().datetime('Fecha debe estar en formato ISO 8601'),

  /**
   * Boolean flexible (acepta "true", "false", 1, 0)
   */
  flexibleBoolean: z.union([
    z.boolean(),
    z.string().transform(val => val.toLowerCase() === 'true'),
    z.number().transform(val => val === 1)
  ]),

  /**
   * Paginación
   */
  pagination: z.object({
    page: z.number().positive().default(1),
    limit: z.number().positive().max(100).default(20),
  }),
};

/**
 * Sanitizar string (prevenir XSS básico)
 */
export function sanitizeString(str: string): string {
  return str
    .replace(/[<>]/g, '') // Remover < y >
    .trim();
}

/**
 * Validar Content-Type
 */
export function validateContentType(
  req: NextRequest,
  expectedType: string = 'application/json'
): boolean {
  const contentType = req.headers.get('content-type');
  return contentType?.includes(expectedType) || false;
}

/**
 * Logger de validación
 */
export function logValidationError(
  req: NextRequest,
  error: z.ZodError
): void {
  const metadata = extractRequestMetadata(req);
  logger.warn('Validation failed', {
    ...metadata,
    errors: error.issues,
  });
}
