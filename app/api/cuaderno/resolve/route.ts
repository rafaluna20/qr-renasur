import { getSessionFromRequest } from '@/lib/session';
import { empresaDeSesion } from '@/lib/auth/sesion';
import { NextResponse } from 'next/server';
import { getOdooClient } from '@/lib/odoo-client';
import { puedeTrabajarAsiento } from '@/lib/cuaderno/permisos';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const asientoId = Number(body.id);
        const observacion = typeof body.observacion === 'string' ? body.observacion.trim() : '';

        if (!Number.isInteger(asientoId) || asientoId <= 0) {
            return NextResponse.json({ success: false, error: 'Falta ID del Asiento' }, { status: 400 });
        }
        if (!observacion) {
            return NextResponse.json({ success: false, error: 'Falta el texto de subsanacion' }, { status: 400 });
        }
        if (observacion.length > 1000) {
            return NextResponse.json({ success: false, error: 'El texto de subsanacion es muy largo (maximo 1000 caracteres)' }, { status: 400 });
        }

        const sesion = await getSessionFromRequest(request);
        if (!sesion) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 });
        const odoo = getOdooClient(empresaDeSesion(sesion));

        // Solo el residente del asiento (o un supervisor/administrador) puede subsanarlo.
        const asientos = await odoo.searchRead<{ id: number; residente_id: [number, string] | false }>(
            'obra.cuaderno.asiento', [['id', '=', asientoId]], ['residente_id'], { limit: 1 });
        if (asientos.length === 0) {
            return NextResponse.json({ success: false, error: 'Asiento no encontrado' }, { status: 404 });
        }
        const residenteId = asientos[0].residente_id ? asientos[0].residente_id[0] : null;
        if (!puedeTrabajarAsiento({ id: sesion.id, role: sesion.role }, residenteId)) {
            return NextResponse.json({ success: false, error: 'No puedes subsanar este asiento' }, { status: 403 });
        }

        // Ejecutar el metodo directamente en Odoo
        const result = await odoo.execute_kw('obra.cuaderno.asiento', 'action_resolve', [[asientoId]], {
            observacion: observacion
        });

        return NextResponse.json({ success: true, result });
    } catch (error: any) {
        console.error('Error in /api/cuaderno/resolve:', error);
        return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
    }
}
