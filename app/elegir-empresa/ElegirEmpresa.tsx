'use client';

import { useState } from 'react';

export function ElegirEmpresa({ opciones }: { opciones: { empresa: string; nombre: string }[] }) {
  const [cargando, setCargando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function elegir(empresa: string) {
    setCargando(empresa);
    setError(null);
    try {
      const r = await fetch('/api/auth/empresa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa }),
      });
      if (r.ok) {
        window.location.assign('/');
        return;
      }
      setError(r.status === 401 ? 'Tu sesión venció. Vuelve a entrar desde la billetera.' : 'No se pudo abrir esa empresa.');
    } catch {
      setError('Sin conexión. Inténtalo de nuevo.');
    }
    setCargando(null);
  }

  return (
    <div className="mt-6 space-y-3">
      {opciones.map((o) => (
        <button
          key={o.empresa}
          type="button"
          disabled={cargando !== null}
          onClick={() => elegir(o.empresa)}
          className="flex h-14 w-full items-center justify-between rounded-xl border border-zinc-200 px-4 text-left text-base font-semibold text-zinc-900 transition-colors hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-900"
        >
          <span>{o.nombre}</span>
          <span className="text-xs font-normal text-zinc-400">{cargando === o.empresa ? 'Abriendo…' : 'Entrar'}</span>
        </button>
      ))}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
