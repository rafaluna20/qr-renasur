import { type NextRequest, NextResponse } from 'next/server';
import { getOdooClient, OdooError } from '@/lib/odoo-client';
import { z } from 'zod';

/**
 * API Route: Registrar Nuevo Usuario/Empleado
 *
 * Este endpoint crea un nuevo empleado en Odoo.
 * SEGURIDAD: Usar variables de entorno del servidor (sin NEXT_PUBLIC_)
 */

// Schema de validación
const registerSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  email: z.string().email('Correo electrónico inválido'),
  phone: z.string().regex(/^9\d{8}$/, 'Teléfono debe empezar con 9 y tener 9 dígitos'),
  dni: z.string().regex(/^\d{8}$/, 'DNI debe tener 8 dígitos'),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validar datos de entrada
    const validationResult = registerSchema.safeParse(body);
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

    const { name, email, phone, dni } = validationResult.data;

    // Usar cliente Odoo centralizado
    const odoo = getOdooClient();

    // Verificar si el empleado ya existe
    const existing = await odoo.searchCount('hr.employee', [
      '|',
      ['work_email', '=', email],
      ['identification_id', '=', dni],
    ]);

    if (existing > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'El empleado ya existe con ese correo o DNI',
        },
        { status: 409 } // Conflict
      );
    }

    // Crear nuevo empleado
    const employeeId = await odoo.create('hr.employee', {
      name,
      work_email: email,
      work_phone: phone,
      identification_id: dni,
      active: true,
    });

    return NextResponse.json({
      success: true,
      data: {
        result: employeeId,
        message: 'Empleado registrado exitosamente',
      }
    });

  } catch (error) {
    console.error('Error in register route:', error);

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
