import { NextResponse } from 'next/server';
import { clearPendingCookie, getPending, getSession, setSessionCookie } from '@/lib/session';
import { datosDeSesion, vinculosDe } from '@/lib/auth/sesion';
import { logger } from '@/lib/logger';

/**
 * POST /api/auth/empresa  { empresa }
 *
 * Elegir la empresa activa (justo después de entrar) o cambiar a otra en la que la persona también trabaja.
 * Solo vale una empresa de la lista de vínculos que va DENTRO del token firmado (la pendiente o la sesión actual):
 * lo que mande el navegador nunca amplía esa lista.
 */
const sinCache = { 'cache-control': 'no-store' };

export async function POST(req: Request) {
  const origen = (await getPending()) ?? (await getSession());
  if (!origen) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401, headers: sinCache });

  let empresa: unknown;
  try {
    ({ empresa } = await req.json());
  } catch {
    return NextResponse.json({ success: false, error: 'Solicitud inválida' }, { status: 400, headers: sinCache });
  }

  const vinculos = vinculosDe(origen as Record<string, unknown>);
  const elegido = typeof empresa === 'string' ? vinculos.find((v) => v.empresa === empresa) : undefined;
  if (!elegido) return NextResponse.json({ success: false, error: 'Empresa no disponible' }, { status: 403, headers: sinCache });

  const identidad = { email: String(origen.email ?? ''), cuenta: String(origen.cuenta ?? '') };
  await setSessionCookie(datosDeSesion(elegido, vinculos, identidad));
  await clearPendingCookie();
  logger.info('Empresa activa elegida', { empresa: elegido.empresa, empleadoId: elegido.id });
  return NextResponse.json({ success: true, empresa: elegido.empresa }, { headers: sinCache });
}
