/**
 * Tipología de asientos del cuaderno de obra digital (lógica pura, sin Next ni Odoo).
 *
 * Basada en la «Guía operativa del cuaderno de obra digital» (§2 y §5). Los tipos y quién los emite son los de la guía;
 * lo marcado como SUPUESTO lo decidí yo y debe confirmarlo quien firme el cuaderno:
 *  - SUPUESTO: «aclaracion» (corrección de un asiento anterior, §1.2) la pueden emitir residente y supervisor.
 *  - SUPUESTO: el supervisor no emite asientos informativos (A); el residente no emite órdenes ni respuestas (C).
 *  - SUPUESTO: «hitos» (D) los emiten ambos, como dice la guía.
 * Esto es una propuesta de proceso: las reglas del contrato (plazos, quién responde) las fija quien firma la obra.
 */

export type Categoria = 'A' | 'B' | 'C' | 'D';

export interface TipoAsiento {
  clave: string;
  etiqueta: string;
  categoria: Categoria;
  /** Roles de la app que pueden emitirlo. */
  emisores: readonly string[];
  /** Genera la obligación de que el supervisor responda (la firma marca el inicio del plazo). */
  requiereRespuesta?: boolean;
  /** Debe citar a otro asiento. */
  requiereReferencia?: boolean;
}

export const CATEGORIAS: Record<Categoria, string> = {
  A: 'Informativos',
  B: 'Consultas y solicitudes',
  C: 'Órdenes y respuestas',
  D: 'Hitos contractuales',
};

const RES = ['resident', 'admin'] as const;
const SUP = ['supervisor', 'admin'] as const;
const AMBOS = ['resident', 'supervisor', 'admin'] as const;

export const TIPOS: readonly TipoAsiento[] = [
  // A. Informativos (residente)
  { clave: 'avance_diario', etiqueta: 'Avance diario y ocurrencias', categoria: 'A', emisores: RES },
  { clave: 'recursos', etiqueta: 'Ingreso de personal, equipo y materiales', categoria: 'A', emisores: RES },
  { clave: 'ensayo', etiqueta: 'Ensayo de control de calidad', categoria: 'A', emisores: RES },
  { clave: 'aclaracion', etiqueta: 'Aclaración o corrección de un asiento anterior', categoria: 'A', emisores: AMBOS, requiereReferencia: true },
  // B. Consultas y solicitudes (residente) — generan plazo de respuesta
  { clave: 'consulta_tecnica', etiqueta: 'Consulta sobre el expediente técnico', categoria: 'B', emisores: RES, requiereRespuesta: true },
  { clave: 'solicitud_adicional', etiqueta: 'Solicitud de adicional / mayores metrados', categoria: 'B', emisores: RES, requiereRespuesta: true },
  { clave: 'solicitud_recepcion', etiqueta: 'Solicitud de recepción de obra', categoria: 'B', emisores: RES, requiereRespuesta: true },
  // C. Órdenes y respuestas (supervisor)
  { clave: 'absolucion', etiqueta: 'Absolución de consulta', categoria: 'C', emisores: SUP, requiereReferencia: true },
  { clave: 'orden', etiqueta: 'Orden de corrección o paralización', categoria: 'C', emisores: SUP },
  { clave: 'pronunciamiento_valorizacion', etiqueta: 'Aprobación u observación de valorización', categoria: 'C', emisores: SUP },
  // D. Hitos contractuales (ambos)
  { clave: 'apertura_cierre', etiqueta: 'Apertura o cierre del cuaderno', categoria: 'D', emisores: AMBOS },
  { clave: 'ampliacion_plazo', etiqueta: 'Causal de ampliación de plazo', categoria: 'D', emisores: AMBOS },
  { clave: 'suspension_reinicio', etiqueta: 'Suspensión o reinicio de plazo', categoria: 'D', emisores: AMBOS },
];

export const TIPO_POR_DEFECTO = 'avance_diario';

export const tipoDe = (clave: unknown): TipoAsiento | undefined =>
  typeof clave === 'string' ? TIPOS.find((t) => t.clave === clave) : undefined;

/** Tipos que un rol puede emitir (el rol sale de la sesión). */
export function tiposPermitidos(rol: unknown): TipoAsiento[] {
  return TIPOS.filter((t) => t.emisores.includes(String(rol ?? '')));
}

export const puedeEmitir = (rol: unknown, clave: unknown): boolean => {
  const t = tipoDe(clave);
  return !!t && t.emisores.includes(String(rol ?? ''));
};

/** Los asientos informativos (A) son de redacción libre; los demás exigen la estructura Hecho–Causa–Efecto–Solicitud. */
export const requiereEstructura = (clave: unknown): boolean => {
  const t = tipoDe(clave);
  return !!t && t.categoria !== 'A';
};

// ── Redacción HECHO – CAUSA – EFECTO – SOLICITUD (guía §5) ───────────────────────────────────────────────────────────

export interface Redaccion {
  hecho: string;
  causa: string;
  efecto: string;
  solicitud: string;
}

const SECCIONES: { clave: keyof Redaccion; titulo: string }[] = [
  { clave: 'hecho', titulo: 'HECHO' },
  { clave: 'causa', titulo: 'CAUSA' },
  { clave: 'efecto', titulo: 'EFECTO' },
  { clave: 'solicitud', titulo: 'SOLICITUD / CONCLUSIÓN' },
];

export const MAX_SECCION = 1500;

/** Arma el texto que se guarda en «ocurrencias»: cuatro secciones con su título. */
export function componerRedaccion(r: Redaccion): string {
  return SECCIONES.map((s) => `${s.titulo}:\n${(r[s.clave] ?? '').trim()}`).join('\n\n');
}

/** Lee de vuelta las cuatro secciones de un texto compuesto con `componerRedaccion` (o null si no tiene esa forma). */
export function leerRedaccion(texto: string): Redaccion | null {
  const out: Partial<Redaccion> = {};
  let resto = texto.replace(/\r\n/g, '\n');
  for (let i = 0; i < SECCIONES.length; i++) {
    const { clave, titulo } = SECCIONES[i];
    const inicio = resto.indexOf(`${titulo}:\n`);
    if (inicio === -1) return null;
    const desde = inicio + titulo.length + 2;
    const siguiente = SECCIONES[i + 1] ? resto.indexOf(`\n\n${SECCIONES[i + 1].titulo}:\n`, desde) : -1;
    if (SECCIONES[i + 1] && siguiente === -1) return null;
    out[clave] = (siguiente === -1 ? resto.slice(desde) : resto.slice(desde, siguiente)).trim();
    resto = siguiente === -1 ? '' : resto.slice(siguiente + 2);
  }
  return out as Redaccion;
}

/** ¿Las cuatro secciones tienen contenido (mínimo 10 caracteres cada una) y no pasan del máximo? */
export function redaccionValida(texto: string): { ok: true } | { ok: false; motivo: string } {
  const r = leerRedaccion(texto);
  if (!r) return { ok: false, motivo: 'Falta la estructura Hecho, Causa, Efecto y Solicitud' };
  for (const s of SECCIONES) {
    const v = r[s.clave];
    if (v.length < 10) return { ok: false, motivo: `La sección «${s.titulo}» está vacía o es muy corta (mínimo 10 caracteres)` };
    if (v.length > MAX_SECCION) return { ok: false, motivo: `La sección «${s.titulo}» es muy larga (máximo ${MAX_SECCION} caracteres)` };
  }
  return { ok: true };
}

// ── Plazo de respuesta ───────────────────────────────────────────────────────────────────────────────────────────────

export type EstadoPlazo = 'no_aplica' | 'atendido' | 'en_plazo' | 'por_vencer' | 'vencido';

/**
 * Estado del plazo de una consulta o solicitud. El plazo (días) lo fija el contrato de cada obra: no hay un valor legal
 * escrito en el código. «Por vencer» = faltan menos de 24 horas.
 */
export function estadoPlazo(
  tipo: unknown, plazoLimite: string | null | undefined, atendido: boolean, ahora: Date = new Date(),
): EstadoPlazo {
  const t = tipoDe(tipo);
  if (!t?.requiereRespuesta) return 'no_aplica';
  if (atendido) return 'atendido';
  if (!plazoLimite) return 'en_plazo';
  const limite = new Date(plazoLimite.includes('T') ? plazoLimite : `${plazoLimite.replace(' ', 'T')}Z`).getTime();
  if (Number.isNaN(limite)) return 'en_plazo';
  const falta = limite - ahora.getTime();
  if (falta < 0) return 'vencido';
  return falta < 24 * 60 * 60 * 1000 ? 'por_vencer' : 'en_plazo';
}
