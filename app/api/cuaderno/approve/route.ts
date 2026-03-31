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

        // Llamar al método del modelo. Pasamos el ID del asiento, y la observación (puede ser string vacío).
        await odoo.execute_kw(
            'obra.cuaderno.asiento',
            'action_approve_supervisor',
            [[parseInt(id)]],
            { observacion: observacion || '' }
        );

        logger.info('Asiento aprobado desde la App', { asiento_id: id });

        return successResponse({ success: true, message: 'Asiento aprobado correctamente' });

    } catch (error: any) {
        logger.error('Error en /api/cuaderno/approve', error as Error);
        return handleAPIError(error);
    }
}
