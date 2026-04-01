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

export async function saveAsientoOffline(asiento: Omit<AsientoOffline, 'synced'>): Promise<void> {
    try {
        const existing = await getOfflineAsientos();
        existing.push({ ...asiento, synced: false });
        await set(CUADERNO_STORAGE_KEY, existing);
        logger.info('Asiento saved locally in IndexedDB', { uuid: asiento.offline_uuid });
    } catch (error) {
        logger.error('Failed to save asiento offline', error as Error);
        throw error;
    }
}

export async function getOfflineAsientos(): Promise<AsientoOffline[]> {
    try {
        const data = await get<AsientoOffline[]>(CUADERNO_STORAGE_KEY);
        return data || [];
    } catch (error) {
        logger.error('Failed to get offline asientos', error as Error);
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
        const updated = existing.map(a => a.offline_uuid === uuid ? { ...a, synced: true } : a);
        const remaining = updated.filter(a => !a.synced);
        await set(CUADERNO_STORAGE_KEY, remaining);
    } catch (error) {
        logger.error('Failed to mark asiento as synced', error as Error);
    }
}

export async function syncPendingAsientos(): Promise<{ success: boolean; synced: number; errors: any[] }> {
    const pending = await getUnsyncedAsientos();
    if (pending.length === 0) return { success: true, synced: 0, errors: [] };

    try {
        const response = await fetch('/api/cuaderno/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ asientos: pending })
        });

        const result = await response.json();

        if (result.success && result.data?.results) {
            const syncedUuids = result.data.results.filter((r: any) => r.status === 'success').map((r: any) => r.offline_uuid);

            for (const asiento of pending) {
                if (syncedUuids.includes(asiento.offline_uuid)) {
                    const resultItem = result.data.results.find((r: any) => r.offline_uuid === asiento.offline_uuid);
                    if (asiento.photos && asiento.photos.length > 0) {
                        for (const photo of asiento.photos) {
                            await fetch('/api/cuaderno/upload_photo', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    asiento_id: resultItem.odoo_id,
                                    file_name: photo.name,
                                    file_base64: photo.base64,
                                    mimetype: photo.mimetype
                                })
                            });
                        }
                    }
                    await markAsientoSynced(asiento.offline_uuid);
                }
            }

            return { success: true, synced: syncedUuids.length, errors: [] };
        }
        return { success: false, synced: 0, errors: [result.error] };
    } catch (error) {
        return { success: false, synced: 0, errors: [error] };
    }
}
