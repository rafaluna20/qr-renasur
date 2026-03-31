import { NextResponse } from 'next/server';
import { getOdooClient, OdooEmployee, OdooError } from '@/lib/odoo-client';

/**
 * API Route: Obtener Lista de Usuarios/Empleados
 *
 * Este endpoint retorna todos los empleados activos de Odoo.
 * Usado para validacion de login en el cliente.
 *
 * NOTA: En produccion, este endpoint deberia requerir autenticacion
 * y no exponer todos los usuarios.
 */

export async function POST() {
  try {
    const odoo = getOdooClient();

    // Obtener empleados activos
    const employees = await odoo.searchRead<OdooEmployee>(
      'hr.employee',
      [['active', '=', true]],
      ['id', 'name', 'work_email', 'identification_id', 'work_phone', 'image_128', 'x_obra_role'],
      { limit: 100 }
    );

    // Transformar los empleados para incluir 'obra_role'
    const transformedEmployees = employees.map(employee => ({
      ...employee,
      obra_role: employee.x_obra_role || 'employee' // Guardamos en memoria como obra_role internamente
    }));

    return NextResponse.json({
      success: true,
      data: {
        result: transformedEmployees,
        count: transformedEmployees.length,
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
