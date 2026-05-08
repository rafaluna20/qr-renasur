import { NextRequest } from 'next/server';
import { getOdooClient, logger, successResponse, handleAPIError } from '@/lib';
import { getCacheManager, CacheKeyBuilder } from '@/lib/cache/cache-manager';
import { validateAsientoAction } from '@/lib/validation/asiento-validator';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        
        // Validar con Zod
        const validated = validateAsientoAction(body);
        const { id, observacion } = validated;

        const odoo = getOdooClient();

        // Llamar al metodo del modelo
        await odoo.execute_kw(
            'obra.cuaderno.asiento',
            'action_reject',
            [[id]],
            { observacion }
        );

        logger.info('Asiento observado desde la App', { asiento_id: id });
        
        // Invalidar caché del asiento específico y listas
        const cache = getCacheManager();
        await cache.invalidate(CacheKeyBuilder.asiento(id));
        await cache.invalidatePattern('asientos:*');

        return successResponse({ success: true, message: 'Asiento observado correctamente' });

    } catch (error: any) {
        logger.error('Error en /api/cuaderno/reject', error as Error);
        return handleAPIError(error);
    }
}
