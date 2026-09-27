import type { Vinculo } from '../vinculos';

/** Lo que lleva la sesión firmada: quién es, en qué empresa está activa y en cuáles más puede entrar. */
export interface DatosSesion {
  id: number;
  email: string;
  role: string;
  name: string;
  empresa: string;
  empresaNombre: string;
  cuenta: string;
  vinculos: Vinculo[];
}

export function datosDeSesion(
  vinculo: Vinculo, todos: Vinculo[], identidad: { email: string; cuenta: string },
): DatosSesion {
  return {
    id: vinculo.id,
    email: identidad.email,
    role: vinculo.role,
    name: vinculo.name,
    empresa: vinculo.empresa,
    empresaNombre: vinculo.empresaNombre,
    cuenta: identidad.cuenta,
    vinculos: todos,
  };
}

/** Los vínculos que trae un token, ya limpios (nunca se confía en nada que no sea de la lista firmada). */
export function vinculosDe(payload: Record<string, unknown> | null): Vinculo[] {
  const lista = payload?.vinculos;
  if (!Array.isArray(lista)) return [];
  return lista.filter((v): v is Vinculo =>
    !!v && typeof v.empresa === 'string' && typeof v.id === 'number' && typeof v.role === 'string' && typeof v.name === 'string');
}

/** La empresa activa de una sesión (o undefined si no la trae: entonces solo vale con una única empresa configurada). */
export function empresaDeSesion(sesion: Record<string, unknown> | null): string | undefined {
  return typeof sesion?.empresa === 'string' ? sesion.empresa : undefined;
}
