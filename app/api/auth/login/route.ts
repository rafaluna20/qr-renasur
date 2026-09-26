import { NextResponse } from 'next/server';
import { getOdooClient, OdooEmployee } from '@/lib/odoo-client';
import { setSessionCookie, createSession } from '@/lib/session';
import { timingSafeEqual } from 'node:crypto';
import { limpiarIntentos, registrarIntento } from '@/lib/auth/rate-limit';

const iguales = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export async function POST(req: Request) {
  try {
    // Interruptor: con el inicio de sesión único de la billetera funcionando, poner ALLOW_PASSWORD_LOGIN=false
    // (la contraseña de este login es el DNI de la persona, que no es un secreto).
    if (process.env.ALLOW_PASSWORD_LOGIN === 'false') {
      return NextResponse.json({ success: false, error: 'Ingresa desde tu billetera (Servicios → Asistencia)' }, { status: 403 });
    }

    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ success: false, error: 'Faltan credenciales' }, { status: 400 });
    }

    // Freno a la fuerza bruta: por dirección IP y por correo.
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'sin-ip';
    const clave = `${ip}|${String(email).toLowerCase()}`;
    const intento = registrarIntento(clave);
    if (!intento.permitido) {
      return NextResponse.json(
        { success: false, error: 'Demasiados intentos. Espera unos minutos.' },
        { status: 429, headers: { 'retry-after': String(intento.reintentarEn) } }
      );
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

    // Validar contrasena (DNI)
    if (!iguales(String(user.identification_id ?? ''), String(password))) {
      return NextResponse.json({ success: false, error: 'Contrasena incorrecta' }, { status: 401 });
    }

    limpiarIntentos(clave);
    const obraRole = user.x_obra_role || 'employee';

    const sessionPayload = {
      id: user.id,
      email: user.work_email,
      role: obraRole,
      name: user.name,
    };

    // Crear sesion HTTP-Only para web
    await setSessionCookie(sessionPayload);
    
    // Crear token crudo para app movil
    const token = await createSession(sessionPayload);

    return NextResponse.json({
      success: true,
      token, // <-- Enviar token explícitamente
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
