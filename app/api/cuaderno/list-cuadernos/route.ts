import { NextRequest } from 'next/server';
import { getOdooClient, logger, successResponse, handleAPIError } from '@/lib';

export async function GET(req: NextRequest) {
    try {
        const odoo = getOdooClient();
        const cuadernos = await odoo.searchRead(
            'obra.cuaderno',
            [],
            ['id', 'name', 'display_name'],
            { order: 'id desc' }
        );

        logger.info('Lista de cuadernos obtenida', { total: cuadernos.length });
        return successResponse({ cuadernos });
    } catch (error: any) {
        logger.error('Error in /api/cuaderno/list-cuadernos', error as Error);
        return handleAPIError(error);
    }
}
