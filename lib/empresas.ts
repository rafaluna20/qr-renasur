/**
 * Registro de empresas (cada una con su propio Odoo).
 *
 * Una misma app atiende a varias empresas. La empresa de cada petición SALE DE LA SESIÓN FIRMADA, nunca de un parámetro,
 * cabecera o subdominio que mande el navegador: así un empleado de una empresa no puede leer ni marcar en otra, aunque
 * los números de empleado se repitan entre servidores.
 *
 * Configuración (solo en el servidor): variable EMPRESAS_JSON con una lista:
 *   [{"id":"renasur","nombre":"Renasur","url":"https://odoo.renasur.example/jsonrpc","database":"renasur",
 *     "userId":8,"apiKey":"...","obra":true}, {...}]
 * Si no existe, se usa la configuración de siempre (ODOO_URL, ODOO_DATABASE, ODOO_USER_ID, ODOO_API_KEY) como una
 * única empresa; así lo ya desplegado sigue funcionando.
 */
export interface Empresa {
  id: string;
  nombre: string;
  url: string;
  database: string;
  userId: number;
  apiKey: string;
  /** El Odoo tiene el módulo de obra (campo x_obra_role, cuaderno). Sin él todos son «employee». */
  obra: boolean;
  /** Nombre del campo de rol en hr.employee. Renasur lo tiene como x_obra_role; el módulo de Akallpa lo llama obra_role. */
  campoRol: string;
  /**
   * Permite vincular a un empleado por su correo laboral cuando aún no tiene la cuenta de billetera anotada.
   * Es más débil (quien edite el correo en Odoo podría suplantar): úsalo solo mientras se cargan los vínculos.
   */
  vinculoPorCorreo: boolean;
}

export type EmpresaPublica = Pick<Empresa, 'id' | 'nombre'>;

const RE_ID = /^[a-z][a-z0-9_-]{1,29}$/;

export class ErrorEmpresas extends Error {}

/** Nombre de campo de Odoo permitido (letras, dígitos y guion bajo): entra en consultas, así que no se acepta cualquier texto. */
function campoRol(valor: unknown, id: string): string {
  if (valor === undefined || valor === null || valor === '') return 'x_obra_role';
  if (typeof valor !== 'string' || !/^[a-z][a-z0-9_]{1,63}$/.test(valor)) throw new ErrorEmpresas(`Empresa «${id}»: campoRol inválido`);
  return valor;
}

function texto(valor: unknown, campo: string, id: string): string {
  if (typeof valor !== 'string' || !valor.trim()) throw new ErrorEmpresas(`Empresa «${id}»: falta ${campo}`);
  return valor.trim();
}

function validarUrl(url: string, id: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ErrorEmpresas(`Empresa «${id}»: la URL no es válida`);
  }
  const local = ['localhost', '127.0.0.1'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) {
    throw new ErrorEmpresas(`Empresa «${id}»: la URL debe ser https`);
  }
  return url.replace(/\/+$/, '');
}

/** Lee y valida la lista. Cualquier error de configuración se reporta (no se ignora en silencio). */
export function leerEmpresas(env: Record<string, string | undefined> = process.env): Empresa[] {
  const crudo = env.EMPRESAS_JSON?.trim();
  if (!crudo) {
    const { ODOO_URL, ODOO_DATABASE, ODOO_USER_ID, ODOO_API_KEY } = env;
    if (!ODOO_URL || !ODOO_DATABASE || !ODOO_USER_ID || !ODOO_API_KEY) return [];
    return [{
      id: 'principal', nombre: env.EMPRESA_NOMBRE?.trim() || 'Empresa', url: ODOO_URL.replace(/\/+$/, ''),
      database: ODOO_DATABASE, userId: Number(ODOO_USER_ID), apiKey: ODOO_API_KEY, obra: true, campoRol: 'x_obra_role', vinculoPorCorreo: true,
    }];
  }

  let lista: unknown;
  try {
    lista = JSON.parse(crudo);
  } catch {
    throw new ErrorEmpresas('EMPRESAS_JSON no es un JSON válido');
  }
  if (!Array.isArray(lista) || lista.length === 0) throw new ErrorEmpresas('EMPRESAS_JSON debe ser una lista con al menos una empresa');

  const vistos = new Set<string>();
  return lista.map((e: any) => {
    const id = typeof e?.id === 'string' ? e.id : '';
    if (!RE_ID.test(id)) throw new ErrorEmpresas(`Empresa con id inválido «${id}» (minúsculas, dígitos, - o _; 2 a 30 caracteres)`);
    if (vistos.has(id)) throw new ErrorEmpresas(`Empresa repetida: «${id}»`);
    vistos.add(id);
    const userId = Number(e.userId);
    if (!Number.isInteger(userId) || userId <= 0) throw new ErrorEmpresas(`Empresa «${id}»: userId inválido`);
    return {
      id,
      nombre: texto(e.nombre, 'nombre', id),
      url: validarUrl(texto(e.url, 'url', id), id),
      database: texto(e.database, 'database', id),
      userId,
      apiKey: texto(e.apiKey, 'apiKey', id),
      obra: e.obra !== false,
      campoRol: campoRol(e.campoRol, id),
      vinculoPorCorreo: e.vinculoPorCorreo === true,
    };
  });
}

let cache: Empresa[] | null = null;

export function empresas(): Empresa[] {
  if (!cache) cache = leerEmpresas();
  return cache;
}

export function reiniciarEmpresas(): void {
  cache = null;
}

/**
 * La empresa que corresponde a una sesión. Con una sola empresa configurada, una sesión antigua (sin empresa) sigue
 * valiendo; con varias, una sesión sin empresa NO se adivina: se rechaza para que vuelva a entrar.
 */
export function empresaDe(id: unknown, lista: Empresa[] = empresas()): Empresa {
  if (id === undefined || id === null || id === '') {
    if (lista.length === 1) return lista[0];
    throw new ErrorEmpresas('La sesión no indica la empresa');
  }
  const empresa = lista.find((e) => e.id === id);
  if (!empresa) throw new ErrorEmpresas('Empresa desconocida');
  return empresa;
}

export function esEmpresaConocida(id: unknown, lista: Empresa[] = empresas()): id is string {
  return typeof id === 'string' && lista.some((e) => e.id === id);
}
