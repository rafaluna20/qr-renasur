import { type NextRequest, NextResponse } from 'next/server';
import { getOdooClient, OdooAttendance, OdooError } from '@/lib/odoo-client';
import { logger } from '@/lib/logger';
import { z } from 'zod';

/**
 * API Route: Consultar Asistencias
 *
 * Este endpoint consulta el historial de asistencias de un empleado.
 * Puede filtrar por fecha (hoy) o retornar todo el historial.
 *
 * MEJORA v2.0.1:
 * - Usa zona horaria America/Lima para consultas de "hoy"
 * - Logging detallado
 */

// Schema de validación
const assistanceQuerySchema = z.object({
  userId: z.number().positive('userId debe ser un número positivo'),
  allHistory: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body = await req.json();

    // Validar datos de entrada
    const validationResult = assistanceQuerySchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Datos de entrada inválidos',
          details: validationResult.error.issues,
        },
        { status: 400 }
      );
    }

    const { userId, allHistory } = validationResult.data;
    
    // CORRECCIÓN: Usar zona horaria de Perú para fecha de hoy
    const now = new Date();
    const peruTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Lima' }));
    const pad = (n: number) => String(n).padStart(2, '0');
    const today = `${peruTime.getFullYear()}-${pad(peruTime.getMonth() + 1)}-${pad(peruTime.getDate())}`;
    
    // Construir dominio de búsqueda
    const domain: any[] = [['employee_id', '=', userId]];
    
    if (!allHistory) {
      domain.push(['check_in', '>=', `${today} 00:00:00`]);
      domain.push(['check_in', '<=', `${today} 23:59:59`]);
      
      logger.info('Consultando asistencias del día', {
        userId,
        fechaPeru: today,
      });
    } else {
      logger.info('Consultando historial completo de asistencias', { userId });
    }

    const odoo = getOdooClient();

    // Consultar asistencias
    const attendances = await odoo.searchRead<OdooAttendance>(
      'hr.attendance',
      domain,
      ['id', 'employee_id', 'check_in', 'check_out', 'worked_hours'],
      {
        order: 'check_in desc',
        limit: allHistory ? 50 : 1000
      }
    );

    const duration = Date.now() - startTime;
    logger.info('Consulta de asistencias completada', {
      userId,
      registrosEncontrados: attendances.length,
      tieneRegistroAbierto: attendances.length > 0 && !attendances[0].check_out,
      duration: `${duration}ms`,
    });

    return NextResponse.json({
      success: true,
      data: {
        result: attendances,
        count: attendances.length,
        filter: allHistory ? 'all' : 'today',
      }
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Error en consulta de asistencias', error as Error, {
      duration: `${duration}ms`,
    });

    if (error instanceof OdooError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Error de Odoo',
          details: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Error interno del servidor',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
