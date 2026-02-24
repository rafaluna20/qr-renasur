import { type NextRequest, NextResponse } from 'next/server';
import { getOdooClient, OdooAnalyticLine } from '@/lib/odoo-client';
import { z } from 'zod';

/**
 * API Route: Consultar Líneas Analíticas (Horas registradas)
 * Requiere módulo hr_timesheet instalado en Odoo para tener
 * los campos employee_id, project_id y task_id.
 */

const taskQuerySchema = z.object({
  userId: z.union([z.number(), z.string()]).transform(val => Number(val)),
  limit: z.number().positive().optional().default(100),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const validationResult = taskQuerySchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Datos de entrada inválidos', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { userId, limit } = validationResult.data;

    // Si userId es 0 o inválido (ej: rol admin), retornar vacío directamente
    if (!userId || userId <= 0) {
      return NextResponse.json({ success: true, data: { result: [], count: 0 } });
    }

    const odoo = getOdooClient();

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
