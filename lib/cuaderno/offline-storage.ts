import { get, set } from 'idb-keyval';
import { logger } from '../logger';

const CUADERNO_STORAGE_KEY = '@qr-generator:cuaderno-asientos';

export interface AsientoOffline {
    offline_uuid: string;
    cuaderno_id: string;
    date: string;
    clima: string;
    personal: string;
    equipos: string;
    ocurrencias: string;
    latitude: number;
    longitude: number;
    gps_accuracy: number;
    state: string;
    residente_id?: string;
    supervisor_id?: string;
    created_at: number;
    synced: boolean;
    security_hash: string;
    photos?: { name: string; base64: string; mimetype: string }[];
}

export interface SyncResult {
    success: boolean;
    synced: number;
    errors: SyncError[];
    partials: number;
}

export interface SyncError {
    uuid: string;
    message: string;
}

export async function saveAsientoOffline(asiento: Omit<AsientoOffline, 'synced'>): Promise<void> {
    try {
        const existing = await getOfflineAsientos();
        existing.push({ ...asiento, synced: false });
        await set(CUADERNO_STORAGE_KEY, existing);
        logger.info('Asiento guardado en IndexedDB', { uuid: asiento.offline_uuid });
    } catch (error) {
        logger.error('Error al guardar asiento offline', error as Error);
        throw error;
    }
}

export async function getOfflineAsientos(): Promise<AsientoOffline[]> {
    try {
        const data = await get<AsientoOffline[]>(CUADERNO_STORAGE_KEY);
        return data || [];
    } catch (error) {
        logger.error('Error al leer asientos offline', error as Error);
        return [];
    }
}

export async function getUnsyncedAsientos(): Promise<AsientoOffline[]> {
    const list = await getOfflineAsientos();
    return list.filter(a => !a.synced);
}

export async function markAsientoSynced(uuid: string): Promise<void> {
    try {
        const existing = await getOfflineAsientos();
        // Eliminar del storage local una vez confirmado en Odoo
        const remaining = existing.filter(a => a.offline_uuid !== uuid);
        await set(CUADERNO_STORAGE_KEY, remaining);
    } catch (error) {
        logger.error('Error al marcar asiento como sincronizado', error as Error);
    }
}

/**
 * Sincroniza todos los asientos pendientes con Odoo.
 * 
 * - Envía todos los pendientes en una sola llamada al servidor.
 * - Marca como sincronizados solo los que Odoo confirmó.
 * - Retorna un resultado detallado con conteo de éxitos y errores.
 */
export async function syncPendingAsientos(): Promise<SyncResult> {
    const pending = await getUnsyncedAsientos();
    if (pending.length === 0) {
        return { success: true, synced: 0, errors: [], partials: 0 };
    }

    try {
        const response = await fetch('/api/cuaderno/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ asientos: pending }),
        });

        // Manejar errores HTTP (500, 401, etc.)
        if (!response.ok) {
            const text = await response.text();
            logger.error('HTTP error en sync', undefined, { status: response.status, body: text });
            return {
                success: false,
                synced: 0,
                errors: [{ uuid: 'all', message: `Error HTTP ${response.status}: ${text.slice(0, 200)}` }],
                partials: 0,
            };
        }

        const result = await response.json();

        if (!result.success || !result.data?.results) {
            return {
                success: false,
                synced: 0,
                errors: [{ uuid: 'all', message: result.error || 'Respuesta inesperada del servidor' }],
                partials: 0,
            };
        }

        const apiResults: any[] = result.data.results;
        const syncedUuids = apiResults
            .filter(r => r.status === 'success' || r.status === 'success_partial')
            .map(r => r.offline_uuid);

        const errorItems: SyncError[] = apiResults
            .filter(r => r.status === 'error')
            .map(r => ({ uuid: r.offline_uuid, message: r.error || 'Error desconocido' }));

        // Subir fotos y marcar como sincronizados
        for (const asiento of pending) {
            if (!syncedUuids.includes(asiento.offline_uuid)) continue;

            const resultItem = apiResults.find(r => r.offline_uuid === asiento.offline_uuid);

            // Subir fotos si las hay
            if (asiento.photos && asiento.photos.length > 0 && resultItem?.odoo_id) {
                for (const photo of asiento.photos) {
                    try {
                        await fetch('/api/cuaderno/upload_photo', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                asiento_id: resultItem.odoo_id,
                                file_name: photo.name,
                                file_base64: photo.base64,
                                mimetype: photo.mimetype,
                            }),
                        });
                    } catch (photoErr) {
                        logger.error('Error subiendo foto', photoErr as Error, {
                            uuid: asiento.offline_uuid,
                            odoo_id: resultItem.odoo_id,
                        });
                    }
                }
            }

            await markAsientoSynced(asiento.offline_uuid);
        }

        const partials = apiResults.filter(r => r.status === 'success_partial').length;

        logger.info('Sync completado', {
            total: pending.length,
            synced: syncedUuids.length,
            errors: errorItems.length,
            partials,
        });

        return {
            success: errorItems.length === 0,
            synced: syncedUuids.length,
            errors: errorItems,
            partials,
        };

    } catch (error: any) {
        logger.error('Error de red en syncPendingAsientos', error as Error);
        return {
            success: false,
            synced: 0,
            errors: [{ uuid: 'network', message: error?.message || 'Error de red' }],
            partials: 0,
        };
    }
}
