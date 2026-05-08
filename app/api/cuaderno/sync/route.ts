import { NextRequest } from 'next/server';
import { getOdooClient, logger, successResponse, handleAPIError } from '@/lib';

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
        const body = await req.json();
        const asientos = body.asientos;

        if (!Array.isArray(asientos) || asientos.length === 0) {
            return handleAPIError(new Error('No se enviaron asientos para sincronizar'));
        }

        const odoo = getOdooClient();
        const results = [];

        for (const asiento of asientos) {
            try {
                // ──────────────────────────────────────────────────────────────
                // Paso 1: Validar datos mínimos requeridos
                // ──────────────────────────────────────────────────────────────
                const cuadernoId = parseInt(asiento.cuaderno_id);
                if (isNaN(cuadernoId) || cuadernoId <= 0) {
                    throw new Error(`cuaderno_id inválido: "${asiento.cuaderno_id}"`);
                }

                const residenteId = asiento.residente_id ? parseInt(asiento.residente_id) : undefined;
                const supervisorId = asiento.supervisor_id ? parseInt(asiento.supervisor_id) : undefined;

                // ──────────────────────────────────────────────────────────────
                // Paso 2: Construir el dict de valores para create
                //
                // CAMPOS CONFIRMADOS en obra.cuaderno.asiento (via fields_get):
                //   cuaderno_id, date, clima, ocurrencias, latitude, longitude,
                //   gps_accuracy, residente_id, supervisor_id,
                //   x_personal, x_equipos, x_hash_seguridad  ← creados en Odoo
                // ──────────────────────────────────────────────────────────────
                const vals: Record<string, any> = {
                    cuaderno_id: cuadernoId,
                    date: asiento.date,
                    clima: asiento.clima || 'soleado',
                    ocurrencias: asiento.ocurrencias || '',
                    x_personal: asiento.personal || '',
                    x_equipos: asiento.equipos || '',
                    x_hash_seguridad: asiento.security_hash || '',
                };

                // Campos opcionales — solo incluir si tienen valor válido
                if (asiento.latitude && asiento.latitude !== 0) {
                    vals.latitude = parseFloat(asiento.latitude);
                }
                if (asiento.longitude && asiento.longitude !== 0) {
                    vals.longitude = parseFloat(asiento.longitude);
                }
                if (asiento.gps_accuracy && asiento.gps_accuracy !== 0) {
                    vals.gps_accuracy = parseFloat(asiento.gps_accuracy);
                }
                if (residenteId && !isNaN(residenteId)) {
                    vals.residente_id = residenteId;
                }
                if (supervisorId && !isNaN(supervisorId)) {
                    vals.supervisor_id = supervisorId;
                }



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
