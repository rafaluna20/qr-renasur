import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { empresaDeSesion } from '@/lib/auth/sesion';
import { NextRequest } from 'next/server';
import { getOdooClient, logger, successResponse, handleAPIError } from '@/lib';

export async function GET(req: NextRequest) {
    try {
        const sesion = await getSessionFromRequest(req);
        if (!sesion) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 });
        const odoo = getOdooClient(empresaDeSesion(sesion));
        const cuadernosRaw = await odoo.searchRead(
            'obra.cuaderno',
            [],
            ['id', 'project_id', 'name', 'display_name'],
            { order: 'id desc' }
        );

        const cuadernos = cuadernosRaw.map((c: any) => ({
            id: c.id,
            name: c.project_id && Array.isArray(c.project_id) ? c.project_id[1] : (c.display_name || c.name || `Cuaderno #${c.id}`)
        }));

        logger.info('Lista de cuadernos obtenida', { total: cuadernos.length });
        return successResponse({ cuadernos });
    } catch (error: any) {
        logger.error('Error in /api/cuaderno/list-cuadernos', error as Error);
        return handleAPIError(error);
    }
}
