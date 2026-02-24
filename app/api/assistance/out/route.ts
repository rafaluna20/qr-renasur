import { type NextRequest, NextResponse } from 'next/server';
import { getOdooClient, OdooError } from '@/lib/odoo-client';
import { z } from 'zod';

/**
 * API Route: Registrar Salida (Check-out)
 *
 * Este endpoint marca la salida de un empleado actualizando
 * el registro de asistencia existente con el check_out.
 */

// Schema de validación
const checkOutSchema = z.object({
  registryId: z.number().positive('registryId debe ser un número positivo'),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  accuracy: z.number().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validar datos de entrada
    const validationResult = checkOutSchema.safeParse(body);
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

    const { registryId, latitude, longitude, accuracy } = validationResult.data;

    const odoo = getOdooClient();
    const now = new Date();
    
    // Formatear fecha para Odoo: YYYY-MM-DD HH:MM:SS
    const pad = (n: number) => String(n).padStart(2, '0');
    const checkOut = 
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
      `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    // Actualizar el registro de asistencia con check_out y coordenadas
    const updateData: Record<string, any> = {
      check_out: checkOut,
    };

    // Agregar coordenadas de salida si están disponibles
    if (latitude !== undefined && longitude !== undefined) {
      updateData.x_latitude_out = latitude;
      updateData.x_longitude_out = longitude;
      
      if (accuracy !== undefined) {
        updateData.x_accuracy_out = accuracy;
      }
    }

    const updated = await odoo.write('hr.attendance', [registryId], updateData);

    if (!updated) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'No se pudo actualizar el registro de asistencia' 
        },
        { status: 500 }
      );
    }

    // Obtener el registro actualizado para retornar datos completos
    const [attendance] = await odoo.read('hr.attendance', [registryId], [
      'id',
      'employee_id',
      'check_in',
      'check_out',
      'worked_hours',
    ]);

    return NextResponse.json({ 
      success: true, 
      data: {
        message: 'Salida registrada exitosamente',
        attendance,
        checkOut,
      }
    });

  } catch (error) {
    console.error('Error in check-out route:', error);

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
