'use client';

import { useEffect, useState, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface AsientoDetalle {
  id: number;
  name: string;
  date: string;
  clima: string;
  state: string;
  personal: string;
  equipos: string;
  ocurrencias: string;
  observacion: string;
  location: {
    latitude: number | null;
    longitude: number | null;
    hasGPS: boolean;
  };
  residente: {
    id: number;
    name: string;
  } | null;
  supervisor: {
    id: number;
    name: string;
  } | null;
  cuaderno: {
    id: number;
    name: string;
  } | null;
  attachments: Array<{
    id: number;
    name: string;
    url: string;
    thumbnail?: string;
  }>;
  canApprove: boolean;
  canReject: boolean;
  createdAt: string;
}

export default function AsientoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [asiento, setAsiento] = useState<AsientoDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<number | null>(null);
  const viewStartTime = useRef<number>(Date.now());

  // Estados traducidos al español
  const stateLabels: Record<string, { label: string; color: string }> = {
    draft: { label: 'Borrador', color: 'bg-gray-500' },
    signed_residente: { label: 'Pendiente Aprobación', color: 'bg-yellow-500' },
    approved: { label: 'Aprobado', color: 'bg-green-500' },
    rejected: { label: 'Rechazado', color: 'bg-red-500' },
    resolved: { label: 'Observaciones Resueltas', color: 'bg-blue-500' },
  };

  const climaEmojis: Record<string, string> = {
    soleado: '☀️',
    nublado: '☁️',
    lluvioso: '🌧️',
    tormenta: '⛈️',
  };

  useEffect(() => {
    fetchAsiento();

    // Registrar audit log al desmontar componente
    return () => {
      const duration = (Date.now() - viewStartTime.current) / 1000;
      logAudit(duration);
    };
  }, [resolvedParams.id]);

  const fetchAsiento = async () => {
    try {
      setLoading(true);
      console.log('📋 Fetching asiento:', resolvedParams.id);
      
      const response = await fetch(`/api/cuaderno/detail/${resolvedParams.id}`);
      console.log('📥 Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Response error:', errorText);
        throw new Error('Error al cargar el asiento');
      }

      const data = await response.json();
      console.log('✅ Data received:', data);
      
      if (!data.success || !data.data) {
        throw new Error('Respuesta inválida del servidor');
      }
      
      setAsiento(data.data);
      console.log('✓ Asiento set in state');
    } catch (err: any) {
      console.error('💥 Error fetching asiento:', err);
      setError(err.message || 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  const logAudit = async (duration: number) => {
    try {
      // Registrar en audit log el tiempo de visualización
      await fetch('/api/audit/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'supervisor_viewed_detail',
          asiento_id: resolvedParams.id,
          duration_seconds: Math.round(duration),
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (err) {
      console.error('Error logging audit:', err);
    }
  };

  const handleAprobar = async () => {
    if (!confirm('¿Está seguro de aprobar este asiento?')) return;

    setSubmitting(true);
    try {
      const viewDuration = (Date.now() - viewStartTime.current) / 1000;
      
      const response = await fetch('/api/cuaderno/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asiento_id: parseInt(resolvedParams.id),
          view_duration_seconds: Math.round(viewDuration),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error al aprobar');
      }

      alert('✅ Asiento aprobado exitosamente');
      router.push('/');
      router.refresh();
    } catch (err: any) {
      alert(`❌ Error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRechazar = async () => {
    const motivo = prompt('Ingrese el motivo del rechazo:');
    if (!motivo || motivo.trim() === '') {
      alert('Debe ingresar un motivo para rechazar');
      return;
    }

    setSubmitting(true);
    try {
      const viewDuration = (Date.now() - viewStartTime.current) / 1000;

      const response = await fetch('/api/cuaderno/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asiento_id: parseInt(resolvedParams.id),
          motivo: motivo.trim(),
          view_duration_seconds: Math.round(viewDuration),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error al rechazar');
      }

      alert('✅ Asiento rechazado exitosamente');
      router.push('/');
      router.refresh();
    } catch (err: any) {
      alert(`❌ Error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-600 mb-4"></div>
          <p className="text-xl font-semibold text-gray-700">Cargando asiento...</p>
        </div>
      </div>
    );
  }

  if (error || !asiento) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-red-50 to-pink-100">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md">
          <div className="text-red-600 text-6xl mb-4 text-center">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2 text-center">Error</h1>
          <p className="text-gray-600 mb-6 text-center">{error || 'No se pudo cargar el asiento'}</p>
          <Link
            href="/"
            className="block w-full text-center bg-indigo-600 text-white py-3 px-4 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            ← Volver al dashboard
          </Link>
        </div>
      </div>
    );
  }

  const stateInfo = stateLabels[asiento.state] || { label: asiento.state, color: 'bg-gray-500' };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header fijo */}
      <header className="bg-white shadow-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link
                href="/"
                className="text-indigo-600 hover:text-indigo-800 font-medium flex items-center"
              >
                ← Volver
              </Link>
              <div className="h-6 w-px bg-gray-300"></div>
              <h1 className="text-2xl font-bold text-gray-900">{asiento.name}</h1>
            </div>
            <span className={`${stateInfo.color} text-white px-4 py-2 rounded-full text-sm font-semibold`}>
              {stateInfo.label}
            </span>
          </div>
        </div>
      </header>

      {/* Contenido principal */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-32">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Columna izquierda - Información principal */}
          <div className="lg:col-span-2 space-y-6">
            {/* Información general */}
            <section className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                📋 Información General
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold text-gray-600">Fecha</label>
                  <p className="text-lg text-gray-900">{asiento.date}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-600">Clima</label>
                  <p className="text-lg text-gray-900">
                    {climaEmojis[asiento.clima] || '🌤️'} {asiento.clima}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-600">Residente de Obra</label>
                  <p className="text-lg text-gray-900">{asiento.residente?.name || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-600">Cuaderno</label>
                  <p className="text-lg text-gray-900">{asiento.cuaderno?.name || 'N/A'}</p>
                </div>
              </div>
            </section>

            {/* Personal - COMPLETO */}
            <section className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                👷 Personal Utilizado
              </h2>
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <pre className="whitespace-pre-wrap text-gray-800 font-mono text-sm">
                  {asiento.personal || 'No especificado'}
                </pre>
              </div>
            </section>

            {/* Equipos - COMPLETO */}
            <section className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                🚜 Equipos Utilizados
              </h2>
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <pre className="whitespace-pre-wrap text-gray-800 font-mono text-sm">
                  {asiento.equipos || 'No especificado'}
                </pre>
              </div>
            </section>

            {/* Ocurrencias - COMPLETO */}
            <section className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                ⚠️ Ocurrencias del Día
              </h2>
              <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                <pre className="whitespace-pre-wrap text-gray-800 font-mono text-sm">
                  {asiento.ocurrencias || 'Sin ocurrencias reportadas'}
                </pre>
              </div>
            </section>

            {/* Observaciones */}
            {asiento.observacion && (
              <section className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                  💬 Observaciones
                </h2>
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <p className="text-gray-800 whitespace-pre-wrap">{asiento.observacion}</p>
                </div>
              </section>
            )}

            {/* Fotografías */}
            {asiento.attachments.length > 0 && (
              <section className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                  📸 Fotografías ({asiento.attachments.length})
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {asiento.attachments.map((photo) => (
                    <div
                      key={photo.id}
                      className="relative aspect-square rounded-lg overflow-hidden cursor-pointer hover:ring-4 hover:ring-indigo-300 transition-all"
                      onClick={() => setSelectedPhoto(photo.id)}
                    >
                      <img
                        src={photo.url}
                        alt={photo.name}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-2 truncate">
                        {photo.name}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Columna derecha - Información secundaria */}
          <div className="space-y-6">
            {/* Ubicación GPS */}
            <section className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                📍 Ubicación GPS
              </h2>
              {asiento.location.hasGPS ? (
                <div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                    <p className="text-sm font-semibold text-green-800 mb-2">✓ GPS Verificado</p>
                    <p className="text-xs text-gray-600">
                      Lat: {asiento.location.latitude?.toFixed(6)}
                    </p>
                    <p className="text-xs text-gray-600">
                      Lon: {asiento.location.longitude?.toFixed(6)}
                    </p>
                  </div>
                  {asiento.location.latitude && asiento.location.longitude && (
                    <a
                      href={`https://www.google.com/maps?q=${asiento.location.latitude},${asiento.location.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full text-center bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      Ver en Google Maps →
                    </a>
                  )}
                </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-yellow-800">⚠️ Sin GPS</p>
                  <p className="text-xs text-gray-600 mt-1">
                    Este asiento no tiene coordenadas GPS registradas
                  </p>
                </div>
              )}
            </section>

            {/* Metadatos */}
            <section className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">ℹ️ Metadatos</h2>
              <div className="space-y-3 text-sm">
                <div>
                  <label className="font-semibold text-gray-600">ID Asiento:</label>
                  <p className="text-gray-900">#{asiento.id}</p>
                </div>
                <div>
                  <label className="font-semibold text-gray-600">Creado:</label>
                  <p className="text-gray-900">
                    {new Date(asiento.createdAt).toLocaleString('es-PE')}
                  </p>
                </div>
                {asiento.supervisor && (
                  <div>
                    <label className="font-semibold text-gray-600">Supervisor:</label>
                    <p className="text-gray-900">{asiento.supervisor.name}</p>
                  </div>
                )}
              </div>
            </section>

            {/* Timeline de tiempo de revisión */}
            <section className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg shadow-md p-6 border-2 border-indigo-200">
              <h2 className="text-xl font-bold text-indigo-900 mb-2">⏱️ Tiempo de Revisión</h2>
              <p className="text-sm text-gray-600 mb-4">
                Este tiempo quedará registrado en el audit log
              </p>
              <div className="bg-white rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-indigo-600" id="review-timer">
                  {Math.floor((Date.now() - viewStartTime.current) / 1000)}s
                </p>
                <p className="text-xs text-gray-500 mt-1">Segundos en esta página</p>
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* Footer fijo con botones de acción */}
      {(asiento.canApprove || asiento.canReject) && asiento.state === 'signed_residente' && (
        <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-2xl">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-col sm:flex-row gap-4">
              {asiento.canReject && (
                <button
                  onClick={handleRechazar}
                  disabled={submitting}
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-bold py-4 px-6 rounded-lg transition-colors shadow-lg hover:shadow-xl flex items-center justify-center space-x-2"
                >
                  {submitting ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      <span>Procesando...</span>
                    </>
                  ) : (
                    <>
                      <span>❌</span>
                      <span>Rechazar Asiento</span>
                    </>
                  )}
                </button>
              )}
              {asiento.canApprove && (
                <button
                  onClick={handleAprobar}
                  disabled={submitting}
                  className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-4 px-6 rounded-lg transition-colors shadow-lg hover:shadow-xl flex items-center justify-center space-x-2"
                >
                  {submitting ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      <span>Procesando...</span>
                    </>
                  ) : (
                    <>
                      <span>✅</span>
                      <span>Aprobar Asiento</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </footer>
      )}

      {/* Modal de foto ampliada */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="relative max-w-6xl max-h-full">
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-4 right-4 bg-white rounded-full p-2 hover:bg-gray-200 transition-colors"
            >
              ✕
            </button>
            <img
              src={asiento.attachments.find((p) => p.id === selectedPhoto)?.url}
              alt="Foto ampliada"
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
            />
          </div>
        </div>
      )}

      {/* Timer actualización en tiempo real */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            setInterval(() => {
              const timer = document.getElementById('review-timer');
              if (timer) {
                const seconds = Math.floor((Date.now() - ${viewStartTime.current}) / 1000);
                timer.textContent = seconds + 's';
              }
            }, 1000);
          `,
        }}
      />
    </div>
  );
}
