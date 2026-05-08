import { NextRequest, NextResponse } from 'next/server';
import { getOdooClient, logger } from '@/lib';

/**
 * GET /api/cuaderno/detail/[id]
 * 
 * Obtiene el detalle completo de un asiento para revisión/aprobación
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const asientoId = parseInt(resolvedParams.id);

    // Validar ID
    if (isNaN(asientoId) || asientoId <= 0) {
      return NextResponse.json(
        { success: false, error: 'ID de asiento inválido' },
        { status: 400 }
      );
    }

    logger.info('📋 Obteniendo detalle de asiento', { asientoId });

    // Obtener datos del asiento
    const asientoData = await fetchAsientoDetailFromOdoo(asientoId);

    if (!asientoData) {
      logger.warn('Asiento no encontrado', { asientoId });
      return NextResponse.json(
        { success: false, error: 'Asiento no encontrado' },
        { status: 404 }
      );
    }

    logger.info('✅ Detalle de asiento obtenido', { 
      asientoId, 
      state: asientoData.state,
      hasPhotos: asientoData.attachments.length 
    });

    return NextResponse.json({
      success: true,
      data: asientoData,
    });
  } catch (error: any) {
    logger.error('Error obteniendo detalle de asiento', error as Error, {
      asientoId: (await params).id,
    });

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error interno del servidor',
      },
      { status: 500 }
    );
  }
}

/**
 * Obtiene el detalle completo del asiento desde Odoo
 */
async function fetchAsientoDetailFromOdoo(asientoId: number): Promise<any | null> {
  try {
    const odoo = getOdooClient();

    // Campos completos incluyendo relaciones
    const fields = [
      'id',
      'name',
      'date',
      'clima',
      'state',
      'ocurrencias',
      'observacion',
      'latitude',
      'longitude',
      'gps_accuracy',
      'x_personal',
      'x_equipos',
      'x_hash_seguridad',
      'residente_id', // [id, 'Nombre Completo']
      'supervisor_id', // [id, 'Nombre Completo']
      'cuaderno_id', // [id, 'Nombre del Cuaderno']
      'attachment_ids', // IDs de fotos/adjuntos
      'create_date',
      'write_date',
    ];

    const asientos = await odoo.searchRead(
      'obra.cuaderno.asiento',
      [['id', '=', asientoId]],
      fields
    );

    if (!asientos || asientos.length === 0) {
      return null;
    }

    const asiento = asientos[0];

    // Obtener adjuntos (fotos) si existen
    let attachments = [];
    if (asiento.attachment_ids && asiento.attachment_ids.length > 0) {
      try {
        attachments = await odoo.searchRead(
          'ir.attachment',
          [['id', 'in', asiento.attachment_ids]],
          ['id', 'name', 'mimetype', 'file_size', 'create_date']
        );
        
        logger.info('Adjuntos obtenidos', { 
          asientoId, 
          count: attachments.length 
        });
      } catch (attachError) {
        logger.warn('Error obteniendo adjuntos', { error: attachError });
      }
    }

    // Formatear respuesta
    return {
      id: asiento.id,
      name: asiento.name || `Asiento #${asiento.id}`,
      date: asiento.date,
      clima: asiento.clima,
      state: asiento.state,
      
      // Información del trabajo (COMPLETA, sin truncar)
      personal: asiento.x_personal || '',
      equipos: asiento.x_equipos || '',
      ocurrencias: asiento.ocurrencias || '',
      observacion: asiento.observacion || '',
      
      // GPS
      location: {
        latitude: asiento.latitude || null,
        longitude: asiento.longitude || null,
        accuracy: asiento.gps_accuracy || null,
        hasGPS: !!(asiento.latitude && asiento.longitude),
      },
      
      // Relaciones
      residente: asiento.residente_id
        ? {
            id: asiento.residente_id[0],
            name: asiento.residente_id[1],
          }
        : null,
      
      supervisor: asiento.supervisor_id
        ? {
            id: asiento.supervisor_id[0],
            name: asiento.supervisor_id[1],
          }
        : null,
      
      cuaderno: asiento.cuaderno_id
        ? {
            id: asiento.cuaderno_id[0],
            name: asiento.cuaderno_id[1],
          }
        : null,
      
      // Adjuntos/Fotos
      attachments: attachments.map((att: any) => ({
        id: att.id,
        name: att.name,
        mimetype: att.mimetype,
        size: att.file_size || 0,
        url: `/api/cuaderno/attachment/${att.id}`,
        createdAt: att.create_date,
      })),
      
      // Metadatos
      createdAt: asiento.create_date,
      updatedAt: asiento.write_date,
      
      // Permisos/Acciones disponibles
      // TODO: Validar permisos reales basados en sesión
      canApprove: asiento.state === 'signed_residente',
      canReject: asiento.state === 'signed_residente',
      canResolve: asiento.state === 'rejected',
    };
  } catch (error: any) {
    logger.error('Error en fetchAsientoDetailFromOdoo', error as Error);
    throw error;
  }
}
