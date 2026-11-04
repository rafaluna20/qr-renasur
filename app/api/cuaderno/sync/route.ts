import { empresaDeSesion } from '@/lib/auth/sesion';
import { NextRequest } from 'next/server';
import { getOdooClient, logger, successResponse, handleAPIError } from '@/lib';
import { getSessionFromRequest } from '@/lib/session';
import { ROLES_PRIVILEGIADOS } from '@/lib/auth/access-rules';
import { NextResponse } from 'next/server';
import { MAX_ASIENTOS_POR_LOTE, validarAsientoSync } from '@/lib/validation/asiento-sync';
import { puedeAnotar } from '@/lib/cuaderno/permisos';
import { tiposActivos } from '@/lib/cuaderno/config';
import { empresas } from '@/lib/empresas';
import { TIPO_POR_DEFECTO, puedeEmitir, redaccionValida, requiereEstructura, tipoDe } from '@/lib/cuaderno/tipologia';
import { limpiarTexto } from '@/lib/validation/texto';

/**
 * POST /api/cuaderno/sync
 * 
 * Sincroniza asientos offline con Odoo.
 * 
 * Estrategia de creación en dos pasos:
 * 1. Crear el asiento en estado 'draft' (Odoo siempre acepta esto).
 * 2. Si el asiento original tenía estado 'signed_residente',
 *    llamar al método de transición `action_sign_residente`.
 * 
 * Esto respeta el workflow de Odoo y evita errores de campo
 * protegido al asignar `state` directamente en create.
 */
export async function POST(req: NextRequest) {
    try {
        const sesion = await getSessionFromRequest(req);
        if (!sesion) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 });
        // Solo el residente, el supervisor (y el administrador) anotan en el cuaderno.
        if (!puedeAnotar({ id: sesion.id, role: sesion.role })) {
            return NextResponse.json({ success: false, error: 'Tu rol no puede anotar en el cuaderno de obra' }, { status: 403 });
        }
        const esPrivilegiado = (ROLES_PRIVILEGIADOS as readonly string[]).includes(String(sesion.role));
        const esSupervisor = String(sesion.role) === 'supervisor';
        const body = await req.json();
        const asientos = body.asientos;

        if (!Array.isArray(asientos) || asientos.length === 0) {
            return handleAPIError(new Error('No se enviaron asientos para sincronizar'));
        }
        if (asientos.length > MAX_ASIENTOS_POR_LOTE) {
            return NextResponse.json(
                { success: false, error: `Maximo ${MAX_ASIENTOS_POR_LOTE} asientos por sincronizacion` },
                { status: 413 }
            );
        }

        const odoo = getOdooClient(empresaDeSesion(sesion));
        const tipos = tiposActivos(empresaDeSesion(sesion));
        const metodoFirma = String(sesion.metodo) === 'sso' ? 'sso' : 'dni';
        // Identificacion reforzada: con firmaSoloSso la empresa solo admite firmar a quien entro por la billetera.
        const exigeSso = empresas().find((e) => e.id === empresaDeSesion(sesion))?.firmaSoloSso === true;
        if (tipos && exigeSso && metodoFirma !== 'sso') {
            return NextResponse.json(
                { success: false, error: 'Para firmar asientos entra desde tu billetera (Servicios, Asistencia): el acceso con DNI no basta.' },
                { status: 403 }
            );
        }
        const results = [];

        for (const crudo of asientos) {
            // Se valida cada asiento por separado: uno malo no tumba a los demas (y se informa por su offline_uuid).
            const uuidCrudo = typeof crudo?.offline_uuid === 'string' ? crudo.offline_uuid : undefined;
            const validado = validarAsientoSync(crudo);
            if (!validado.ok) {
                results.push({ offline_uuid: uuidCrudo, status: 'error', error: validado.error });
                continue;
            }
            const asiento = validado.asiento;
            try {
                const cuadernoId = asiento.cuaderno_id;

                // Cada profesional anota a su propio nombre: el residente como residente y el supervisor como supervisor
                // (antes el asiento de un supervisor quedaba a nombre del residente). El administrador puede indicar ambos.
                const residenteId = esSupervisor ? undefined : esPrivilegiado ? asiento.residente_id : Number(sesion.id);
                const supervisorId = esSupervisor ? Number(sesion.id) : esPrivilegiado ? asiento.supervisor_id : undefined;

                // CAMPOS CONFIRMADOS en obra.cuaderno.asiento (via fields_get):
                //   cuaderno_id, date, clima, ocurrencias, latitude, longitude,
                //   gps_accuracy, residente_id, supervisor_id,
                //   x_personal, x_equipos, x_hash_seguridad  <- creados en Odoo
                const vals: Record<string, any> = {
                    cuaderno_id: cuadernoId,
                    date: asiento.date,
                    clima: asiento.clima,
                    ocurrencias: limpiarTexto(asiento.ocurrencias),
                    x_personal: limpiarTexto(asiento.personal),
                    x_equipos: limpiarTexto(asiento.equipos),
                    x_hash_seguridad: asiento.security_hash || '',
                };

                // Tipologia (solo con el interruptor encendido y el Odoo ya actualizado): el tipo debe corresponder al rol, los
                // que no son informativos exigen Hecho-Causa-Efecto-Solicitud y las respuestas/aclaraciones deben citar un asiento.
                if (tipos) {
                    const tipo = asiento.tipo || TIPO_POR_DEFECTO;
                    const def = tipoDe(tipo);
                    if (!def) throw new Error(`Tipo de asiento desconocido: ${tipo}`);
                    if (!puedeEmitir(sesion.role, tipo)) throw new Error('Tu rol no puede emitir este tipo de asiento');
                    if (requiereEstructura(tipo)) {
                        const v = redaccionValida(asiento.ocurrencias);
                        if (!v.ok) throw new Error(v.motivo);
                    }
                    if (def.requiereReferencia && !asiento.asiento_referido_id) throw new Error('Este tipo de asiento debe citar un asiento anterior');
                    if (asiento.asiento_referido_id) {
                        const citado = await odoo.searchRead<{ id: number; cuaderno_id: [number, string] | false }>(
                            'obra.cuaderno.asiento', [['id', '=', asiento.asiento_referido_id]], ['cuaderno_id'], { limit: 1 });
                        if (citado.length === 0) throw new Error('El asiento citado no existe');
                        if (!citado[0].cuaderno_id || citado[0].cuaderno_id[0] !== cuadernoId) throw new Error('El asiento citado es de otro cuaderno');
                    }
                    vals.tipo = tipo;
                    vals.firma_metodo = metodoFirma;
                    // Evidencia de la firma tomada del servidor (no del cuerpo que manda el navegador).
                    vals.firma_ip = (req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '').slice(0, 64);
                    vals.firma_dispositivo = (req.headers.get('user-agent') || '').replace(/[\r\n]+/g, ' ').slice(0, 200);
                    if (asiento.asiento_referido_id) vals.asiento_referido_id = asiento.asiento_referido_id;
                }

                // Campos opcionales: solo incluir si tienen valor valido
                if (asiento.latitude) vals.latitude = asiento.latitude;
                if (asiento.longitude) vals.longitude = asiento.longitude;
                if (asiento.gps_accuracy) vals.gps_accuracy = asiento.gps_accuracy;
                if (residenteId) vals.residente_id = residenteId;
                if (supervisorId) vals.supervisor_id = supervisorId;

                logger.info('Creando asiento en Odoo', {
                    uuid: asiento.offline_uuid,
                    cuaderno_id: cuadernoId,
                    date: asiento.date,
                    originalState: asiento.state,
                });

                // ──────────────────────────────────────────────────────────────
                // Paso 3: Crear el registro en Odoo (en estado draft)
                // ──────────────────────────────────────────────────────────────
                // OdooClient.create() siempre retorna un number normalizado
                // Reintento tras perder la respuesta: el hash (fecha + GPS + ocurrencias) identifica al asiento, así que si ya
                // existe uno igual del mismo residente, cuaderno y fecha, se devuelve ese en vez de crear otro.
                const campoAutor = residenteId ? 'residente_id' : supervisorId ? 'supervisor_id' : null;
                if (asiento.security_hash && campoAutor) {
                    const previos = await odoo.searchRead<{ id: number }>(
                        'obra.cuaderno.asiento',
                        [
                            ['cuaderno_id', '=', cuadernoId],
                            [campoAutor, '=', (residenteId ?? supervisorId) as number],
                            ['date', '=', asiento.date],
                            ['x_hash_seguridad', '=', asiento.security_hash],
                        ],
                        ['id'],
                        { limit: 1 },
                    );
                    if (previos.length > 0) {
                        logger.info('Asiento ya existia en Odoo (reintento); no se duplica', { uuid: asiento.offline_uuid, odoo_id: previos[0].id });
                        results.push({ offline_uuid: asiento.offline_uuid, odoo_id: previos[0].id, status: 'success', duplicado: true });
                        continue;
                    }
                }

                const createdId = await odoo.create('obra.cuaderno.asiento', vals);

                if (!createdId || isNaN(createdId)) {
                    throw new Error(`Odoo retornó un ID inválido: ${createdId}`);
                }

                logger.info('Asiento creado en draft', { uuid: asiento.offline_uuid, odoo_id: createdId });

                // ──────────────────────────────────────────────────────────────
                // Paso 4: Transición de estado — llamar al método del workflow
                // Si el asiento fue firmado por el residente en la app,
                // ahora ejecutamos la transición en Odoo para reflejar eso.
                // ──────────────────────────────────────────────────────────────
                if (asiento.state === 'signed_residente') {
                    try {
                        await odoo.execute_kw(
                            'obra.cuaderno.asiento',
                            'action_sign_residente',
                            [[createdId]],
                            {}
                        );
                        logger.info('Asiento firmado por residente en Odoo', {
                            uuid: asiento.offline_uuid,
                            odoo_id: createdId,
                        });
                    } catch (signErr: any) {
                        // La firma falló pero el registro sí se creó.
                        // Se reporta como éxito parcial para que no quede
                        // bloqueado en el dispositivo, pero se avisa del problema.
                        logger.error(
                            `Asiento creado (ID=${createdId}) pero la firma falló`,
                            signErr as Error,
                            { uuid: asiento.offline_uuid }
                        );
                        results.push({
                            offline_uuid: asiento.offline_uuid,
                            odoo_id: createdId,
                            status: 'success_partial',
                            warning: `Asiento creado pero sin firmar: ${signErr.message}`,
                        });
                        continue;
                    }
                }

                results.push({
                    offline_uuid: asiento.offline_uuid,
                    odoo_id: createdId,
                    status: 'success',
                });

            } catch (err: any) {
                // Loguear el error completo para depuración (visible en terminal del servidor)
                logger.error(`Error sincronizando asiento ${asiento.offline_uuid}`, err as Error, {
                    cuaderno_id: asiento.cuaderno_id,
                    date: asiento.date,
                    odooMessage: err?.data?.message || err?.message,
                    odooCode: err?.code,
                });

                results.push({
                    offline_uuid: asiento.offline_uuid,
                    status: 'error',
                    error: err?.data?.message || err?.message || 'Error desconocido en Odoo',
                });
            }
        }

        const syncedCount = results.filter(r => r.status === 'success' || r.status === 'success_partial').length;
        const errorCount = results.filter(r => r.status === 'error').length;

        logger.info('Cuaderno sync completado', {
            total: asientos.length,
            synced: syncedCount,
            errors: errorCount,
        });

        return successResponse({ results, synced: syncedCount, errors: errorCount });

    } catch (error: any) {
        logger.error('Error fatal en /api/cuaderno/sync', error as Error);
        return handleAPIError(error);
    }
}
