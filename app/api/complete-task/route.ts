import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { puedeActuarSobre } from '@/lib/auth/access-rules';

export async function POST(req: Request) {
  try {
    // Defensa en profundidad (el middleware ya exige sesión): solo se actúa sobre los datos propios, salvo supervisor/admin.
    const sesion = await getSessionFromRequest(req);
    if (!sesion) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 });
    const body = await req.json();

    // Validar payload basico
    if (!body.id_proyecto || !body.id_tarea || !body.id_usuario) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos requeridos (proyecto, tarea o usuario)' },
        { status: 400 }
      );
    }

    if (!puedeActuarSobre({ id: Number(sesion.id), role: String(sesion.role) }, Number(body.id_usuario))) {
      return NextResponse.json({ success: false, error: 'No puedes operar sobre otro empleado' }, { status: 403 });
    }

    const n8nWebhookUrl = 'https://n8n-n8n.2fsywk.easypanel.host/webhook/hoja_horas';

    const response = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Error en webhook n8n: ${response.status}`);
    }

    // Opcionalmente se puede leer el response JSON si lo hubiera
    // const data = await response.json();

    return NextResponse.json({ success: true, message: 'Tarea reportada exitosamente a n8n.' }, { status: 200 });
  } catch (error: any) {
    console.error('API complete-task error:', error);
    return NextResponse.json(
      { success: false, error: 'Ocurrio un error procesando la tarea en el servidor.' },
      { status: 500 }
    );
  }
}
