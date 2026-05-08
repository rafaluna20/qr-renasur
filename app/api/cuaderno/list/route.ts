import { NextRequest } from 'next/server';
import { getOdooClient, logger, successResponse, handleAPIError } from '@/lib';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { employeeId, role, filter } = body;

        logger.info('📋 Cuaderno list request received', {
            employeeId,
            role,
            filter,
            hasFilter: !!filter
        });

        if (!employeeId) {
            return handleAPIError(new Error('employeeId es requerido'));
        }

        if (!role) {
            return handleAPIError(new Error('role es requerido'));
        }

        const odoo = getOdooClient();

        // Domain base: supervisors see all; residents see only their own
        let domain: any[] = role === 'supervisor'
            ? []
            : [['residente_id', '=', parseInt(employeeId)]];

        logger.debug('Base domain created', { role, baseDomain: domain });

        // Filtros adicionales opcionales
        if (filter?.state) {
            domain.push(['state', '=', filter.state]);
        }

        if (filter?.cuaderno_id) {
            domain.push(['cuaderno_id', '=', parseInt(filter.cuaderno_id)]);
        }

        if (filter?.date_from) {
            domain.push(['date', '>=', filter.date_from]);
        }

        if (filter?.date_to) {
            domain.push(['date', '<=', filter.date_to]);
        }

        const fields = [
            'id',
            'name',
            'date',
            'clima',
            'state',
            'observacion',
            'residente_id',
            'supervisor_id',
            'cuaderno_id',
            'create_date',
            'x_personal',
            'x_equipos',
        ];

        // Consultar directamente a Odoo (sin caché por ahora)
        logger.info('🔍 Fetching from Odoo', {
            model: 'obra.cuaderno.asiento',
            domain,
            fieldsCount: fields.length,
            role,
            employeeId
        });

        const asientos = await odoo.searchRead(
            'obra.cuaderno.asiento',
            domain,
            fields,
            { order: 'date desc, id desc', limit: 100 }
        );

        logger.info('✅ Odoo response received', {
            count: asientos.length,
            firstRecord: asientos[0]?.id || 'none',
            states: asientos.map((r: any) => r.state).filter((v: any, i: number, a: any[]) => a.indexOf(v) === i)
        });

        logger.info('📦 Asientos retrieved', {
            total: asientos.length,
            role,
            employeeId
        });

        // Formatear asientos para frontend
        const formattedAsientos = asientos.map((a: any) => ({
            id: a.id,
            name: a.name || `Asiento #${a.id}`,
            date: a.date,
            clima: a.clima,
            state: a.state,
            observacion: a.observacion || '',
            residente: a.residente_id ? {
                id: a.residente_id[0],
                name: a.residente_id[1],
            } : null,
            supervisor: a.supervisor_id ? {
                id: a.supervisor_id[0],
                name: a.supervisor_id[1],
            } : null,
            cuaderno: a.cuaderno_id ? {
                id: a.cuaderno_id[0],
                name: a.cuaderno_id[1],
            } : null,
            createdAt: a.create_date,
            preview: {
                personal: a.x_personal?.substring(0, 50) || '',
                equipos: a.x_equipos?.substring(0, 50) || '',
            },
        }));

        // Group by state
        const stats = {
            total: formattedAsientos.length,
            pending: formattedAsientos.filter((a: any) => a.state === 'signed_residente').length,
            approved: formattedAsientos.filter((a: any) => a.state === 'approved').length,
            rejected: formattedAsientos.filter((a: any) => a.state === 'rejected').length,
            resolved: formattedAsientos.filter((a: any) => a.state === 'resolved').length,
            draft: formattedAsientos.filter((a: any) => a.state === 'draft').length,
        };

        logger.info('Cuaderno list fetched', { employeeId, role, total: stats.total, filter });

        return successResponse({ asientos: formattedAsientos, stats });

    } catch (error: any) {
        logger.error('Error in /api/cuaderno/list', error as Error);
        return handleAPIError(error);
    }
}
