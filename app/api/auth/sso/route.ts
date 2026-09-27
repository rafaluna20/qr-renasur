import { NextRequest, NextResponse } from 'next/server';
import { getOdooClient } from '@/lib/odoo-client';
import { empresas } from '@/lib/empresas';
import { buscarVinculos } from '@/lib/vinculos';
import { datosDeSesion } from '@/lib/auth/sesion';
import { setPendingCookie, setSessionCookie } from '@/lib/session';
import { canjearCodigo, RE_CODIGO } from '@/lib/sso';
import { logger } from '@/lib/logger';

/**
 * GET /api/auth/sso?code=...
 *
 * Inicio de sesión único desde la billetera. Canjea el código de un solo uso con el banco (firmado, servidor a
 * servidor) y con la cuenta de billetera verificada busca a la persona como empleado en CADA empresa configurada:
 *   - una sola empresa  -> abre sesión directo;
 *   - varias empresas   -> pide elegir cuál (/elegir-empresa);
 *   - ninguna           -> vuelve a /login con un motivo genérico.
 * No hay contraseña ni DNI en juego. Cualquier fallo vuelve a /login sin detalles internos.
 */
function ir(request: NextRequest, ruta: string) {
  const respuesta = NextResponse.redirect(new URL(ruta, request.url));
  respuesta.headers.set('cache-control', 'no-store');
  respuesta.headers.set('referrer-policy', 'no-referrer');
  return respuesta;
}

const volverALogin = (request: NextRequest, motivo: string) => ir(request, `/login?sso=${motivo}`);

export async function GET(request: NextRequest) {
  const codigo = request.nextUrl.searchParams.get('code') ?? '';
  if (!RE_CODIGO.test(codigo)) return volverALogin(request, 'codigo');

  const canje = await canjearCodigo(codigo);
  if (!canje.ok) {
    logger.warn('SSO: no se pudo canjear el código', { motivo: canje.motivo });
    return volverALogin(request, canje.motivo);
  }

  try {
    const identidad = { email: canje.usuario.email.trim().toLowerCase(), cuenta: canje.usuario.cuenta };
    const { vinculos, problemas } = await buscarVinculos(identidad, empresas(), (e) => getOdooClient(e.id));

    if (vinculos.length === 0) {
      logger.warn('SSO: la cuenta no es empleado en ninguna empresa', { problemas });
      const todoRed = problemas.length > 0 && problemas.every((p) => p.motivo === 'red');
      return volverALogin(request, problemas.some((p) => p.motivo === 'ambiguo') ? 'ambiguo' : todoRed ? 'red' : 'sin_empleado');
    }

    if (vinculos.length === 1) {
      await setSessionCookie(datosDeSesion(vinculos[0], vinculos, identidad));
      logger.info('SSO: sesión iniciada', { empresa: vinculos[0].empresa, empleadoId: vinculos[0].id });
      return ir(request, '/');
    }

    await setPendingCookie({ ...identidad, vinculos });
    logger.info('SSO: la persona debe elegir empresa', { empresas: vinculos.map((v) => v.empresa) });
    return ir(request, '/elegir-empresa');
  } catch (error) {
    logger.error('SSO: error preparando la sesión', error as Error);
    return volverALogin(request, 'red');
  }
}
