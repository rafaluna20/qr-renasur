/**
 * Interruptor de la tipología de asientos (fase 2 del cuaderno).
 *
 * Los campos nuevos (tipo, asiento citado, fecha de firma, plazo) solo existen en el Odoo DESPUÉS de actualizar el módulo
 * `obras_cuaderno`. Mientras CUADERNO_TIPOS no sea «true» la app se comporta como antes y no pide ni envía esos campos
 * (pedirlos a un Odoo sin actualizar devolvería «Invalid field» y rompería la lista y el detalle).
 */
export function tiposActivos(env: Record<string, string | undefined> = process.env): boolean {
  return env.CUADERNO_TIPOS?.trim().toLowerCase() === 'true';
}

/** Campos extra que se leen de obra.cuaderno.asiento cuando la tipología está activa. */
export const CAMPOS_TIPOLOGIA = ['tipo', 'asiento_referido_id', 'fecha_firma', 'plazo_limite', 'atendido', 'supervisor_id'] as const;
