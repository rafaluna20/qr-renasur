import { empresaDeSesion } from '@/lib/auth/sesion';
import { type NextRequest, NextResponse } from 'next/server';
import { getOdooClient, OdooAnalyticLine } from '@/lib/odoo-client';
import { z } from 'zod';
import { getSessionFromRequest } from '@/lib/session';
import { puedeActuarSobre } from '@/lib/auth/access-rules';

/**
 * API Route: Consultar Lineas Analiticas (Horas registradas)
 * Requiere modulo hr_timesheet instalado en Odoo para tener
 * los campos employee_id, project_id y task_id.
 */

const taskQuerySchema = z.object({
  userId: z.union([z.number(), z.string()]).transform(val => Number(val)),
  limit: z.number().positive().optional().default(100),
});

export async function POST(req: NextRequest) {
  try {
    // Defensa en profundidad (el middleware ya exige sesión): solo se actúa sobre los datos propios, salvo supervisor/admin.
    const sesion = await getSessionFromRequest(req);
    if (!sesion) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 });
    const body = await req.json();

    const validationResult = taskQuerySchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Datos de entrada invalidos', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { userId, limit } = validationResult.data;

    // Si userId es 0 o invalido (ej: rol admin), retornar vacio directamente
    if (!userId || userId <= 0) {
      return NextResponse.json({ success: true, data: { result: [], count: 0 } });
    }

    if (!puedeActuarSobre({ id: Number(sesion.id), role: String(sesion.role) }, userId)) {
      return NextResponse.json({ success: false, error: 'No puedes operar sobre otro empleado' }, { status: 403 });
    }

    const odoo = getOdooClient(empresaDeSesion(sesion));

    // Filtrar por employee_id (disponible con hr_timesheet instalado)
    const tasks = await odoo.searchRead<OdooAnalyticLine>(
      'account.analytic.line',
      [['employee_id', '=', userId]],
      ['date', 'project_id', 'task_id', 'name', 'unit_amount', 'so_line'],
      { limit, order: 'date desc' }
    );

    return NextResponse.json({
      success: true,
      data: { result: tasks, count: tasks.length },
    });

  } catch (error) {
    console.warn('task route: query failed, returning empty.', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: true, data: { result: [], count: 0 } });
  }
}
