import { empresaDeSesion } from '@/lib/auth/sesion';
import { type NextRequest, NextResponse } from 'next/server';
import { getOdooClient, OdooError } from '@/lib/odoo-client';
import { z } from 'zod';
import { getSessionFromRequest } from '@/lib/session';
import { puedeActuarSobre } from '@/lib/auth/access-rules';

/**
 * API Route: Registrar Salida (Check-out)
 *
 * Este endpoint marca la salida de un empleado actualizando
 * el registro de asistencia existente con el check_out.
 */

// Schema de validacion
const checkOutSchema = z.object({
  registryId: z.number().positive('registryId debe ser un numero positivo'),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  accuracy: z.number().optional(),
  observation: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    // Defensa en profundidad (el middleware ya exige sesión): solo se actúa sobre los datos propios, salvo supervisor/admin.
    const sesion = await getSessionFromRequest(req);
    if (!sesion) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 });
    const body = await req.json();

    // Validar datos de entrada
    const validationResult = checkOutSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Datos de entrada invalidos',
          details: validationResult.error.issues,
        },
        { status: 400 }
      );
    }

    const { registryId, latitude, longitude, accuracy, observation } = validationResult.data;

    const odoo = getOdooClient(empresaDeSesion(sesion));

    // La salida se marca sobre un registro de asistencia por su id: debe ser del propio empleado (antes se podía cerrar
    // el registro de cualquiera adivinando el número).
    const registros = await odoo.searchRead<{ id: number; employee_id: [number, string] | false }>(
      'hr.attendance', [['id', '=', registryId]], ['employee_id'], { limit: 1 });
    if (registros.length === 0 || !registros[0].employee_id) {
      return NextResponse.json({ success: false, error: 'Registro de asistencia no encontrado' }, { status: 404 });
    }
    if (!puedeActuarSobre({ id: Number(sesion.id), role: String(sesion.role) }, registros[0].employee_id[0])) {
      return NextResponse.json({ success: false, error: 'No puedes operar sobre otro empleado' }, { status: 403 });
    }

    const now = new Date();

    // CRITICAL: Send UTC to Odoo — Odoo stores all datetimes in UTC.
    // Using local time would cause a -5 hour drift when Odoo converts to Lima timezone.
    const pad = (n: number) => String(n).padStart(2, '0');
    const checkOut =
      `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} ` +
      `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;

    // Actualizar el registro de asistencia con check_out y coordenadas
    const updateData: Record<string, any> = {
      check_out: checkOut,
    };

    if (observation) {
      updateData.x_observacion = observation;
    }

    // Agregar coordenadas de salida si estan disponibles
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
          details: error.data ? JSON.stringify(error.data) : error.message,
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
