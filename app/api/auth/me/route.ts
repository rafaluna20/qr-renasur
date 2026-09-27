import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { vinculosDe } from '@/lib/auth/sesion';

/**
 * GET /api/auth/me
 *
 * Quién es la persona de la sesión (la verdad la tiene la cookie firmada, no el navegador). La pantalla principal lo
 * usa para rellenar su estado cuando se entró por la billetera (SSO), que no pasa por el formulario de login.
 */
export async function GET(req: Request) {
  const sesion = await getSessionFromRequest(req);
  if (!sesion) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401, headers: { 'cache-control': 'no-store' } });
  return NextResponse.json(
    {
      success: true,
      user: {
        id: sesion.id,
        email: sesion.email,
        role: sesion.role,
        name: sesion.name,
        empresa: sesion.empresa ?? null,
        empresaNombre: sesion.empresaNombre ?? null,
        empresas: vinculosDe(sesion as Record<string, unknown>).map((v) => ({ id: v.empresa, nombre: v.empresaNombre })),
      },
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
