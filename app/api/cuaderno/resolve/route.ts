import { getSessionFromRequest } from '@/lib/session';
import { empresaDeSesion } from '@/lib/auth/sesion';
import { NextResponse } from 'next/server';
import { getOdooClient } from '@/lib/odoo-client';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { id, observacion } = body;

        if (!id) {
            return NextResponse.json({ success: false, error: 'Falta ID del Asiento' }, { status: 400 });
        }
        if (!observacion) {
            return NextResponse.json({ success: false, error: 'Falta el texto de subsanacion' }, { status: 400 });
        }

        const sesion = await getSessionFromRequest(request);
        if (!sesion) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 });
        const odoo = getOdooClient(empresaDeSesion(sesion));

        // Ejecutar el metodo directamente en Odoo
        const result = await odoo.execute_kw('obra.cuaderno.asiento', 'action_resolve', [[id]], {
            observacion: observacion
        });

        return NextResponse.json({ success: true, result });
    } catch (error: any) {
        console.error('Error in /api/cuaderno/resolve:', error);
        return NextResponse.json({ success: false, error: error.message || 'Error interno' }, { status: 500 });
    }
}
