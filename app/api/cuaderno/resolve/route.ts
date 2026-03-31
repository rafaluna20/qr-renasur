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
            return NextResponse.json({ success: false, error: 'Falta el texto de subsanación' }, { status: 400 });
        }

        const odoo = getOdooClient();

        // Ejecutar el método directamente en Odoo
        const result = await odoo.execute_kw('obra.cuaderno.asiento', 'action_resolve', [[id]], {
            observacion: observacion
        });

        return NextResponse.json({ success: true, result });
    } catch (error: any) {
        console.error('Error in /api/cuaderno/resolve:', error);
        return NextResponse.json({ success: false, error: error.message || 'Error interno' }, { status: 500 });
    }
}
