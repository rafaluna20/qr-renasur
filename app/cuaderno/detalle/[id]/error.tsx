'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * Si la pantalla del asiento falla al dibujarse, se muestra esto (con el motivo) en vez de la página en blanco de
 * «excepción del lado del cliente». El motivo también queda en la consola del navegador.
 */
export default function ErrorDetalleAsiento({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Error en el detalle del asiento:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-red-50 to-pink-100 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-xl">
        <div className="mb-4 text-center text-6xl text-red-600">⚠️</div>
        <h1 className="mb-2 text-center text-2xl font-bold text-gray-800">No se pudo mostrar el asiento</h1>
        <p className="mb-2 text-center text-sm text-gray-600">
          Ocurrió un error al dibujar la pantalla. Avisa a administración con este texto:
        </p>
        <p className="mb-6 break-words rounded bg-gray-100 p-2 text-center font-mono text-xs text-gray-700">
          {error?.message || 'Error desconocido'}
          {error?.digest ? ` (${error.digest})` : ''}
        </p>
        <button
          onClick={reset}
          className="mb-3 block w-full rounded-lg bg-indigo-600 px-4 py-3 text-white transition-colors hover:bg-indigo-700"
        >
          Reintentar
        </button>
        <Link href="/" className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-center text-gray-700">
          ← Volver al dashboard
        </Link>
      </div>
    </div>
  );
}
