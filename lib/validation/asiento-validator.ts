import { z } from 'zod';
import DOMPurify from 'isomorphic-dompurify';
import { globalLogger } from '../observability/structured-logger';

/**
 * Error de validación personalizado
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public errors: string[]
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Schema de validación para asientos de cuaderno de obra
 */
export const AsientoSchema = z.object({
  // ID del cuaderno (requerido)
  cuaderno_id: z
    .string({ message: 'cuaderno_id es requerido' })
    .regex(/^\d+$/, 'cuaderno_id debe ser un número válido')
    .transform(Number)
    .refine((n) => n > 0 && n < 2147483647, {
      message: 'cuaderno_id fuera de rango válido',
    }),

  // Fecha (requerida, no puede ser futura ni muy antigua)
  date: z
    .string({ message: 'date es requerido' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (debe ser YYYY-MM-DD)')
    .refine(
      (dateStr) => {
        const date = new Date(dateStr);
        const now = new Date();
        now.setHours(23, 59, 59, 999); // Fin del día actual
        const minDate = new Date('2020-01-01'); // Límite inferior razonable
        return date >= minDate && date <= now;
      },
      {
        message: 'Fecha debe estar entre 2020-01-01 y hoy',
      }
    ),

  // Clima (enum restringido)
  clima: z.enum(['soleado', 'nublado', 'lluvia_ligera', 'lluvia_fuerte'], {
    message: 'Clima debe ser: soleado, nublado, lluvia_ligera o lluvia_fuerte',
  }),

  // Personal (texto sanitizado)
  personal: z
    .string({ message: 'personal es requerido' })
    .min(5, 'Descripción de personal muy corta (mínimo 5 caracteres)')
    .max(500, 'Descripción de personal muy larga (máximo 500 caracteres)')
    .transform((str) => DOMPurify.sanitize(str, { ALLOWED_TAGS: [] })),

  // Equipos (texto sanitizado)
  equipos: z
    .string({ message: 'equipos es requerido' })
    .min(5, 'Descripción de equipos muy corta (mínimo 5 caracteres)')
    .max(500, 'Descripción de equipos muy larga (máximo 500 caracteres)')
    .transform((str) => DOMPurify.sanitize(str, { ALLOWED_TAGS: [] })),

  // Ocurrencias (texto sanitizado, más detallado)
  ocurrencias: z
    .string({ message: 'ocurrencias es requerido' })
    .min(20, 'Descripción de ocurrencias muy corta (mínimo 20 caracteres)')
    .max(5000, 'Descripción de ocurrencias muy larga (máximo 5000 caracteres)')
    .transform((str) => DOMPurify.sanitize(str, { ALLOWED_TAGS: [] })),

  // GPS - Latitud (opcional, pero validada si existe)
  latitude: z
    .number()
    .min(-90, 'Latitud debe estar entre -90 y 90')
    .max(90, 'Latitud debe estar entre -90 y 90')
    .or(z.literal(0))
    .optional()
    .default(0),

  // GPS - Longitud (opcional, pero validada si existe)
  longitude: z
    .number()
    .min(-180, 'Longitud debe estar entre -180 y 180')
    .max(180, 'Longitud debe estar entre -180 y 180')
    .or(z.literal(0))
    .optional()
    .default(0),

  // GPS - Precisión (opcional)
  gps_accuracy: z
    .number()
    .min(0, 'Precisión GPS no puede ser negativa')
    .max(10000, 'Precisión GPS sospechosamente alta (>10km)')
    .optional()
    .default(0),

  // Hash de seguridad (SHA-256 = 64 caracteres hexadecimales)
  security_hash: z
    .string()
    .length(64, 'Hash de seguridad debe tener 64 caracteres')
    .regex(/^[a-f0-9]{64}$/, 'Hash de seguridad inválido (debe ser SHA-256 en hex)')
    .optional(),

  // Estado (enum)
  state: z
    .enum(['draft', 'signed_residente', 'approved', 'rejected', 'resolved'])
    .optional()
    .default('draft'),

  // IDs de empleados (opcionales)
  residente_id: z
    .string()
    .regex(/^\d+$/, 'residente_id debe ser numérico')
    .transform(Number)
    .optional(),

  supervisor_id: z
    .string()
    .regex(/^\d+$/, 'supervisor_id debe ser numérico')
    .transform(Number)
    .optional(),

  // UUID offline
  offline_uuid: z.string().uuid('offline_uuid debe ser un UUID válido').optional(),

  // Timestamp de creación
  created_at: z.number().positive('created_at debe ser un timestamp positivo').optional(),

  // Flag de sincronización
  synced: z.boolean().optional(),

  // Fotos (opcional)
  photos: z
    .array(
      z.object({
        name: z.string().min(1, 'Nombre de foto no puede estar vacío'),
        base64: z.string().min(100, 'Datos de foto inválidos'),
        mimetype: z
          .string()
          .regex(/^image\/(jpeg|jpg|png|webp|gif)$/i, 'Tipo de imagen no soportado'),
        hash: z.string().optional(),
      })
    )
    .optional(),
});

/**
 * Tipo inferido del schema
 */
export type AsientoValidado = z.infer<typeof AsientoSchema>;

/**
 * Schema para lotes de asientos
 */
export const AsientosBatchSchema = z.object({
  asientos: z
    .array(AsientoSchema)
    .min(1, 'Debe enviar al menos un asiento')
    .max(50, 'No se pueden sincronizar más de 50 asientos a la vez'),
});

/**
 * Schema para aprobar/rechazar asientos
 */
export const AsientoActionSchema = z.object({
  id: z
    .number()
    .or(z.string().regex(/^\d+$/).transform(Number))
    .refine((n) => n > 0, 'ID debe ser mayor que 0'),
  observacion: z
    .string()
    .max(1000, 'Observación muy larga (máximo 1000 caracteres)')
    .transform((str) => DOMPurify.sanitize(str, { ALLOWED_TAGS: [] }))
    .optional()
    .default(''),
});

/**
 * Schema para subsanar asientos
 */
export const AsientoResolveSchema = z.object({
  id: z
    .number()
    .or(z.string().regex(/^\d+$/).transform(Number))
    .refine((n) => n > 0, 'ID debe ser mayor que 0'),
  observacion: z
    .string()
    .min(10, 'Texto de subsanación muy corto (mínimo 10 caracteres)')
    .max(1000, 'Texto de subsanación muy largo (máximo 1000 caracteres)')
    .transform((str) => DOMPurify.sanitize(str, { ALLOWED_TAGS: [] })),
});

/**
 * Valida un asiento individual
 */
export function validateAsiento(data: unknown): AsientoValidado {
  try {
    return AsientoSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`);
      
      globalLogger.warn('Validación de asiento falló', {
        errors: errorMessages,
        data: JSON.stringify(data).substring(0, 200),
      });
      
      throw new ValidationError('Datos del asiento inválidos', errorMessages);
    }
    throw error;
  }
}

/**
 * Valida un lote de asientos
 */
export function validateAsientosBatch(data: unknown): { asientos: AsientoValidado[] } {
  try {
    return AsientosBatchSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`);
      
      globalLogger.warn('Validación de lote de asientos falló', {
        errors: errorMessages,
      });
      
      throw new ValidationError('Lote de asientos inválido', errorMessages);
    }
    throw error;
  }
}

/**
 * Valida acción sobre asiento (aprobar/rechazar)
 */
export function validateAsientoAction(data: unknown): z.infer<typeof AsientoActionSchema> {
  try {
    return AsientoActionSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`);
      
      globalLogger.warn('Validación de acción falló', {
        errors: errorMessages,
      });
      
      throw new ValidationError('Datos de acción inválidos', errorMessages);
    }
    throw error;
  }
}

/**
 * Valida subsanación de asiento
 */
export function validateAsientoResolve(data: unknown): z.infer<typeof AsientoResolveSchema> {
  try {
    return AsientoResolveSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`);
      
      globalLogger.warn('Validación de subsanación falló', {
        errors: errorMessages,
      });
      
      throw new ValidationError('Datos de subsanación inválidos', errorMessages);
    }
    throw error;
  }
}

/**
 * Valida coordenadas GPS
 */
export function validateGPSCoordinates(
  latitude: number,
  longitude: number
): { valid: boolean; reason?: string } {
  // Coordenadas 0,0 significa "sin GPS"
  if (latitude === 0 && longitude === 0) {
    return { valid: true };
  }

  // Validar rangos
  if (latitude < -90 || latitude > 90) {
    return { valid: false, reason: 'Latitud fuera de rango (-90 a 90)' };
  }

  if (longitude < -180 || longitude > 180) {
    return { valid: false, reason: 'Longitud fuera de rango (-180 a 180)' };
  }

  // Validar que no sean coordenadas sospechosas
  // (e.g., exactamente en el ecuador y meridiano de Greenwich)
  const suspiciousCoords = [
    { lat: 0, lon: 0 }, // Null Island
    { lat: 90, lon: 0 }, // Polo Norte exacto
    { lat: -90, lon: 0 }, // Polo Sur exacto
  ];

  const isSuspicious = suspiciousCoords.some(
    (coord) => Math.abs(latitude - coord.lat) < 0.0001 && Math.abs(longitude - coord.lon) < 0.0001
  );

  if (isSuspicious) {
    return { valid: false, reason: 'Coordenadas sospechosas' };
  }

  return { valid: true };
}

/**
 * Valida que un hash de seguridad sea correcto
 */
export async function validateSecurityHash(
  asiento: Partial<AsientoValidado>
): Promise<{ valid: boolean; reason?: string }> {
  if (!asiento.security_hash) {
    return { valid: false, reason: 'Hash de seguridad faltante' };
  }

  try {
    // Recalcular hash con los mismos datos
    const hashInput = `${asiento.date}|${asiento.latitude ?? 0},${asiento.longitude ?? 0}|${asiento.ocurrencias}`;
    const msgUint8 = new TextEncoder().encode(hashInput);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const calculatedHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    if (calculatedHash !== asiento.security_hash) {
      return { valid: false, reason: 'Hash de seguridad no coincide - datos alterados' };
    }

    return { valid: true };
  } catch (error: any) {
    globalLogger.error('Error validando hash de seguridad', error);
    return { valid: false, reason: 'Error al validar hash' };
  }
}

/**
 * Sanitiza entrada de texto para prevenir XSS
 */
export function sanitizeText(text: string, allowTags: string[] = []): string {
  return DOMPurify.sanitize(text, {
    ALLOWED_TAGS: allowTags,
    ALLOWED_ATTR: [],
  });
}

/**
 * Valida tamaño de archivo (fotos)
 */
export function validateFileSize(
  base64: string,
  maxSizeMB: number = 10
): { valid: boolean; sizeMB?: number; reason?: string } {
  try {
    // Calcular tamaño en bytes (base64 tiene ~33% overhead)
    const sizeBytes = (base64.length * 3) / 4;
    const sizeMB = sizeBytes / (1024 * 1024);

    if (sizeMB > maxSizeMB) {
      return {
        valid: false,
        sizeMB,
        reason: `Archivo muy grande (${sizeMB.toFixed(2)}MB > ${maxSizeMB}MB)`,
      };
    }

    return { valid: true, sizeMB };
  } catch (error: any) {
    return { valid: false, reason: 'Error calculando tamaño de archivo' };
  }
}

/**
 * Middleware para validar request bodies en API routes
 */
export function withValidation<T extends z.ZodSchema>(schema: T) {
  return (handler: (data: z.infer<T>, req: any) => Promise<Response>) => {
    return async (req: Request) => {
      try {
        const body = await req.json();
        const validatedData = schema.parse(body);
        return await handler(validatedData, req);
      } catch (error) {
        if (error instanceof z.ZodError) {
          const errorMessages = error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`);
          
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Validación fallida',
              details: errorMessages,
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }
        
        throw error;
      }
    };
  };
}
