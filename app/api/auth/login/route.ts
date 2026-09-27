import { NextResponse } from 'next/server';
import { getOdooClient, OdooEmployee } from '@/lib/odoo-client';
import { empresas } from '@/lib/empresas';
import type { Rol } from '@/lib/vinculos';
import { datosDeSesion } from '@/lib/auth/sesion';
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

    const { email, password, empresa: empresaPedida } = await req.json();

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

    // La empresa se elige AQUÍ (todavía no hay sesión) y la persona se autentica contra el Odoo de ESA empresa.
    // Con una sola empresa configurada no hace falta indicarla.
    const lista = empresas();
    const empresa = empresaPedida ? lista.find((e) => e.id === empresaPedida) : lista.length === 1 ? lista[0] : undefined;
    if (!empresa) {
      return NextResponse.json({ success: false, error: 'Indica la empresa', empresas: lista.map((e) => ({ id: e.id, nombre: e.nombre })) }, { status: 400 });
    }
    const odoo = getOdooClient(empresa.id);

    // Buscar empleado por email
    const employees = await odoo.searchRead<OdooEmployee>(
      'hr.employee',
      [['active', '=', true], ['work_email', '=', email]],
      ['id', 'name', 'work_email', 'identification_id', 'image_128', ...(empresa.obra ? [empresa.campoRol] : [])],
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
    const rolCrudo = empresa.obra ? String((user as any)[empresa.campoRol] || '') : '';
    const obraRole: Rol = (['employee', 'resident', 'supervisor', 'admin'] as Rol[]).find((r) => r === rolCrudo) ?? 'employee';

    const sessionPayload = datosDeSesion(
      { empresa: empresa.id, empresaNombre: empresa.nombre, id: user.id, role: obraRole, name: user.name },
      [{ empresa: empresa.id, empresaNombre: empresa.nombre, id: user.id, role: obraRole, name: user.name }],
      { email: user.work_email, cuenta: '' },
    );

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
        empresa: empresa.id,
        image_128: user.image_128
      }
    });

  } catch (error) {
    console.error('Error logging in:', error);
    // Se distingue el tipo de falla (sin exponer detalles internos) para poder corregir la configuración de una empresa.
    const texto = String((error as Error)?.message ?? error);
    const motivo = /access ?denied|accesserror|not allowed|permiso/i.test(texto) ? 'odoo_acceso'
      : /HTTP error|Failed to communicate|fetch failed|ENOTFOUND|ECONN/i.test(texto) ? 'odoo_conexion'
      : /Invalid field/i.test(texto) ? 'odoo_campo'
      : /empresa|EMPRESAS_JSON/i.test(texto) ? 'configuracion' : 'interno';
    const mensajes: Record<string, string> = {
      odoo_acceso: 'La empresa rechazó la conexión (usuario o clave de servicio incorrectos). Avisa a administración.',
      odoo_conexion: 'No se pudo conectar con el Odoo de la empresa (dirección incorrecta o caído). Avisa a administración.',
      odoo_campo: 'Al Odoo de la empresa le falta un campo requerido. Avisa a administración.',
      configuracion: 'La configuración de la empresa es inválida. Avisa a administración.',
      interno: 'Error del servidor',
    };
    return NextResponse.json({ success: false, error: mensajes[motivo], motivo }, { status: 500 });
  }
}
