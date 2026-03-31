import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySession } from './lib/session';

export async function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get('terra_session')?.value;
  
  // Excluir rutas públicas y estáticas directamente en el matcher de preferencia, 
  // pero aseguramos también en código.
  const path = request.nextUrl.pathname;
  if (
    path.startsWith('/_next') ||
    path.startsWith('/api') ||
    path === '/login' ||
    path === '/register'
  ) {
    if (path === '/login' && sessionCookie) {
      const payload = await verifySession(sessionCookie);
      if (payload) {
        return NextResponse.redirect(new URL('/', request.url));
      }
    }
    return NextResponse.next();
  }

  // Rutas privadas aseguran que haya sesión
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
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|manifest.json).*)'],
};
