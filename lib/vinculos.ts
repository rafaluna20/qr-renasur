import type { Empresa } from './empresas';

/**
 * Vínculo «persona de la billetera ↔ empleado de una empresa».
 *
 * La identidad que entrega el banco es el NÚMERO DE CUENTA de la billetera (único e inalterable) y el correo verificado.
 * El vínculo principal es el número de cuenta anotado en la ficha del empleado (campo x_billetera_cuenta de hr.employee):
 * lo anota el administrador de CADA empresa en SU Odoo, y esa anotación es la aprobación. Una persona que trabaja en dos
 * empresas simplemente aparece vinculada en las dos.
 *
 * Solo si la empresa lo permite (vinculoPorCorreo) se acepta además la coincidencia exacta y única por correo laboral,
 * para el periodo en que se cargan los vínculos. Es más débil: quien pueda editar un correo en Odoo podría suplantar.
 */
export type Rol = 'employee' | 'resident' | 'supervisor' | 'admin';
const ROLES: Rol[] = ['employee', 'resident', 'supervisor', 'admin'];

export interface Vinculo {
  empresa: string;
  empresaNombre: string;
  id: number;
  role: Rol;
  name: string;
}

export interface Problema {
  empresa: string;
  motivo: 'ambiguo' | 'red';
}

export interface IdentidadBilletera {
  cuenta: string;
  email: string;
}

interface ClienteBusqueda {
  searchRead<T = any>(model: string, domain: any[], fields: string[], options?: Record<string, any>): Promise<T[]>;
}

interface FilaEmpleado {
  id: number;
  name: string;
  work_email?: string | false;
  x_billetera_cuenta?: string | false;
  x_obra_role?: string | false;
}

const CAMPO_FALTANTE = /Invalid field|no existe|does not exist/i;

function comoVinculo(empresa: Empresa, fila: FilaEmpleado): Vinculo {
  const rol = ROLES.includes(fila.x_obra_role as Rol) ? (fila.x_obra_role as Rol) : 'employee';
  return { empresa: empresa.id, empresaNombre: empresa.nombre, id: fila.id, role: empresa.obra ? rol : 'employee', name: fila.name };
}

async function buscarEnEmpresa(
  empresa: Empresa, identidad: IdentidadBilletera, cliente: ClienteBusqueda,
): Promise<{ vinculo?: Vinculo; problema?: Problema['motivo'] }> {
  const campos = ['id', 'name', 'work_email', ...(empresa.obra ? ['x_obra_role'] : [])];
  const cuenta = identidad.cuenta.trim().toUpperCase();

  // 1) Vínculo aprobado: la cuenta de billetera anotada en la ficha del empleado.
  try {
    const filas = await cliente.searchRead<FilaEmpleado>(
      'hr.employee', [['active', '=', true], ['x_billetera_cuenta', '=', cuenta]], [...campos, 'x_billetera_cuenta'], { limit: 5 });
    const exactas = filas.filter((f) => String(f.x_billetera_cuenta ?? '').trim().toUpperCase() === cuenta);
    if (exactas.length === 1) return { vinculo: comoVinculo(empresa, exactas[0]) };
    if (exactas.length > 1) return { problema: 'ambiguo' };
  } catch (error) {
    // Un Odoo sin el campo aún (no se ha preparado) equivale a «sin vínculos»; cualquier otra falla es de red/servidor.
    if (!CAMPO_FALTANTE.test(String((error as Error)?.message ?? error))) return { problema: 'red' };
  }

  // 2) Opcional y más débil: correo laboral idéntico y único.
  if (!empresa.vinculoPorCorreo) return {};
  const correo = identidad.email.trim().toLowerCase();
  try {
    // `ilike` puede traer parientes del correo (el guion bajo y el % son comodines): se exige coincidencia EXACTA.
    const filas = await cliente.searchRead<FilaEmpleado>(
      'hr.employee', [['active', '=', true], ['work_email', 'ilike', correo]], campos, { limit: 20 });
    const exactas = filas.filter((f) => String(f.work_email ?? '').trim().toLowerCase() === correo);
    if (exactas.length === 1) return { vinculo: comoVinculo(empresa, exactas[0]) };
    if (exactas.length > 1) return { problema: 'ambiguo' };
    return {};
  } catch {
    return { problema: 'red' };
  }
}

/**
 * Empresas en las que esta persona es empleado. Una empresa caída o mal configurada no impide entrar a las demás:
 * se reporta como problema y se sigue.
 */
export async function buscarVinculos(
  identidad: IdentidadBilletera,
  lista: Empresa[],
  clientePorEmpresa: (empresa: Empresa) => ClienteBusqueda,
): Promise<{ vinculos: Vinculo[]; problemas: Problema[] }> {
  const resultados = await Promise.all(lista.map(async (empresa) => {
    try {
      return { empresa, ...(await buscarEnEmpresa(empresa, identidad, clientePorEmpresa(empresa))) };
    } catch {
      return { empresa, problema: 'red' as const };
    }
  }));
  const vinculos: Vinculo[] = [];
  const problemas: Problema[] = [];
  for (const r of resultados) {
    if (r.vinculo) vinculos.push(r.vinculo);
    else if (r.problema) problemas.push({ empresa: r.empresa.id, motivo: r.problema });
  }
  return { vinculos, problemas };
}
