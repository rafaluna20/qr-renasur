import { NextRequest } from 'next/server';
import { getOdooClient, logger, successResponse, handleAPIError } from '@/lib';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { asiento_id, file_name, file_base64, mimetype } = body;

        if (!asiento_id || !file_base64) {
            return handleAPIError(new Error('Faltan parametros: asiento_id y file_base64 son requeridos'));
        }

        const odoo = getOdooClient();

        // Convert base64 string to clean format for Odoo if needed
        let cleanBase64 = file_base64;
        if (file_base64.includes('base64,')) {
            cleanBase64 = file_base64.split('base64,')[1];
        }

        // Call Odoo /api/cuaderno/upload_photo custom route
        // Since getOdooClient is generic JSON-RPC, we can just use the ORM directly to create the attachment

        const vals = {
            name: file_name || 'foto_obra.jpg',
            type: 'binary',
            datas: cleanBase64,
            res_model: 'obra.cuaderno.asiento',
            res_id: parseInt(asiento_id),
            mimetype: mimetype || 'image/jpeg'
        };

        const rawAttachmentId = await odoo.create('ir.attachment', vals);
        // Odoo model_create_multi returns an array of IDs via JSON-RPC; unpack it.
        const attachmentId: number = Array.isArray(rawAttachmentId) ? rawAttachmentId[0] : rawAttachmentId;

        // Link attachment to the asiento record
        const asiento = await odoo.read('obra.cuaderno.asiento', [parseInt(asiento_id)], ['attachment_ids']);
        if (asiento && asiento.length > 0) {
            await odoo.write('obra.cuaderno.asiento', [parseInt(asiento_id)], {
                attachment_ids: [[4, attachmentId, false]] // Odoo ORM (4, id, _) = add to M2M
            });
        }

        logger.info('Foto subida exitosamente', { attachmentId, asiento_id });

        return successResponse({
            attachment_id: attachmentId,
            file_name: vals.name,
            success: true
        });

    } catch (error: any) {
        logger.error('Error in /api/cuaderno/upload_photo', error as Error);
        return handleAPIError(error);
    }
}
