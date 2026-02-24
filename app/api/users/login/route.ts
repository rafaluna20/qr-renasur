import { NextResponse } from 'next/server';
import { getOdooClient, OdooEmployee, OdooError } from '@/lib/odoo-client';

/**
 * API Route: Obtener Lista de Usuarios/Empleados
 *
 * Este endpoint retorna todos los empleados activos de Odoo.
 * Usado para validación de login en el cliente.
 *
 * NOTA: En producción, este endpoint debería requerir autenticación
 * y no exponer todos los usuarios.
 */

export async function POST() {
  try {
    const odoo = getOdooClient();

    // Obtener empleados activos
    const employees = await odoo.searchRead<OdooEmployee>(
      'hr.employee',
      [['active', '=', true]],
      ['id', 'name', 'work_email', 'identification_id', 'work_phone', 'image_128'],
      { limit: 100 }
    );

    return NextResponse.json({
      success: true,
      data: {
        result: employees,
        count: employees.length,
      }
    });

  } catch (error) {
    console.error('Error in login route:', error);

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
