import { NextRequest } from 'next/server';
import { getOdooClient, logger, successResponse, handleAPIError } from '@/lib';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const asientos = body.asientos;

        if (!Array.isArray(asientos) || asientos.length === 0) {
            return handleAPIError(new Error('No se enviaron asientos para sincronizar'));
        }

        const odoo = getOdooClient();

        // Call our newly created custom endpoint in Odoo: /api/cuaderno/sync
        // Note: getOdooClient uses JSON-RPC
        // To call a custom route we might need a custom fetch, 
        // or we can just use searchRead / create through standard ORM if we prefer

        // Since we created the models, we can just use standard XML-RPC / JSON-RPC ORM methods:
        const results = [];
        for (const asiento of asientos) {
            // Standard Odoo create method
            try {
                const vals: Record<string, any> = {
                    cuaderno_id: parseInt(asiento.cuaderno_id),
                    date: asiento.date,
                    clima: asiento.clima,
                    ocurrencias: asiento.ocurrencias || '',
                    latitude: asiento.latitude || 0.0,
                    longitude: asiento.longitude || 0.0,
                    gps_accuracy: asiento.gps_accuracy || 0.0,
                    state: asiento.state || 'draft',
                    x_personal: asiento.personal || '',
                    x_equipos: asiento.equipos || '',
                    x_hash_seguridad: asiento.security_hash || '',
                    residente_id: asiento.residente_id ? parseInt(asiento.residente_id) : undefined,
                    supervisor_id: asiento.supervisor_id ? parseInt(asiento.supervisor_id) : undefined
                };

                // remove undefined keys
                Object.keys(vals).forEach(key => vals[key] === undefined && delete vals[key]);

                const rawCreatedId = await odoo.create('obra.cuaderno.asiento', vals);
                // Odoo model_create_multi returns an array of IDs via JSON-RPC; unpack it.
                const createdId: number = Array.isArray(rawCreatedId) ? rawCreatedId[0] : rawCreatedId;
                results.push({
                    offline_uuid: asiento.offline_uuid,
                    odoo_id: createdId,
                    status: 'success'
                });
            } catch (err: any) {
                logger.error(`Error syncing asiento ${asiento.offline_uuid}`, err as Error);
                results.push({
                    offline_uuid: asiento.offline_uuid,
                    status: 'error',
                    error: err.message
                });
            }
        }

        logger.info('Cuaderno sync completed', { count: asientos.length });

        return successResponse({ results });

    } catch (error: any) {
        logger.error('Error in /api/cuaderno/sync', error as Error);
        return handleAPIError(error);
    }
}
