import { redirect } from 'next/navigation';
import { getPending } from '@/lib/session';
import { vinculosDe } from '@/lib/auth/sesion';
import { ElegirEmpresa } from './ElegirEmpresa';

export const dynamic = 'force-dynamic';

/** Paso intermedio para quien es empleado en más de una empresa. Sin cookie pendiente no hay nada que elegir. */
export default async function ElegirEmpresaPage() {
  const pendiente = await getPending();
  const vinculos = vinculosDe(pendiente as Record<string, unknown> | null);
  if (vinculos.length === 0) redirect('/login');

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 dark:bg-black">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">¿En qué empresa marcas?</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Trabajas en más de una. Puedes cambiar después volviendo a entrar desde la billetera.
        </p>
        <ElegirEmpresa opciones={vinculos.map((v) => ({ empresa: v.empresa, nombre: v.empresaNombre }))} />
      </div>
    </main>
  );
}
