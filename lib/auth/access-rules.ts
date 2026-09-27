/**
 * Reglas de acceso de la API (lógica pura, sin Next ni Odoo): quién puede llamar a cada ruta.
 *
 * Antes NINGUNA ruta de /api comprobaba la sesión (el middleware las excluía): cualquiera en internet podía listar los
 * empleados con su DNI, registrar asistencia por otra persona, aprobar asientos o bajar cualquier adjunto de Odoo.
 * Ahora TODO /api exige sesión salvo la lista blanca de abajo, y algunas rutas exigen además un rol.
 */

export type Regla = { tipo: "publica" } | { tipo: "sesion"; roles?: readonly string[] };

/** Rutas sin sesión: entrar, salir, el inicio de sesión único y el chequeo de salud. Coincidencia EXACTA. */
const PUBLICAS = new Set(["/api/health", "/api/auth/login", "/api/auth/logout", "/api/auth/sso", "/api/auth/empresa"]);
// /api/auth/empresa (elegir o cambiar de empresa) valida por su cuenta la cookie pendiente o la sesión.

export const ROLES_PRIVILEGIADOS = ["supervisor", "admin"] as const;

/** Rutas que exigen un rol concreto (por prefijo con límite de segmento). */
const POR_ROL: { prefijo: string; roles: readonly string[] }[] = [
  { prefijo: "/api/cuaderno/approve", roles: ROLES_PRIVILEGIADOS },
  { prefijo: "/api/cuaderno/reject", roles: ROLES_PRIVILEGIADOS },
  { prefijo: "/api/users", roles: ["admin"] },
  { prefijo: "/api/diagnostic", roles: ["admin"] },
];

function normalizar(ruta: string): string | null {
  let p: string;
  try {
    p = decodeURIComponent(ruta);
  } catch {
    return null;
  }
  if (p.includes("\0") || p.includes("\\") || p.split("/").some((s) => s === "..")) return null;
  return p.length > 1 ? p.replace(/\/+$/, "") : p;
}

const coincide = (ruta: string, prefijo: string) => ruta === prefijo || ruta.startsWith(prefijo + "/");

export function reglaDeApi(pathname: string, entorno: { registroAbierto: boolean }): Regla {
  const ruta = normalizar(pathname);
  // Una ruta sospechosa nunca es pública: exige rol de administrador.
  if (ruta === null) return { tipo: "sesion", roles: ["admin"] };
  if (PUBLICAS.has(ruta)) return { tipo: "publica" };
  // El auto-registro de empleados (crea un hr.employee en Odoo) está cerrado salvo que se abra a propósito.
  if (ruta === "/api/users/register" && entorno.registroAbierto) return { tipo: "publica" };
  const regla = POR_ROL.find((r) => coincide(ruta, r.prefijo));
  return regla ? { tipo: "sesion", roles: regla.roles } : { tipo: "sesion" };
}

export interface SesionApp {
  id: number;
  email?: string;
  name?: string;
  role: string;
}

/** ¿Puede esta sesión actuar sobre los datos del empleado `empleadoId`? Uno mismo, o supervisor/administrador. */
export function puedeActuarSobre(sesion: Pick<SesionApp, "id" | "role"> | null, empleadoId: number): boolean {
  if (!sesion) return false;
  if ((ROLES_PRIVILEGIADOS as readonly string[]).includes(String(sesion.role))) return true;
  return Number(sesion.id) === Number(empleadoId) && Number.isFinite(empleadoId) && empleadoId > 0;
}

export function rolPermitido(rol: unknown, roles?: readonly string[]): boolean {
  return !roles || roles.includes(String(rol ?? ""));
}
