import { NextRequest } from 'next/server';
import { getOdooClient, logger, successResponse, handleAPIError } from '@/lib';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { id, observacion } = body;

        if (!id) {
            return handleAPIError(new Error('id del asiento es requerido'));
        }

        const odoo = getOdooClient();

        // Llamar al metodo del modelo. Pasamos el ID del asiento, y la observacion
        await odoo.execute_kw(
            'obra.cuaderno.asiento',
            'action_reject',
            [[parseInt(id)]],
            { observacion: observacion || '' }
        );

        logger.info('Asiento observado desde la App', { asiento_id: id });

        return successResponse({ success: true, message: 'Asiento observado correctamente' });

    } catch (error: any) {
        logger.error('Error en /api/cuaderno/reject', error as Error);
        return handleAPIError(error);
    }
}
