import { NextResponse } from 'next/server';
import { getOdooClient, OdooEmployee } from '@/lib/odoo-client';
import { setSessionCookie } from '@/lib/session';

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ success: false, error: 'Faltan credenciales' }, { status: 400 });
    }

    const odoo = getOdooClient();
    
    // Buscar empleado por email
    const employees = await odoo.searchRead<OdooEmployee>(
      'hr.employee',
      [['active', '=', true], ['work_email', '=', email]],
      ['id', 'name', 'work_email', 'identification_id', 'image_128', 'x_obra_role'],
      { limit: 1 }
    );

    if (employees.length === 0) {
      return NextResponse.json({ success: false, error: 'Usuario no encontrado' }, { status: 401 });
    }

    const user = employees[0];

    // Validar contraseña (DNI)
    if (user.identification_id !== password) {
      return NextResponse.json({ success: false, error: 'Contraseña incorrecta' }, { status: 401 });
    }

    const obraRole = user.x_obra_role || 'employee';

    // Crear sesión HTTP-Only
    await setSessionCookie({
      id: user.id,
      email: user.work_email,
      role: obraRole,
      name: user.name,
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.work_email,
        role: obraRole,
        name: user.name,
        image_128: user.image_128
      }
    });

  } catch (error) {
    console.error('Error logging in:', error);
    return NextResponse.json({ success: false, error: 'Error del servidor' }, { status: 500 });
  }
}
