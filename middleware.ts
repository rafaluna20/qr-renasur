import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySession } from './lib/session';
import { reglaDeApi, rolPermitido } from './lib/auth/access-rules';

const json = (status: number, error: string) =>
  NextResponse.json({ success: false, error }, { status, headers: { 'cache-control': 'no-store' } });

export async function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get('terra_session')?.value;
  const path = request.nextUrl.pathname;

  // ── API: TODA ruta exige sesión salvo la lista blanca; algunas exigen además un rol ─────────────────────────────
  // (Antes las rutas de /api quedaban fuera del middleware y ninguna comprobaba la sesión por su cuenta.)
  if (path.startsWith('/api/') || path === '/api') {
    const regla = reglaDeApi(path, { registroAbierto: process.env.ALLOW_SELF_REGISTER === 'true' });
    if (regla.tipo === 'publica') return NextResponse.next();

    // La app móvil manda la sesión en Authorization: Bearer; el navegador, en la cookie.
    const cabecera = request.headers.get('authorization');
    const token = cabecera?.startsWith('Bearer ') ? cabecera.slice(7) : sessionCookie;
    const payload = token ? await verifySession(token) : null;
    if (!payload) return json(401, 'No autenticado');
    if (!rolPermitido(payload.role, regla.roles)) return json(403, 'No tienes permiso para esta acción');
    return NextResponse.next();
  }

  // ── Páginas ────────────────────────────────────────────────────────────────────────────────────────────────────
  if (path.startsWith('/_next') || path === '/login' || path === '/register') {
    if (path === '/login' && sessionCookie) {
      const payload = await verifySession(sessionCookie);
      if (payload) {
        return NextResponse.redirect(new URL('/', request.url));
      }
    }
    return NextResponse.next();
  }

  // Rutas privadas aseguran que haya sesion
  if (!sessionCookie) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const payload = await verifySession(sessionCookie);
  if (!payload) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json).*)'],
};
