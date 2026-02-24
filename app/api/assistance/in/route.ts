import { type NextRequest, NextResponse } from 'next/server';
import { getOdooClient, OdooError } from '@/lib/odoo-client';
import { z } from 'zod';

/**
 * API Route: Registrar Entrada (Check-in)
 *
 * Este endpoint marca la entrada de un empleado creando
 * un nuevo registro de asistencia con check_in.
 */

// Schema de validación
const checkInSchema = z.object({
  userId: z.number().positive('userId debe ser un número positivo'),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  accuracy: z.number().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validar datos de entrada
    const validationResult = checkInSchema.safeParse(body);
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

    const { userId, latitude, longitude, accuracy } = validationResult.data;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');

    // Formatear fecha para Odoo: YYYY-MM-DD HH:MM:SS
    const checkIn =
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
      `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const odoo = getOdooClient();

    // Verificar si ya existe un registro abierto para hoy
    const today = now.toISOString().split('T')[0];
    const existingOpen = await odoo.searchRead('hr.attendance', [
      ['employee_id', '=', userId],
      ['check_in', '>=', `${today} 00:00:00`],
      ['check_out', '=', false],
    ]);

    if (existingOpen.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Ya existe un registro de entrada abierto para hoy',
          data: existingOpen[0],
        },
        { status: 409 } // Conflict
      );
    }

    // Crear nuevo registro de asistencia con coordenadas
    const attendanceData: Record<string, any> = {
      employee_id: userId,
      check_in: checkIn,
    };

    // Agregar coordenadas si están disponibles
    if (latitude !== undefined && longitude !== undefined) {
      attendanceData.x_latitude = latitude;
      attendanceData.x_longitude = longitude;
      
      if (accuracy !== undefined) {
        attendanceData.x_accuracy = accuracy;
      }
    }

    const attendanceId = await odoo.create('hr.attendance', attendanceData);

    // Obtener el registro creado
    const [attendance] = await odoo.read('hr.attendance', [attendanceId], [
      'id',
      'employee_id',
      'check_in',
      'check_out',
      'worked_hours',
    ]);

    return NextResponse.json({
      success: true,
      data: {
        result: attendanceId,
        attendance,
        message: 'Entrada registrada exitosamente',
        checkIn,
      }
    });

  } catch (error) {
    console.error('Error in check-in route:', error);

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
