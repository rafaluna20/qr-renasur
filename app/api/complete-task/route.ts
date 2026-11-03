import { empresaDeSesion } from '@/lib/auth/sesion';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionFromRequest } from '@/lib/session';
import { puedeActuarSobre } from '@/lib/auth/access-rules';

// Webhook de n8n que registra la hoja de horas. Se configura con WEBHOOK_URL; si falta se usa el de siempre.
const WEBHOOK_POR_DEFECTO = 'https://n8n-n8n.2fsywk.easypanel.host/webhook/hoja_horas';

const idTexto = z.union([z.string(), z.number()]).transform((v) => String(v).trim()).pipe(z.string().min(1).max(40));

// Solo estos campos viajan a n8n (antes se reenviaba el cuerpo completo que mandara el navegador).
const tareaSchema = z.object({
  id_proyecto: idTexto,
  id_tarea: idTexto,
  id_usuario: z.union([z.string(), z.number()]).transform((v) => Number(v)).pipe(z.number().int().positive()),
  descripcion: z.string().max(2000).optional().default(''),
  horas: z.string().regex(/^\d{1,3}:\d{2}$/, 'horas debe ser HH:MM'),
  date: z.string().max(40).optional(),
});

export async function POST(req: Request) {
  try {
    // Defensa en profundidad (el middleware ya exige sesión): solo se actúa sobre los datos propios, salvo supervisor/admin.
    const sesion = await getSessionFromRequest(req);
    if (!sesion) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 });

    const validado = tareaSchema.safeParse(await req.json().catch(() => null));
    if (!validado.success) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos requeridos o son invalidos (proyecto, tarea, usuario, horas)' },
        { status: 400 }
      );
    }
    const datos = validado.data;

    if (!puedeActuarSobre({ id: Number(sesion.id), role: String(sesion.role) }, datos.id_usuario)) {
      return NextResponse.json({ success: false, error: 'No puedes operar sobre otro empleado' }, { status: 403 });
    }

    const response = await fetch(process.env.WEBHOOK_URL?.trim() || WEBHOOK_POR_DEFECTO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...datos, id_usuario: String(datos.id_usuario), empresa: empresaDeSesion(sesion) }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`Error en webhook n8n: ${response.status}`);
    }

    return NextResponse.json({ success: true, message: 'Tarea reportada exitosamente a n8n.' }, { status: 200 });
  } catch (error: unknown) {
    console.error('API complete-task error:', error);
    return NextResponse.json(
      { success: false, error: 'Ocurrio un error procesando la tarea en el servidor.' },
      { status: 500 }
    );
  }
}
