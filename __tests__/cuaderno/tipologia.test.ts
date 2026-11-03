/** @jest-environment node */
import {
  TIPOS, componerRedaccion, estadoPlazo, leerRedaccion, puedeEmitir, redaccionValida, requiereEstructura, tipoDe, tiposPermitidos,
} from '@/lib/cuaderno/tipologia';
import { tiposActivos } from '@/lib/cuaderno/config';

const seccion = (n: string) => `${n} con detalle suficiente`;
const r = { hecho: seccion('hecho'), causa: seccion('causa'), efecto: seccion('efecto'), solicitud: seccion('solicitud') };

describe('tipos y emisores (guía §2)', () => {
  test('claves únicas y todas las categorías A-D presentes', () => {
    expect(new Set(TIPOS.map((t) => t.clave)).size).toBe(TIPOS.length);
    expect(new Set(TIPOS.map((t) => t.categoria))).toEqual(new Set(['A', 'B', 'C', 'D']));
  });
  test('el residente emite informativos, consultas e hitos; no órdenes ni respuestas', () => {
    expect(puedeEmitir('resident', 'avance_diario')).toBe(true);
    expect(puedeEmitir('resident', 'consulta_tecnica')).toBe(true);
    expect(puedeEmitir('resident', 'ampliacion_plazo')).toBe(true);
    expect(puedeEmitir('resident', 'orden')).toBe(false);
    expect(puedeEmitir('resident', 'absolucion')).toBe(false);
  });
  test('el supervisor emite órdenes, respuestas e hitos; no consultas ni avance diario', () => {
    expect(puedeEmitir('supervisor', 'orden')).toBe(true);
    expect(puedeEmitir('supervisor', 'absolucion')).toBe(true);
    expect(puedeEmitir('supervisor', 'suspension_reinicio')).toBe(true);
    expect(puedeEmitir('supervisor', 'consulta_tecnica')).toBe(false);
    expect(puedeEmitir('supervisor', 'avance_diario')).toBe(false);
  });
  test('ambos pueden aclarar; un empleado común, un tipo inventado o sin rol: nada', () => {
    expect(puedeEmitir('resident', 'aclaracion')).toBe(true);
    expect(puedeEmitir('supervisor', 'aclaracion')).toBe(true);
    expect(puedeEmitir('employee', 'avance_diario')).toBe(false);
    expect(puedeEmitir('resident', 'inventado')).toBe(false);
    expect(puedeEmitir(undefined, 'avance_diario')).toBe(false);
    expect(tiposPermitidos('employee')).toEqual([]);
  });
  test('solo los asientos informativos son de redacción libre', () => {
    expect(requiereEstructura('avance_diario')).toBe(false);
    expect(requiereEstructura('aclaracion')).toBe(false);
    for (const c of ['consulta_tecnica', 'absolucion', 'orden', 'ampliacion_plazo', 'apertura_cierre']) {
      expect(requiereEstructura(c)).toBe(true);
    }
    expect(requiereEstructura('inventado')).toBe(false);
    expect(tipoDe('absolucion')?.requiereReferencia).toBe(true);
    expect(tipoDe('consulta_tecnica')?.requiereRespuesta).toBe(true);
  });
});

describe('redacción Hecho–Causa–Efecto–Solicitud', () => {
  test('compone y vuelve a leer las cuatro secciones', () => {
    const t = componerRedaccion(r);
    expect(t).toContain('HECHO:\n');
    expect(t).toContain('SOLICITUD / CONCLUSIÓN:\n');
    expect(leerRedaccion(t)).toEqual(r);
    expect(redaccionValida(t)).toEqual({ ok: true });
  });
  test('acepta saltos de línea de Windows', () => {
    expect(leerRedaccion(componerRedaccion(r).replace(/\n/g, '\r\n'))).toEqual(r);
  });
  test('rechaza texto libre, secciones vacías o muy cortas y secciones desmedidas', () => {
    expect(redaccionValida('Hoy se vació concreto').ok).toBe(false);
    expect(redaccionValida(componerRedaccion({ ...r, causa: '' })).ok).toBe(false);
    expect(redaccionValida(componerRedaccion({ ...r, efecto: 'corto' })).ok).toBe(false);
    expect(redaccionValida(componerRedaccion({ ...r, hecho: 'x'.repeat(1501) })).ok).toBe(false);
  });
});

describe('estado del plazo de respuesta', () => {
  const ahora = new Date('2026-11-03T12:00:00Z');
  test('solo aplica a consultas y solicitudes', () => {
    expect(estadoPlazo('avance_diario', '2026-11-01 00:00:00', false, ahora)).toBe('no_aplica');
    expect(estadoPlazo('orden', null, false, ahora)).toBe('no_aplica');
  });
  test('atendida tiene prioridad sobre el plazo', () => {
    expect(estadoPlazo('consulta_tecnica', '2026-11-01 00:00:00', true, ahora)).toBe('atendido');
  });
  test('en plazo, por vencer (< 24 h) y vencido', () => {
    expect(estadoPlazo('consulta_tecnica', '2026-11-06 12:00:00', false, ahora)).toBe('en_plazo');
    expect(estadoPlazo('consulta_tecnica', '2026-11-04 06:00:00', false, ahora)).toBe('por_vencer');
    expect(estadoPlazo('solicitud_adicional', '2026-11-03 11:59:00', false, ahora)).toBe('vencido');
  });
  test('sin plazo o con plazo ilegible: en plazo (no se inventa un vencimiento)', () => {
    expect(estadoPlazo('consulta_tecnica', null, false, ahora)).toBe('en_plazo');
    expect(estadoPlazo('consulta_tecnica', 'basura', false, ahora)).toBe('en_plazo');
  });
});

describe('interruptor de tipología por empresa', () => {
  const base = { nombre: 'X', url: 'https://x.test/jsonrpc', database: 'db', userId: 1, apiKey: 'k', obra: true, campoRol: 'x_obra_role', vinculoPorCorreo: false };
  const lista = [
    { id: 'renasur', ...base, cuadernoTipos: true },
    { id: 'akallpa', ...base, cuadernoTipos: false },
  ];
  test('cada empresa tiene su propio interruptor', () => {
    expect(tiposActivos('renasur', lista)).toBe(true);
    expect(tiposActivos('akallpa', lista)).toBe(false);
  });
  test('empresa desconocida, ausente o inválida con varias configuradas: apagado (no se adivina)', () => {
    expect(tiposActivos('otra', lista)).toBe(false);
    expect(tiposActivos(undefined, lista)).toBe(false);
    expect(tiposActivos(5, lista)).toBe(false);
  });
  test('con una sola empresa configurada y sin id, vale la única', () => {
    expect(tiposActivos(undefined, [lista[0]])).toBe(true);
    expect(tiposActivos(undefined, [lista[1]])).toBe(false);
  });
});

describe('lectura de cuadernoTipos en la configuración', () => {
  const { leerEmpresas } = require('@/lib/empresas');
  const json = (extra: object) => JSON.stringify([{ id: 'renasur', nombre: 'R', url: 'https://r.test/jsonrpc', database: 'd', userId: 1, apiKey: 'k', ...extra }]);
  test('por defecto sigue a la variable global; el valor de la empresa manda sobre ella', () => {
    expect(leerEmpresas({ EMPRESAS_JSON: json({}) })[0].cuadernoTipos).toBe(false);
    expect(leerEmpresas({ EMPRESAS_JSON: json({}), CUADERNO_TIPOS: 'true' })[0].cuadernoTipos).toBe(true);
    expect(leerEmpresas({ EMPRESAS_JSON: json({ cuadernoTipos: true }) })[0].cuadernoTipos).toBe(true);
    expect(leerEmpresas({ EMPRESAS_JSON: json({ cuadernoTipos: false }), CUADERNO_TIPOS: 'true' })[0].cuadernoTipos).toBe(false);
  });
});
