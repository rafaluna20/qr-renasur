import { NextResponse } from 'next/server';
import { empresas } from '@/lib/empresas';

/**
 * GET /api/auth/empresas
 *
 * Empresas entre las que se puede elegir al iniciar sesión (solo id y nombre; nunca URL, base de datos ni claves).
 * Es pública a propósito: el formulario de login la necesita antes de que exista una sesión.
 */
export async function GET() {
  try {
    return NextResponse.json(
      { success: true, empresas: empresas().map((e) => ({ id: e.id, nombre: e.nombre })) },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch {
    return NextResponse.json({ success: false, empresas: [] }, { status: 500, headers: { 'cache-control': 'no-store' } });
  }
}
