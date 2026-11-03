import { NextResponse } from 'next/server';

/**
 * Retirada: el cuaderno digital NO tiene aprobacion de los asientos diarios por parte del supervisor, ni se edita un
 * asiento firmado. Una correccion o aclaracion se registra como un asiento NUEVO que cita al anterior.
 */
export async function POST() {
    return NextResponse.json(
        { success: false, error: 'Esta accion ya no existe: un asiento firmado no se modifica. Registra un asiento de aclaracion.' },
        { status: 410 }
    );
}
