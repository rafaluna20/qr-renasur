/**
 * Forma segura del detalle de un asiento para la pantalla del supervisor.
 *
 * Odoo devuelve `false` en vez de vacío y, según cómo esté definido cada campo, puede devolver texto donde la pantalla
 * espera un número (o al revés). La pantalla llamaba métodos como `.toFixed()` o `.length` directamente sobre esos
 * valores: un solo dato inesperado tumbaba toda la página con «excepción del lado del cliente». Aquí se normaliza todo
 * una sola vez, antes de pintar.
 */
export interface AsientoDetalle {
  id: number;
  name: string;
  date: string;
  clima: string;
  state: string;
  personal: string;
  equipos: string;
  ocurrencias: string;
  observacion: string;
  location: {
    latitude: number | null;
    longitude: number | null;
    hasGPS: boolean;
  };
  residente: { id: number; name: string } | null;
  supervisor: { id: number; name: string } | null;
  cuaderno: { id: number; name: string } | null;
  attachments: Array<{ id: number; name: string; url: string }>;
  createdAt: string;
}

const texto = (v: unknown): string => {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return ''; // null, undefined, false (el «vacío» de Odoo), objetos…
};

const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === false || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const relacion = (v: unknown): { id: number; name: string } | null => {
  if (!v || typeof v !== 'object') return null;
  const r = v as { id?: unknown; name?: unknown };
  const id = numero(r.id);
  return id === null ? null : { id, name: texto(r.name) };
};

export function normalizarAsiento(crudo: unknown): AsientoDetalle {
  const a = (crudo && typeof crudo === 'object' ? crudo : {}) as Record<string, any>;
  const loc = (a.location && typeof a.location === 'object' ? a.location : {}) as Record<string, unknown>;
  const latitude = numero(loc.latitude);
  const longitude = numero(loc.longitude);
  const id = numero(a.id) ?? 0;

  return {
    id,
    name: texto(a.name) || `Asiento #${id}`,
    date: texto(a.date),
    clima: texto(a.clima),
    state: texto(a.state),
    personal: texto(a.personal),
    equipos: texto(a.equipos),
    ocurrencias: texto(a.ocurrencias),
    observacion: texto(a.observacion),
    location: { latitude, longitude, hasGPS: latitude !== null && longitude !== null },
    residente: relacion(a.residente),
    supervisor: relacion(a.supervisor),
    cuaderno: relacion(a.cuaderno),
    attachments: (Array.isArray(a.attachments) ? a.attachments : [])
      .map((p: any) => ({ id: numero(p?.id) ?? 0, name: texto(p?.name), url: texto(p?.url) }))
      .filter((p: { id: number }) => p.id > 0),
    createdAt: texto(a.createdAt),
  };
}

/** Fecha legible; si el valor no es una fecha válida devuelve un guion en vez de «Invalid Date». */
export function fechaLegible(valor: string): string {
  if (!valor) return '—';
  // Odoo entrega «AAAA-MM-DD HH:MM:SS» en UTC.
  const d = new Date(valor.includes('T') ? valor : `${valor.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-PE', { timeZone: 'America/Lima' });
}

/**
 * ¿Se registró con retraso? El asiento lleva la fecha del día de la obra (la del celular); el servidor anota cuándo lo
 * recibió. Si pasaron más de 2 días entre ambos (obra sin señal, sincronización diferida) se avisa, sin rechazarlo.
 */
export function registradoConRetraso(fechaAsiento: string, recibidoEnServidor: string): boolean {
  if (!fechaAsiento || !recibidoEnServidor) return false;
  const a = new Date(`${fechaAsiento}T00:00:00Z`).getTime();
  const r = new Date(recibidoEnServidor.includes('T') ? recibidoEnServidor : `${recibidoEnServidor.replace(' ', 'T')}Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(r)) return false;
  return r - a > 3 * 24 * 60 * 60 * 1000;
}
