import { NextRequest, NextResponse } from 'next/server';
import { getOdooClient, type OdooEmployee } from '@/lib/odoo-client';
import { setSessionCookie } from '@/lib/session';
import { canjearCodigo, RE_CODIGO } from '@/lib/sso';
import { logger } from '@/lib/logger';

/**
 * GET /api/auth/sso?code=...
 *
 * Inicio de sesión único desde la billetera. Canjea el código de un solo uso con el banco (firmado, servidor a
 * servidor), y con el correo verificado busca al empleado en Odoo. No hay contraseña ni DNI en juego.
 * Cualquier fallo vuelve a /login con un motivo genérico (sin detalles internos).
 */
function volverALogin(request: NextRequest, motivo: string) {
  const respuesta = NextResponse.redirect(new URL(`/login?sso=${motivo}`, request.url));
  respuesta.headers.set('cache-control', 'no-store');
  respuesta.headers.set('referrer-policy', 'no-referrer');
  return respuesta;
}

export async function GET(request: NextRequest) {
  const codigo = request.nextUrl.searchParams.get('code') ?? '';
  if (!RE_CODIGO.test(codigo)) return volverALogin(request, 'codigo');

  const canje = await canjearCodigo(codigo);
  if (!canje.ok) {
    logger.warn('SSO: no se pudo canjear el código', { motivo: canje.motivo });
    return volverALogin(request, canje.motivo);
  }

  try {
    const correo = canje.usuario.email.trim().toLowerCase();
    const odoo = getOdooClient();
    // `ilike` puede traer parientes del correo (el guion bajo y el % son comodines): se exige coincidencia EXACTA aquí.
    const candidatos = await odoo.searchRead<OdooEmployee>(
      'hr.employee',
      [['active', '=', true], ['work_email', 'ilike', correo]],
      ['id', 'name', 'work_email', 'image_128', 'x_obra_role'],
      { limit: 20 }
    );
    const coincidencias = candidatos.filter((e) => (e.work_email ?? '').trim().toLowerCase() === correo);
    if (coincidencias.length !== 1) {
      logger.warn('SSO: el correo no corresponde a un único empleado', { coincidencias: coincidencias.length });
      return volverALogin(request, coincidencias.length === 0 ? 'sin_empleado' : 'ambiguo');
    }

    const empleado = coincidencias[0];
    await setSessionCookie({
      id: empleado.id,
      email: empleado.work_email,
      role: empleado.x_obra_role || 'employee',
      name: empleado.name,
    });
    logger.info('SSO: sesión iniciada', { empleadoId: empleado.id });

    // Destino FIJO: nunca se redirige a una dirección que venga en la petición.
    const respuesta = NextResponse.redirect(new URL('/', request.url));
    respuesta.headers.set('cache-control', 'no-store');
    respuesta.headers.set('referrer-policy', 'no-referrer');
    return respuesta;
  } catch (error) {
    logger.error('SSO: error consultando Odoo', error as Error);
    return volverALogin(request, 'red');
  }
}
