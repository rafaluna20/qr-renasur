import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { empresaDeSesion } from '@/lib/auth/sesion';
import { NextRequest } from 'next/server';
import { getOdooClient, logger, successResponse, handleAPIError } from '@/lib';
import {
  ESTADOS_SIN_ARCHIVOS_NUEVOS,
  MAX_FOTO_BYTES,
  bytesDeBase64,
  detectarTipoImagen,
  nombreSeguroDeFoto,
  puedeTrabajarAsiento,
} from '@/lib/cuaderno/permisos';

const error = (status: number, mensaje: string) => NextResponse.json({ success: false, error: mensaje }, { status });

export async function POST(req: NextRequest) {
    try {
        const sesion = await getSessionFromRequest(req);
        if (!sesion) return error(401, 'No autenticado');

        // Corte barato antes de leer el cuerpo: una foto de obra no pasa de unos cuantos MB.
        const largo = Number(req.headers.get('content-length') ?? 0);
        if (largo > MAX_FOTO_BYTES * 1.5) return error(413, 'La foto es demasiado grande');

        const body = await req.json();
        const { asiento_id, file_name, file_base64 } = body;
        const asientoId = Number(asiento_id);

        if (!Number.isInteger(asientoId) || asientoId <= 0 || typeof file_base64 !== 'string' || !file_base64) {
            return error(400, 'Faltan parametros: asiento_id y file_base64 son requeridos');
        }

        // Convert base64 string to clean format for Odoo if needed
        const cleanBase64 = file_base64.includes('base64,') ? file_base64.split('base64,')[1] : file_base64;

        if (bytesDeBase64(cleanBase64) > MAX_FOTO_BYTES) return error(413, 'La foto es demasiado grande (máximo 8 MB)');

        // El tipo se decide por los bytes del archivo, no por lo que declare el navegador.
        const bytes = Buffer.from(cleanBase64, 'base64');
        const tipo = detectarTipoImagen(bytes);
        if (!tipo) return error(415, 'Solo se aceptan fotos JPG, PNG o WebP');

        const odoo = getOdooClient(empresaDeSesion(sesion));

        // El asiento debe existir, ser del propio residente (o de un supervisor/administrador) y no estar aprobado.
        const asientos = await odoo.searchRead<{ id: number; state: string; residente_id: [number, string] | false }>(
            'obra.cuaderno.asiento', [['id', '=', asientoId]], ['state', 'residente_id'], { limit: 1 });
        if (asientos.length === 0) return error(404, 'Asiento no encontrado');
        const asiento = asientos[0];
        const residenteId = asiento.residente_id ? asiento.residente_id[0] : null;
        if (!puedeTrabajarAsiento({ id: sesion.id, role: sesion.role }, residenteId)) {
            return error(403, 'No puedes agregar archivos a este asiento');
        }
        if (ESTADOS_SIN_ARCHIVOS_NUEVOS.includes(asiento.state)) {
            return error(409, 'El asiento ya fue aprobado: no admite archivos nuevos');
        }

        const vals = {
            name: nombreSeguroDeFoto(file_name, tipo),
            type: 'binary',
            datas: bytes.toString('base64'),
            res_model: 'obra.cuaderno.asiento',
            res_id: asientoId,
            mimetype: tipo,
        };

        const rawAttachmentId = await odoo.create('ir.attachment', vals);
        // Odoo model_create_multi returns an array of IDs via JSON-RPC; unpack it.
        const attachmentId: number = Array.isArray(rawAttachmentId) ? rawAttachmentId[0] : rawAttachmentId;

        // Link attachment to the asiento record
        await odoo.write('obra.cuaderno.asiento', [asientoId], {
            attachment_ids: [[4, attachmentId, false]] // Odoo ORM (4, id, _) = add to M2M
        });

        logger.info('Foto subida exitosamente', { attachmentId, asiento_id: asientoId, tipo, bytes: bytes.length });

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
