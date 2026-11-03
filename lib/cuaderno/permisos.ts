/**
 * Reglas del cuaderno de obra (lógica pura, sin Next ni Odoo): quién puede ver o tocar un asiento y qué archivos se
 * aceptan como foto.
 *
 * Antes cualquier empleado con sesión podía leer cualquier asiento (con su GPS), subsanarlo, subirle archivos de
 * cualquier tipo y descargarlos de vuelta con el tipo que él hubiera declarado (un .html subido se ejecutaba en el
 * dominio de la app).
 */
import { ROLES_PRIVILEGIADOS } from '../auth/access-rules';

interface SesionMinima {
  id: unknown;
  role: unknown;
}

const esPrivilegiado = (rol: unknown) => (ROLES_PRIVILEGIADOS as readonly string[]).includes(String(rol ?? ''));

/** Un asiento lo ve y lo trabaja su residente; el supervisor y el administrador ven todos. */
export function puedeTrabajarAsiento(sesion: SesionMinima | null, residenteId: number | null | undefined): boolean {
  if (!sesion) return false;
  if (esPrivilegiado(sesion.role)) return true;
  const yo = Number(sesion.id);
  return Number.isInteger(yo) && yo > 0 && residenteId != null && Number(residenteId) === yo;
}

/**
 * Quién puede LEER un asiento: su autor, el supervisor y el administrador, y el residente lee lo que anota el supervisor
 * (consultas absueltas, órdenes): sin eso no podría cumplirlas. Un empleado común no lee el cuaderno.
 */
export function puedeLeerAsiento(
  sesion: SesionMinima | null, residenteId: number | null | undefined, supervisorId: number | null | undefined,
): boolean {
  if (!sesion) return false;
  if (puedeTrabajarAsiento(sesion, residenteId)) return true;
  if (String(sesion.role) === 'resident' && supervisorId != null && Number(supervisorId) > 0) return true;
  const yo = Number(sesion.id);
  return Number.isInteger(yo) && yo > 0 && supervisorId != null && Number(supervisorId) === yo;
}

/**
 * Quién puede ANOTAR en el cuaderno: solo los profesionales acreditados (residente y supervisor; el administrador del
 * sistema también para soporte). Un empleado común no crea asientos. El rol sale de la sesión, no del navegador.
 */
export const ROLES_QUE_ANOTAN = ['resident', 'supervisor', 'admin'] as const;

export function puedeAnotar(sesion: SesionMinima | null): boolean {
  return !!sesion && (ROLES_QUE_ANOTAN as readonly string[]).includes(String(sesion.role ?? ''));
}

// ── Fotos ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export type TipoImagen = 'image/jpeg' | 'image/png' | 'image/webp';

export const EXTENSION_DE: Record<TipoImagen, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Tope de una foto ya decodificada. */
export const MAX_FOTO_BYTES = 8 * 1024 * 1024;

export function esTipoImagen(valor: unknown): valor is TipoImagen {
  return typeof valor === 'string' && Object.prototype.hasOwnProperty.call(EXTENSION_DE, valor);
}

/** El tipo REAL de la imagen según sus primeros bytes; lo que el cliente declare no cuenta. */
export function detectarTipoImagen(bytes: Uint8Array): TipoImagen | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return 'image/png';
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // RIFF
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50 // WEBP
  ) return 'image/webp';
  return null;
}

/** Nombre de archivo seguro: sin rutas ni caracteres raros, con la extensión del tipo real. */
export function nombreSeguroDeFoto(nombre: unknown, tipo: TipoImagen): string {
  const base = String(nombre ?? '')
    .split(/[\\/]/).pop()!
    .replace(/\.[^.]*$/, '')
    .replace(/[^A-Za-z0-9._ -]/g, '_')
    .trim()
    .slice(0, 80);
  return `${base || 'foto_obra'}.${EXTENSION_DE[tipo]}`;
}

/** Bytes que ocuparía un base64 al decodificarlo (sin decodificarlo todavía). */
export function bytesDeBase64(base64: string): number {
  const limpio = base64.replace(/\s/g, '');
  const relleno = limpio.endsWith('==') ? 2 : limpio.endsWith('=') ? 1 : 0;
  return Math.floor((limpio.length * 3) / 4) - relleno;
}

/** Ventana tras crear un asiento en la que su autor aún puede adjuntar fotos: la cola offline sube las fotos justo después de sincronizarlo. */
export const VENTANA_FOTOS_MS = 30 * 60 * 1000;

/**
 * ¿Se pueden agregar fotos a este asiento? Un borrador sí. Uno firmado ya no se modifica (guía del cuaderno §1.2): solo
 * dentro de la ventana de sincronización, y nunca si fue aprobado en el sistema anterior.
 */
export function fotoPermitida(estado: string, creadoEn: string | null | undefined, ahora: Date = new Date()): boolean {
  if (estado === 'draft') return true;
  if (estado === 'approved') return false;
  if (!creadoEn) return false;
  const t = new Date(creadoEn.includes('T') ? creadoEn : `${creadoEn.replace(' ', 'T')}Z`).getTime();
  return !Number.isNaN(t) && ahora.getTime() - t >= 0 && ahora.getTime() - t <= VENTANA_FOTOS_MS;
}
