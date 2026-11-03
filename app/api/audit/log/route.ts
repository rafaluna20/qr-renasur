import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib';
import { getSessionFromRequest } from '@/lib/session';
import { empresaDeSesion } from '@/lib/auth/sesion';

const ACCIONES = new Set(['supervisor_viewed_detail']);

/** Texto del cliente: sin saltos de línea (no se pueden falsificar líneas del log) y con largo máximo. */
const limpio = (v: unknown, max = 60) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').slice(0, max);

export async function POST(req: NextRequest) {
    try {
        // Quién actúa sale de la sesión, no de lo que mande el navegador; la hora la pone el servidor.
        const sesion = await getSessionFromRequest(req);
        if (!sesion) return NextResponse.json({ success: false, message: 'No autenticado' }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const accion = limpio(body?.action);
        if (!ACCIONES.has(accion)) {
            return NextResponse.json({ success: false, message: 'Accion no reconocida' }, { status: 400 });
        }
        const duracion = Number(body?.duration_seconds);

        logger.info('Supervisor action audit', {
            audit: true,
            action: accion,
            asiento_id: limpio(body?.asiento_id, 20),
            duration_seconds: Number.isFinite(duracion) ? Math.min(Math.max(Math.round(duracion), 0), 86_400) : null,
            empleadoId: sesion.id,
            rol: sesion.role,
            empresa: empresaDeSesion(sesion),
            serverTime: new Date().toISOString(),
            ip: limpio(req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown', 100),
            userAgent: limpio(req.headers.get('user-agent') || 'unknown', 200),
        });

        return NextResponse.json({ success: true, message: 'Audit log registered' });
    } catch (error: unknown) {
        logger.error('Error in /api/audit/log', error as Error);
        return NextResponse.json({ success: false, message: 'Error interno' }, { status: 500 });
    }
}
