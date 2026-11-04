/** @jest-environment node */
/**
 * Cada ruta de /api debe poder CARGARSE. Un error al importar (por ejemplo una libreria que falla en el servidor) no lo
 * ve ninguna otra prueba y en produccion devuelve un 500 en HTML: asi dejo de funcionar la sincronizacion de asientos.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Algunos modulos (lib/request-validator) crean un setInterval al importarse y dejarian a Jest sin terminar.
jest.spyOn(global, 'setInterval').mockImplementation((() => 0) as unknown as typeof setInterval);

const RAIZ = join(process.cwd(), 'app', 'api');

function rutas(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return rutas(ruta);
    return nombre === 'route.ts' ? [ruta] : [];
  });
}

const todas = rutas(RAIZ);

test('hay rutas que comprobar', () => {
  expect(todas.length).toBeGreaterThan(15);
});

test.each(todas.map((r) => [r.slice(RAIZ.length + 1).split(String.fromCharCode(92)).join('/'), r]))('carga %s', async (_nombre, ruta) => {
  const modulo = await import(ruta);
  const metodos = ['GET', 'POST', 'HEAD', 'PUT', 'DELETE', 'PATCH'].filter((m) => typeof (modulo as Record<string, unknown>)[m] === 'function');
  expect(metodos.length).toBeGreaterThan(0);
});

test('ninguna ruta arrastra jsdom ni dompurify (fallan al cargar en el servidor)', () => {
  const dependientes = Object.keys(require.cache).filter((k) => /node_modules[\/](jsdom|isomorphic-dompurify)[\/]/.test(k));
  expect(dependientes).toEqual([]);
});
