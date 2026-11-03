/**
 * Validación de los asientos que llegan a /api/cuaderno/sync (la cola offline del navegador).
 *
 * Es deliberadamente MÁS FLOJA que AsientoSchema (asiento-validator.ts): ese exige textos mínimos que el formulario
 * no obliga, así que rechazaría asientos legítimos y los dejaría atascados para siempre en la cola del celular.
 * Aquí solo se exige lo que protege a Odoo: tipos, rangos, enumeraciones y largos máximos.
 */
import { z } from 'zod';

export const MAX_ASIENTOS_POR_LOTE = 50;
export const CLIMAS = ['soleado', 'nublado', 'lluvia_ligera', 'lluvia_fuerte'] as const;

const entero = z.coerce.number().int().positive().max(2147483647);
const opcionalNumero = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : v),
  z.coerce.number().finite().optional(),
);
const texto = (max: number) => z.string().max(max).optional().default('');

export const AsientoSyncSchema = z.object({
  offline_uuid: z.string().max(64).optional(),
  cuaderno_id: entero,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (AAAA-MM-DD)'),
  clima: z.enum(CLIMAS).optional().default('soleado'),
  personal: texto(500),
  equipos: texto(500),
  ocurrencias: texto(5000),
  latitude: opcionalNumero.pipe(z.number().min(-90).max(90).optional()),
  longitude: opcionalNumero.pipe(z.number().min(-180).max(180).optional()),
  gps_accuracy: opcionalNumero.pipe(z.number().min(0).max(100000).optional()),
  security_hash: z.string().regex(/^[a-f0-9]{64}$/i, 'Hash inválido').optional().or(z.literal('')),
  state: z.enum(['draft', 'signed_residente']).optional().default('draft'),
  residente_id: z.preprocess((v) => (v === '' || v === null ? undefined : v), entero.optional()),
  supervisor_id: z.preprocess((v) => (v === '' || v === null ? undefined : v), entero.optional()),
});

export type AsientoSync = z.infer<typeof AsientoSyncSchema>;

/**
 * La fecha de un asiento no puede ser anterior a 2020 ni más de un día futura (margen por la diferencia horaria:
 * el navegador manda la fecha en UTC y Perú va 5 horas atrás).
 */
export function fechaRazonable(fecha: string, ahora: Date = new Date()): boolean {
  const d = new Date(`${fecha}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== fecha) return false;
  const limite = ahora.getTime() + 36 * 60 * 60 * 1000;
  return d.getTime() >= Date.UTC(2020, 0, 1) && d.getTime() <= limite;
}

export type ResultadoAsiento = { ok: true; asiento: AsientoSync } | { ok: false; error: string };

export function validarAsientoSync(crudo: unknown, ahora: Date = new Date()): ResultadoAsiento {
  const r = AsientoSyncSchema.safeParse(crudo);
  if (!r.success) {
    const motivo = r.error.issues.map((i) => `${i.path.join('.') || 'asiento'}: ${i.message}`).slice(0, 3).join('; ');
    return { ok: false, error: `Datos inválidos (${motivo})` };
  }
  if (!fechaRazonable(r.data.date, ahora)) return { ok: false, error: 'Datos inválidos (date: fuera de rango)' };
  return { ok: true, asiento: r.data };
}
