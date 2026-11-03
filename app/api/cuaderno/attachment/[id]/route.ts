import { getSessionFromRequest } from '@/lib/session';
import { empresaDeSesion } from '@/lib/auth/sesion';
import { NextRequest, NextResponse } from 'next/server';
import { getOdooClient, logger } from '@/lib';
import { detectarTipoImagen, puedeLeerAsiento } from '@/lib/cuaderno/permisos';

/**
 * GET /api/cuaderno/attachment/[id]
 *
 * Descarga un adjunto/foto de un asiento
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const attachmentId = parseInt(resolvedParams.id);

    if (isNaN(attachmentId) || attachmentId <= 0) {
      return NextResponse.json(
        { success: false, error: 'ID de adjunto inválido' },
        { status: 400 }
      );
    }

    logger.info('Descargando adjunto', { attachmentId });

    const sesion = await getSessionFromRequest(req);
    if (!sesion) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 });
    const odoo = getOdooClient(empresaDeSesion(sesion));

    // 1) Metadatos primero (sin el contenido): debe ser un adjunto de un asiento y el asiento debe ser trabajable por esta sesión.
    const meta = await odoo.searchRead<{ id: number; name: string; mimetype: string | false; res_id: number }>(
      'ir.attachment',
      // Solo adjuntos de asientos del cuaderno: antes se podía bajar CUALQUIER adjunto de Odoo probando números.
      [['id', '=', attachmentId], ['res_model', '=', 'obra.cuaderno.asiento']],
      ['name', 'mimetype', 'res_id'],
      { limit: 1 }
    );

    if (!meta || meta.length === 0) {
      return NextResponse.json({ success: false, error: 'Adjunto no encontrado' }, { status: 404 });
    }

    const asientos = await odoo.searchRead<{ id: number; residente_id: [number, string] | false; supervisor_id: [number, string] | false }>(
      'obra.cuaderno.asiento', [['id', '=', meta[0].res_id]], ['residente_id', 'supervisor_id'], { limit: 1 });
    const residenteId = asientos[0]?.residente_id ? asientos[0].residente_id[0] : null;
    const supervisorId = asientos[0]?.supervisor_id ? asientos[0].supervisor_id[0] : null;
    if (!puedeLeerAsiento({ id: sesion.id, role: sesion.role }, residenteId, supervisorId)) {
      return NextResponse.json({ success: false, error: 'No tienes permiso para ver este adjunto' }, { status: 403 });
    }

    // 2) Recién ahora el contenido.
    const contenido = await odoo.searchRead<{ datas: string | false }>(
      'ir.attachment', [['id', '=', attachmentId]], ['datas'], { limit: 1 });
    const attachment = { ...meta[0], datas: contenido[0]?.datas || '' };

    // Decodificar base64 a buffer
    const buffer = Buffer.from(attachment.datas, 'base64');

    // Solo se muestra «en línea» lo que de verdad es una foto (por sus bytes); cualquier otra cosa se descarga como
    // binario opaco, para que un archivo subido con tipo falso nunca se ejecute en el dominio de la app.
    const tipoReal = detectarTipoImagen(buffer);
    const headers = new Headers();
    if (tipoReal) {
      headers.set('Content-Type', tipoReal);
      headers.set('Content-Disposition', `inline; filename="${String(attachment.name).replace(/[^A-Za-z0-9._ -]/g, '_')}"`);
    } else {
      headers.set('Content-Type', 'application/octet-stream');
      headers.set('Content-Disposition', 'attachment; filename="adjunto.bin"');
    }
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
    headers.set('Content-Length', buffer.length.toString());
    headers.set('Cache-Control', 'private, no-store'); // contenido privado: nunca en cachés compartidas

    logger.info('Adjunto descargado', {
      attachmentId,
      name: attachment.name,
      size: buffer.length,
    });

    return new NextResponse(buffer, {
      status: 200,
      headers,
    });
  } catch (error: any) {
    const resolvedParams = await params;
    logger.error('Error descargando adjunto', error as Error, {
      attachmentId: resolvedParams.id,
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Error descargando adjunto',
      },
      { status: 500 }
    );
  }
}
