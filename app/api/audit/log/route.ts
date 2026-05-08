import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { action, asiento_id, duration_seconds, timestamp } = body;

        // Registrar en el sistema de logs estructurados
        logger.info('Supervisor action audit', {
            audit: true,
            action,
            asiento_id,
            duration_seconds,
            timestamp,
            ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
            userAgent: req.headers.get('user-agent') || 'unknown',
        });

        return NextResponse.json({
            success: true,
            message: 'Audit log registered',
        });
    } catch (error: any) {
        logger.error('Error in /api/audit/log', error as Error);
        return NextResponse.json(
            { success: false, message: error.message },
            { status: 500 }
        );
    }
}
