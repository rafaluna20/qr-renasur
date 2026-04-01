'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { saveAsientoOffline, syncPendingAsientos } from '@/lib/cuaderno/offline-storage';
import { getUnsyncedAsientos } from '@/lib/cuaderno/offline-storage';

function NuevoAsientoContent() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [clima, setClima] = useState('soleado');
    const [personal, setPersonal] = useState('');
    const [equipos, setEquipos] = useState('');
    const [ocurrencias, setOcurrencias] = useState('');
    const [gps, setGps] = useState({ latitude: 0, longitude: 0, accuracy: 0 });
    const [unsyncedCount, setUnsyncedCount] = useState(0);
    const [cuadernosList, setCuadernosList] = useState<{ id: number, name?: string, display_name?: string }[]>([]);
    const [loadingCuadernos, setLoadingCuadernos] = useState(true);
    const [cuadernoId, setCuadernoId] = useState('');
    const [isOnline, setIsOnline] = useState(true); // Assume true initially for SSR matched tree

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        // Init GPS
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => setGps({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }),
                (err) => console.error("GPS Error", err),
                { enableHighAccuracy: true }
            );
        }
        const loadUnsynced = async () => {
            const unsynced = await getUnsyncedAsientos();
            setUnsyncedCount(unsynced.length);
        };
        const loadCuadernos = async () => {
            try {
                const res = await fetch('/api/cuaderno/list-cuadernos');
                const data = await res.json();
                if (data.success && data.data?.cuadernos) {
                    setCuadernosList(data.data.cuadernos);
                    if (data.data.cuadernos.length > 0) {
                        setCuadernoId(String(data.data.cuadernos[0].id));
                    }
                }
            } catch (e) {
                console.error("Error fetching cuadernos", e);
            } finally {
                setLoadingCuadernos(false);
            }
        };
        loadUnsynced();
        loadCuadernos();

        setIsOnline(navigator.onLine);

        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const generateHash = async (text: string) => {
        const msgUint8 = new TextEncoder().encode(text);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const residenceId = localStorage.getItem('userID');
        const dateStr = new Date().toISOString().split('T')[0];
        
        const hashInput = `${dateStr}|${gps.latitude},${gps.longitude}|${ocurrencias}`;
        const securityHash = await generateHash(hashInput);

        const newAsiento = {
            offline_uuid: crypto.randomUUID(),
            cuaderno_id: cuadernoId,
            date: dateStr,
            clima,
            personal,
            equipos,
            ocurrencias,
            latitude: gps.latitude,
            longitude: gps.longitude,
            gps_accuracy: gps.accuracy,
            state: 'signed_residente',
            residente_id: residenceId || undefined,
            created_at: Date.now(),
            security_hash: securityHash
        };

        // Guardar local (Offline First)
        saveAsientoOffline(newAsiento);

        // Intentar Sync Inmediato de forma asincrona sin bloquear el UI (Fire and Forget)
        if (isOnline) {
            syncPendingAsientos().catch(console.error);
        }

        setLoading(false);
        alert('Guardado correctamente de forma local (se sincronizara en segundo plano).');
        router.push('/');
    };

    const handleSync = async () => {
        setLoading(true);
        const result = await syncPendingAsientos();
        setLoading(false);
        const remaining = await getUnsyncedAsientos();
        setUnsyncedCount(remaining.length);
        if (result.success) alert(`Sincronizados ${result.synced} asientos.`);
        else alert('Error en la sincronizacion.');
    };

    return (
        <div className="flex min-h-screen flex-col bg-zinc-50 p-4 font-sans dark:bg-zinc-950 md:items-center md:justify-center">
            <div className="w-full max-w-2xl overflow-hidden rounded-[40px] bg-white shadow-2xl dark:bg-zinc-900 dark:ring-1 dark:ring-white/10">
                <div className="p-8 md:p-10">
                    <div className="mb-8 flex items-start justify-between">
                        <div>
                            <button
                                onClick={() => router.push('/')}
                                className="mb-4 flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-white"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
                                Volver al Panel
                            </button>
                            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Nuevo Asiento</h1>
                            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Cuaderno de Obra Digital</p>
                        </div>
                        {unsyncedCount > 0 && (
                            <button
                                type="button"
                                onClick={handleSync}
                                className="flex items-center gap-2 rounded-full bg-amber-50 px-4 py-2 text-xs font-bold text-amber-600 transition-colors hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/40"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 21v-5h5" /></svg>
                                {unsyncedCount} PENDIENTES
                            </button>
                        )}
                    </div>

                    <form onSubmit={handleSave} className="space-y-8">
                        {/* Informacion Base */}
                        <div className="grid gap-6 rounded-[30px] border border-zinc-100 bg-zinc-50/50 p-6 dark:border-white/5 dark:bg-white/5">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                                    Cuaderno de Obra {loadingCuadernos && <span className="text-xs text-blue-500 ml-2">(Cargando de Odoo...)</span>}
                                </label>
                                <select
                                    value={cuadernoId}
                                    onChange={(e) => setCuadernoId(e.target.value)}
                                    disabled={loadingCuadernos || cuadernosList.length === 0}
                                    className="flex h-12 w-full appearance-none rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm transition-all focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-white dark:focus:ring-white"
                                    required
                                >
                                    {cuadernosList.length === 0 && !loadingCuadernos && (
                                        <option value="">No hay cuadernos disponibles</option>
                                    )}
                                    {cuadernosList.map(c => (
                                        <option key={c.id} value={String(c.id)}>
                                            {c.display_name || c.name || `Cuaderno #${c.id}`}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                                    Clima del Dia
                                </label>
                                <select
                                    value={clima}
                                    onChange={(e) => setClima(e.target.value)}
                                    className="flex h-12 w-full appearance-none rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm transition-all focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-white dark:focus:ring-white"
                                    required
                                >
                                    <option value="soleado">Soleado ☀️</option>
                                    <option value="nublado">Nublado ☁️</option>
                                    <option value="lluvia_ligera">Lluvia Ligera 🌦️</option>
                                    <option value="lluvia_fuerte">Lluvia Fuerte 🌧️</option>
                                </select>
                            </div>
                        </div>

                        {/* Resumen Personal y Equipos */}
                        <div className="grid gap-6 rounded-[30px] border border-zinc-100 bg-zinc-50/50 p-6 dark:border-white/5 dark:bg-white/5">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Resumen de Personal</label>
                                <input type="text" value={personal} onChange={(e) => setPersonal(e.target.value)} className="flex h-12 w-full rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm transition-all focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-white dark:focus:ring-white" placeholder="Ej. 1 Ing, 5 Peones..." required />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Resumen de Equipos/Maquinaria</label>
                                <input type="text" value={equipos} onChange={(e) => setEquipos(e.target.value)} className="flex h-12 w-full rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm transition-all focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-white dark:focus:ring-white" placeholder="Ej. 1 Excavadora operativa..." required />
                            </div>
                        </div>

                        {/* Ocurrencias */}
                        <div className="space-y-2 pt-2">
                            <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                                Ocurrencias y Trabajos
                            </label>
                            <textarea
                                value={ocurrencias}
                                onChange={(e) => setOcurrencias(e.target.value)}
                                className="flex min-h-[160px] w-full resize-none rounded-xl border border-zinc-200 bg-transparent p-4 text-sm transition-all focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-zinc-800 dark:focus:border-white dark:focus:ring-white"
                                placeholder="Describe el estado de la obra, personal, equipos, incidentes..."
                                required
                            />
                        </div>



                        {/* Status Footer */}
                        <div className="flex flex-col gap-2 rounded-2xl bg-blue-50/50 p-4 text-xs font-medium text-blue-700 dark:bg-blue-900/10 dark:text-blue-400 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-2">
                                <div className={`h-2 w-2 rounded-full ${gps.latitude ? 'bg-green-500' : 'bg-amber-500 animate-pulse'}`} />
                                GPS: {gps.latitude ? `${gps.latitude.toFixed(4)}, ${gps.longitude.toFixed(4)}` : 'Obteniendo ubicacion...'}
                            </div>
                            <div className="flex items-center gap-2">
                                <div className={`h-2 w-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
                                Estado: {isOnline ? 'Online' : 'Offline'}
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading || !gps.latitude}
                            className={`flex h-14 w-full items-center justify-center rounded-2xl text-base font-bold text-white transition-all 
                                ${loading || !gps.latitude
                                    ? 'bg-zinc-300 dark:bg-zinc-800 text-zinc-500 cursor-not-allowed'
                                    : 'bg-black hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200 shadow-xl'
                                }`}
                        >
                            {loading ? (
                                <div className="flex items-center gap-3">
                                    <svg className="h-5 w-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Guardando...
                                </div>
                            ) : (
                                'Registrar y Firmar'
                            )}
                        </button>
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
