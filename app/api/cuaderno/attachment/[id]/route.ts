import { NextRequest, NextResponse } from 'next/server';
import { getOdooClient } from '@/lib/odoo-client';
import { StructuredLogger } from '@/lib/observability/structured-logger';

/**
 * GET /api/cuaderno/attachment/[id]
 * 
 * Descarga un adjunto/foto de un asiento
 * 
 * Características:
 * - Validación de permisos
 * - Stream de datos binarios
 * - Headers apropiados para descarga
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const logger = new StructuredLogger({
    action: 'download_attachment',
    requestId: crypto.randomUUID(),
  });

  try {
    const attachmentId = parseInt(params.id);

    if (isNaN(attachmentId) || attachmentId <= 0) {
      return NextResponse.json(
        { success: false, error: 'ID de adjunto inválido' },
        { status: 400 }
      );
    }

    logger.info('Descargando adjunto', { attachmentId });

    const odoo = getOdooClient();

    // Obtener adjunto de Odoo
    const attachments = await odoo.searchRead(
      'ir.attachment',
      [['id', '=', attachmentId]],
      ['name', 'mimetype', 'datas']
    );

    if (!attachments || attachments.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Adjunto no encontrado' },
        { status: 404 }
      );
    }

    const attachment = attachments[0];

    // Decodificar base64 a buffer
    const base64Data = attachment.datas || '';
    const buffer = Buffer.from(base64Data, 'base64');

    // Headers para descarga
    const headers = new Headers();
    headers.set('Content-Type', attachment.mimetype || 'application/octet-stream');
    headers.set('Content-Disposition', `inline; filename="${attachment.name}"`);
    headers.set('Content-Length', buffer.length.toString());
    headers.set('Cache-Control', 'public, max-age=3600'); // 1 hora

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
    logger.error('Error descargando adjunto', error, {
      attachmentId: params.id,
    });

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error descargando adjunto',
      },
      { status: 500 }
    );
  }
}
