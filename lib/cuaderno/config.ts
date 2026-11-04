import { empresas, type Empresa } from '../empresas';

/**
 * Interruptor de la tipologia de asientos (fase 2 y 3 del cuaderno), POR EMPRESA.
 *
 * Los campos nuevos (tipo, asiento citado, fecha de firma, plazo, huella) solo existen en el Odoo DESPUES de actualizar el
 * modulo `obras_cuaderno`, y cada empresa tiene su propio Odoo. Se enciende con `"cuadernoTipos": true` en la entrada de
 * la empresa en EMPRESAS_JSON; si no se indica, vale la variable global CUADERNO_TIPOS (por defecto apagada). Pedir esos
 * campos a un Odoo sin actualizar devolveria «Invalid field» y romperia la lista y el detalle.
 *
 * Sin empresa conocida (y con varias configuradas) devuelve false: nunca se adivina.
 */
export function tiposActivos(empresaId?: unknown, lista?: Empresa[]): boolean {
  try {
    const todas = lista ?? empresas();
    const e = typeof empresaId === 'string' ? todas.find((x) => x.id === empresaId) : todas.length === 1 ? todas[0] : undefined;
    return e?.cuadernoTipos === true;
  } catch {
    return false;
  }
}

/** Campos extra que se leen de obra.cuaderno.asiento cuando la tipología está activa. */
export const CAMPOS_TIPOLOGIA = ['tipo', 'asiento_referido_id', 'fecha_firma', 'plazo_limite', 'atendido', 'supervisor_id'] as const;

/** Evidencia de la firma (solo en el detalle de un asiento: la huella se recalcula en Odoo al leerla). */
export const CAMPOS_INTEGRIDAD = ['firma_hash', 'firmado_por_id', 'integridad_ok', 'firma_ip', 'firma_metodo', 'sello_servidor'] as const;
