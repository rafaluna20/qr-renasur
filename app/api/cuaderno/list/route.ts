import { NextRequest } from 'next/server';
import { getOdooClient, logger, successResponse, handleAPIError } from '@/lib';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { employeeId, role } = body;

        if (!employeeId) {
            return handleAPIError(new Error('employeeId es requerido'));
        }

        const odoo = getOdooClient();

        // Domain: supervisors see all; residents see only their own
        const domain = role === 'supervisor'
            ? []
            : [['residente_id', '=', parseInt(employeeId)]];

        const fields = ['id', 'name', 'date', 'clima', 'state', 'observacion', 'residente_id', 'supervisor_id', 'cuaderno_id'];

        const asientos = await odoo.searchRead(
            'obra.cuaderno.asiento',
            domain,
            fields,
            { order: 'date desc', limit: 100 }
        );

        // Group by state
        const stats = {
            total: asientos.length,
            pending: asientos.filter((a: any) => a.state === 'signed_residente').length,
            approved: asientos.filter((a: any) => a.state === 'approved').length,
            rejected: asientos.filter((a: any) => a.state === 'rejected').length,
            draft: asientos.filter((a: any) => a.state === 'draft').length,
        };

        logger.info('Cuaderno list fetched', { employeeId, role, total: stats.total });

        return successResponse({ asientos, stats });

    } catch (error: any) {
        logger.error('Error in /api/cuaderno/list', error as Error);
        return handleAPIError(error);
    }
}
