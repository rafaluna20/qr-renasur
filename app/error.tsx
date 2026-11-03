'use client';

import { useEffect } from 'react';

/** Claves que la app guarda en el navegador (datos de la última sesión). */
const CLAVES_LOCALES = [
  'isAuthenticated', 'userRole', 'userID', 'userEmail', 'userName', 'userImage', 'empresaID',
  'proyectoID', 'tareaID', 'activeTasks', 'completedTasks',
];

/**
 * Pantalla de respaldo para cualquier página: en vez del mensaje genérico de Next («excepción del lado del cliente»)
 * muestra el motivo real, para poder diagnosticarlo desde un celular donde no hay consola. También permite limpiar los
 * datos viejos que la app dejó guardados en ese navegador (una causa típica de fallos que «solo ocurren en el móvil»).
 */
export default function ErrorGeneral({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Error de la aplicación:', error);
  }, [error]);

  const limpiarYReintentar = () => {
    try {
      CLAVES_LOCALES.forEach((k) => localStorage.removeItem(k));
    } catch {
      /* sin acceso al almacenamiento: se reintenta igual */
    }
    window.location.href = '/login';
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'system-ui, sans-serif', background: '#f9fafb' }}>
      <div style={{ maxWidth: 420, width: '100%', background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 10px 30px rgba(0,0,0,.1)' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, textAlign: 'center' }}>Algo salió mal</h1>
        <p style={{ fontSize: 14, color: '#4b5563', marginBottom: 8, textAlign: 'center' }}>
          Avisa a administración con este texto:
        </p>
        <p style={{ fontFamily: 'monospace', fontSize: 12, background: '#f3f4f6', borderRadius: 8, padding: 8, marginBottom: 16, wordBreak: 'break-word', textAlign: 'center' }}>
          {error?.message || 'Error desconocido'}
          {error?.digest ? ` (${error.digest})` : ''}
        </p>
        <button onClick={reset} style={{ width: '100%', padding: 12, borderRadius: 10, border: 0, background: '#111', color: '#fff', fontWeight: 600, marginBottom: 8 }}>
          Reintentar
        </button>
        <button onClick={limpiarYReintentar} style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid #d1d5db', background: '#fff', color: '#111', fontWeight: 600 }}>
          Borrar datos de este dispositivo y volver a entrar
        </button>
      </div>
    </div>
  );
}
