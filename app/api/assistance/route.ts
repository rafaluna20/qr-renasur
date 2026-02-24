import { type NextRequest, NextResponse } from 'next/server';
import { getOdooClient, OdooAttendance, OdooError } from '@/lib/odoo-client';
import { z } from 'zod';

/**
 * API Route: Consultar Asistencias
 *
 * Este endpoint consulta el historial de asistencias de un empleado.
 * Puede filtrar por fecha (hoy) o retornar todo el historial.
 */

// Schema de validación
const assistanceQuerySchema = z.object({
  userId: z.number().positive('userId debe ser un número positivo'),
  allHistory: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
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
    const today = new Date().toISOString().split('T')[0];
    
    // Construir dominio de búsqueda
    const domain: any[] = [['employee_id', '=', userId]];
    
    if (!allHistory) {
      domain.push(['check_in', '>=', `${today} 00:00:00`]);
      domain.push(['check_in', '<=', `${today} 23:59:59`]);
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

    return NextResponse.json({
      success: true,
      data: {
        result: attendances,
        count: attendances.length,
        filter: allHistory ? 'all' : 'today',
      }
    });

  } catch (error) {
    console.error('Error in assistance query route:', error);

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
