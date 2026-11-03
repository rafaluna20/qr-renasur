import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { tiposActivos } from '@/lib/cuaderno/config';
import { CATEGORIAS, tiposPermitidos } from '@/lib/cuaderno/tipologia';

/** GET /api/cuaderno/config: si la tipologia esta activa y que tipos puede emitir quien consulta (segun su rol de sesion). */
export async function GET(req: Request) {
    const sesion = await getSessionFromRequest(req);
    if (!sesion) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 });
    const activa = tiposActivos();
    return NextResponse.json(
        {
            success: true,
            tipos: activa,
            categorias: CATEGORIAS,
            permitidos: activa
                ? tiposPermitidos(sesion.role).map((t) => ({ clave: t.clave, etiqueta: t.etiqueta, categoria: t.categoria, requiereReferencia: !!t.requiereReferencia }))
                : [],
        },
        { headers: { 'cache-control': 'no-store' } },
    );
}
