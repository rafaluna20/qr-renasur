'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { saveAsientoOffline, syncPendingAsientos } from '@/lib/cuaderno/offline-storage';
import { getUnsyncedAsientos } from '@/lib/cuaderno/offline-storage';
import { toast } from 'sonner';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface GpsState {
    latitude: number | null;
    longitude: number | null;
    accuracy: number | null;
    status: 'idle' | 'loading' | 'ok' | 'error';
    errorMsg?: string;
}

// ─── Componente principal ─────────────────────────────────────────────────────

function NuevoAsientoContent() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [clima, setClima] = useState('soleado');
    const [personal, setPersonal] = useState('');
    const [equipos, setEquipos] = useState('');
    const [ocurrencias, setOcurrencias] = useState('');
    const [unsyncedCount, setUnsyncedCount] = useState(0);
    const [cuadernosList, setCuadernosList] = useState<{ id: number; name?: string; display_name?: string }[]>([]);
    const [loadingCuadernos, setLoadingCuadernos] = useState(true);
    const [cuadernoId, setCuadernoId] = useState('');
    const [isOnline, setIsOnline] = useState(true);

    // GPS: estado completo con null cuando no disponible (evita falsy 0)
    const [gps, setGps] = useState<GpsState>({
        latitude: null,
        longitude: null,
        accuracy: null,
        status: 'idle',
    });

    const fileInputRef = useRef<HTMLInputElement>(null);

    // ─── Efectos ──────────────────────────────────────────────────────────────

    useEffect(() => {
        // GPS — intentar obtener ubicación pero NO bloquear el formulario
        setGps(prev => ({ ...prev, status: 'loading' }));
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    setGps({
                        latitude: pos.coords.latitude,
                        longitude: pos.coords.longitude,
                        accuracy: pos.coords.accuracy,
                        status: 'ok',
                    });
                },
                (err) => {
                    // GPS falló — el formulario sigue disponible, solo sin coordenadas
                    setGps({ latitude: null, longitude: null, accuracy: null, status: 'error', errorMsg: err.message });
                    console.warn('GPS no disponible:', err.message);
                },
                { enableHighAccuracy: true, timeout: 15000 }
            );
        } else {
            setGps({ latitude: null, longitude: null, accuracy: null, status: 'error', errorMsg: 'Geolocalización no soportada' });
        }

        // Asientos pendientes
        const loadUnsynced = async () => {
            const unsynced = await getUnsyncedAsientos();
            setUnsyncedCount(unsynced.length);
        };

        // Lista de cuadernos desde Odoo
        const loadCuadernos = async () => {
            try {
                const res = await fetch('/api/cuaderno/list-cuadernos');
                const data = await res.json();
                if (data.success && data.data?.cuadernos) {
                    setCuadernosList(data.data.cuadernos);
                    if (data.data.cuadernos.length > 0) {
                        setCuadernoId(String(data.data.cuadernos[0].id));
                    }
                } else {
                    toast.error('No se pudo cargar la lista de cuadernos desde Odoo.');
                }
            } catch (e) {
                console.error('Error cargando cuadernos:', e);
                toast.error('Error de conexión al cargar cuadernos.');
            } finally {
                setLoadingCuadernos(false);
            }
        };

        loadUnsynced();
        loadCuadernos();

        // Estado de conectividad
        setIsOnline(navigator.onLine);
        const handleOnline = () => {
            setIsOnline(true);
            toast.info('Conexión restaurada. Los asientos pendientes se sincronizarán.');
        };
        const handleOffline = () => {
            setIsOnline(false);
            toast.warning('Sin conexión. El asiento se guardará localmente.');
        };
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // ─── Utilidades ───────────────────────────────────────────────────────────

    const generateHash = async (text: string): Promise<string> => {
        const msgUint8 = new TextEncoder().encode(text);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    };

    // ─── Guardar asiento ──────────────────────────────────────────────────────

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!cuadernoId) {
            toast.error('Debe seleccionar un Cuaderno de Obra.');
            return;
        }

        setLoading(true);

        try {
            const residenceId = localStorage.getItem('userID');
            const dateStr = new Date().toISOString().split('T')[0];

            const hashInput = `${dateStr}|${gps.latitude ?? 0},${gps.longitude ?? 0}|${ocurrencias}`;
            const securityHash = await generateHash(hashInput);

            const newAsiento = {
                offline_uuid: crypto.randomUUID(),
                cuaderno_id: cuadernoId,
                date: dateStr,
                clima,
                personal,
                equipos,
                ocurrencias,
                // GPS es opcional: si no se obtuvo, se guarda 0 (Odoo acepta Float vacío)
                latitude: gps.latitude ?? 0,
                longitude: gps.longitude ?? 0,
                gps_accuracy: gps.accuracy ?? 0,
                state: 'signed_residente',
                residente_id: residenceId || undefined,
                created_at: Date.now(),
                security_hash: securityHash,
            };

            // 1. Guardar localmente primero (Offline-First)
            await saveAsientoOffline(newAsiento);

            // 2. Intentar sincronización inmediata SI hay conexión
            if (isOnline) {
                setSyncing(true);
                try {
                    const syncResult = await syncPendingAsientos();

                    if (syncResult.synced > 0 && syncResult.errors.length === 0) {
                        toast.success('✅ Asiento registrado y enviado a Odoo correctamente.');
                    } else if (syncResult.synced > 0 && syncResult.partials > 0) {
                        toast.warning('⚠️ Asiento creado en Odoo pero sin firmar. Contacte al administrador.');
                    } else if (syncResult.errors.length > 0) {
                        // Guardado local OK, pero Odoo rechazó — mostrar error concreto
                        const errorMsg = syncResult.errors[0]?.message || 'Error desconocido';
                        toast.error(`Guardado local ✓ — Error Odoo: ${errorMsg}`, { duration: 8000 });
                        // Incrementar el contador de pendientes para que el usuario sepa
                        setUnsyncedCount(await getUnsyncedAsientos().then(l => l.length));
                        setLoading(false);
                        setSyncing(false);
                        return; // No navegar, dejar al usuario ver el error
                    } else {
                        toast.success('Asiento guardado y sincronizado.');
                    }
                } catch (syncErr: any) {
                    toast.warning(`Guardado local ✓ — Sin conexión con Odoo: ${syncErr?.message || 'Error de red'}`);
                } finally {
                    setSyncing(false);
                }
            } else {
                // Sin internet: guardado offline confirmado
                toast.info('📴 Sin conexión. Asiento guardado localmente. Se enviará cuando recuperes internet.');
                const remaining = await getUnsyncedAsientos();
                setUnsyncedCount(remaining.length);
            }

            router.push('/');

        } catch (err: any) {
            console.error('Error guardando asiento:', err);
            toast.error(`Error al guardar: ${err?.message || 'Error desconocido'}`);
        } finally {
            setLoading(false);
            setSyncing(false);
        }
    };

    // ─── Sync manual ──────────────────────────────────────────────────────────

    const handleSync = async () => {
        setSyncing(true);
        const toastId = toast.loading('Sincronizando con Odoo...');
        try {
            const result = await syncPendingAsientos();
            const remaining = await getUnsyncedAsientos();
            setUnsyncedCount(remaining.length);

            if (result.synced > 0 && result.errors.length === 0) {
                toast.success(`✅ ${result.synced} asiento(s) sincronizados con Odoo.`, { id: toastId });
            } else if (result.errors.length > 0) {
                const errorDetail = result.errors.map(e => e.message).join('; ');
                toast.error(`Error: ${errorDetail}`, { id: toastId, duration: 8000 });
            } else {
                toast.info('No hay asientos pendientes.', { id: toastId });
            }
        } catch (err: any) {
            toast.error(`Error de sincronización: ${err?.message}`, { id: toastId });
        } finally {
            setSyncing(false);
        }
    };

    // ─── Renderizado ──────────────────────────────────────────────────────────

    const isSubmitting = loading || syncing;

    return (
        <div className="flex min-h-screen flex-col bg-zinc-50 p-4 font-sans dark:bg-zinc-950 md:items-center md:justify-center">
            <div className="w-full max-w-2xl overflow-hidden rounded-[40px] bg-white shadow-2xl dark:bg-zinc-900 dark:ring-1 dark:ring-white/10">
                <div className="p-8 md:p-10">
                    {/* Header */}
                    <div className="mb-8 flex items-start justify-between">
                        <div>
                            <button
                                type="button"
                                onClick={() => router.push('/')}
                                className="mb-4 flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-white"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
                                Volver al Panel
                            </button>
                            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Nuevo Asiento</h1>
                            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Cuaderno de Obra Digital</p>
                        </div>

                        {/* Botón sync manual — visible cuando hay pendientes */}
                        {unsyncedCount > 0 && (
                            <button
                                type="button"
                                onClick={handleSync}
                                disabled={syncing || !isOnline}
                                className="flex items-center gap-2 rounded-full bg-amber-50 px-4 py-2 text-xs font-bold text-amber-600 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/40"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={syncing ? 'animate-spin' : ''}><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 21v-5h5" /></svg>
                                {syncing ? 'SINCRONIZANDO...' : `${unsyncedCount} PENDIENTES`}
                            </button>
                        )}
                    </div>

                    <form onSubmit={handleSave} className="space-y-8">
                        {/* Información Base */}
                        <div className="grid gap-6 rounded-[30px] border border-zinc-100 bg-zinc-50/50 p-6 dark:border-white/5 dark:bg-white/5">
                            {/* Cuaderno */}
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                                    Cuaderno de Obra
                                    {loadingCuadernos && <span className="ml-2 text-xs text-blue-500">Cargando desde Odoo...</span>}
                                </label>
                                <select
                                    value={cuadernoId}
                                    onChange={(e) => setCuadernoId(e.target.value)}
                                    disabled={loadingCuadernos || cuadernosList.length === 0}
                                    required
                                    className="flex h-12 w-full appearance-none rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm transition-all focus:border-black focus:outline-none focus:ring-1 focus:ring-black disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-white dark:focus:ring-white"
                                >
                                    {cuadernosList.length === 0 && !loadingCuadernos && (
                                        <option value="">⚠️ Sin cuadernos disponibles en Odoo</option>
                                    )}
                                    {cuadernosList.map(c => (
                                        <option key={c.id} value={String(c.id)}>
                                            {c.display_name || c.name || `Cuaderno #${c.id}`}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Clima */}
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Clima del Día</label>
                                <select
                                    value={clima}
                                    onChange={(e) => setClima(e.target.value)}
                                    required
                                    className="flex h-12 w-full appearance-none rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm transition-all focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-white dark:focus:ring-white"
                                >
                                    <option value="soleado">Soleado ☀️</option>
                                    <option value="nublado">Nublado ☁️</option>
                                    <option value="lluvia_ligera">Lluvia Ligera 🌦️</option>
                                    <option value="lluvia_fuerte">Lluvia Fuerte 🌧️</option>
                                </select>
                            </div>
                        </div>

                        {/* Personal y Equipos */}
                        <div className="grid gap-6 rounded-[30px] border border-zinc-100 bg-zinc-50/50 p-6 dark:border-white/5 dark:bg-white/5">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Resumen de Personal</label>
                                <input
                                    type="text"
                                    value={personal}
                                    onChange={(e) => setPersonal(e.target.value)}
                                    required
                                    placeholder="Ej. 1 Ing. Residente, 5 Peones, 2 Oficiales..."
                                    className="flex h-12 w-full rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm transition-all focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-white dark:focus:ring-white"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Resumen de Equipos / Maquinaria</label>
                                <input
                                    type="text"
                                    value={equipos}
                                    onChange={(e) => setEquipos(e.target.value)}
                                    required
                                    placeholder="Ej. 1 Excavadora operativa, 2 Volquetes..."
                                    className="flex h-12 w-full rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm transition-all focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-white dark:focus:ring-white"
                                />
                            </div>
                        </div>

                        {/* Ocurrencias */}
                        <div className="space-y-2 pt-2">
                            <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                                Ocurrencias y Trabajos del Día
                            </label>
                            <textarea
                                value={ocurrencias}
                                onChange={(e) => setOcurrencias(e.target.value)}
                                required
                                placeholder="Describe el estado de la obra, trabajos realizados, incidentes, materiales recibidos..."
                                className="flex min-h-[160px] w-full resize-none rounded-xl border border-zinc-200 bg-transparent p-4 text-sm transition-all focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-zinc-800 dark:focus:border-white dark:focus:ring-white"
                            />
                        </div>

                        {/* Status Bar — GPS + Conectividad */}
                        <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4 dark:border-white/5 dark:bg-white/5">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                {/* GPS Status */}
                                <div className="flex items-center gap-2 text-xs font-medium">
                                    {gps.status === 'loading' && (
                                        <>
                                            <div className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
                                            <span className="text-zinc-500">Obteniendo GPS...</span>
                                        </>
                                    )}
                                    {gps.status === 'ok' && (
                                        <>
                                            <div className="h-2 w-2 rounded-full bg-green-500" />
                                            <span className="text-green-700 dark:text-green-400">
                                                GPS: {gps.latitude!.toFixed(5)}, {gps.longitude!.toFixed(5)}
                                                {gps.accuracy && <span className="ml-1 text-zinc-400">(±{Math.round(gps.accuracy)}m)</span>}
                                            </span>
                                        </>
                                    )}
                                    {gps.status === 'error' && (
                                        <>
                                            <div className="h-2 w-2 rounded-full bg-red-400" />
                                            <span className="text-red-500 dark:text-red-400">Sin GPS — el asiento se guardará sin coordenadas</span>
                                        </>
                                    )}
                                    {gps.status === 'idle' && (
                                        <>
                                            <div className="h-2 w-2 rounded-full bg-zinc-400" />
                                            <span className="text-zinc-400">GPS no iniciado</span>
                                        </>
                                    )}
                                </div>

                                {/* Conectividad */}
                                <div className="flex items-center gap-2 text-xs font-medium">
                                    <div className={`h-2 w-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
                                    <span className={isOnline ? 'text-green-700 dark:text-green-400' : 'text-red-500'}>
                                        {isOnline ? 'Online — se enviará a Odoo' : 'Offline — se guardará localmente'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Botón Submit — NUNCA bloqueado por GPS */}
                        <button
                            type="submit"
                            disabled={isSubmitting || loadingCuadernos || cuadernosList.length === 0}
                            className={`flex h-14 w-full items-center justify-center rounded-2xl text-base font-bold text-white transition-all 
                                ${isSubmitting || loadingCuadernos || cuadernosList.length === 0
                                    ? 'cursor-not-allowed bg-zinc-300 text-zinc-500 dark:bg-zinc-800'
                                    : 'bg-black shadow-xl hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200'
                                }`}
                        >
                            {syncing ? (
                                <div className="flex items-center gap-3">
                                    <svg className="h-5 w-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Enviando a Odoo...
                                </div>
                            ) : loading ? (
                                <div className="flex items-center gap-3">
                                    <svg className="h-5 w-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Guardando...
                                </div>
                            ) : (
                                'Registrar y Firmar'
                            )}
                        </button>

                        {/* Aviso GPS (NO bloquea, solo informa) */}
                        {gps.status === 'error' && (
                            <p className="text-center text-xs text-zinc-400">
                                ℹ️ Sin GPS disponible — puedes guardar el asiento igualmente. Las coordenadas quedarán en 0.
                            </p>
                        )}
                    </form>
                </div>
            </div>
        </div>
    );
}

export default function NuevoAsientoPage() {
    return (
        <Suspense fallback={
            <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-black dark:border-zinc-800 dark:border-t-white" />
            </div>
        }>
            <NuevoAsientoContent />
        </Suspense>
    );
}
