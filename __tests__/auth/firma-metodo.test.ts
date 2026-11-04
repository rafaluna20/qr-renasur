/** @jest-environment node */
import { datosDeSesion } from '@/lib/auth/sesion';
import { leerEmpresas } from '@/lib/empresas';

const vinculo = { empresa: 'renasur', empresaNombre: 'Renasur', id: 7, role: 'resident' as const, name: 'Ana' };

describe('método de identificación en la sesión', () => {
  test('SSO queda como sso; todo lo demás (o nada) como dni', () => {
    expect(datosDeSesion(vinculo, [vinculo], { email: 'a@x.com', cuenta: 'WAL1', metodo: 'sso' }).metodo).toBe('sso');
    expect(datosDeSesion(vinculo, [vinculo], { email: 'a@x.com', cuenta: '', metodo: 'dni' }).metodo).toBe('dni');
    expect(datosDeSesion(vinculo, [vinculo], { email: 'a@x.com', cuenta: '' }).metodo).toBe('dni');
    expect(datosDeSesion(vinculo, [vinculo], { email: 'a@x.com', cuenta: '', metodo: 'raro' }).metodo).toBe('dni');
  });
});

describe('firmaSoloSso por empresa', () => {
  const json = (extra: object) => JSON.stringify([{ id: 'renasur', nombre: 'R', url: 'https://r.test/jsonrpc', database: 'd', userId: 1, apiKey: 'k', ...extra }]);
  test('apagado por defecto; solo true lo enciende', () => {
    expect(leerEmpresas({ EMPRESAS_JSON: json({}) })[0].firmaSoloSso).toBe(false);
    expect(leerEmpresas({ EMPRESAS_JSON: json({ firmaSoloSso: 'true' }) })[0].firmaSoloSso).toBe(false);
    expect(leerEmpresas({ EMPRESAS_JSON: json({ firmaSoloSso: true }) })[0].firmaSoloSso).toBe(true);
  });
});

describe('interruptores por lista de empresas (sin tocar EMPRESAS_JSON)', () => {
  const dos = JSON.stringify([
    { id: 'renasur', nombre: 'R', url: 'https://r.test/jsonrpc', database: 'd', userId: 1, apiKey: 'k' },
    { id: 'akallpa', nombre: 'A', url: 'https://a.test/jsonrpc', database: 'd', userId: 2, apiKey: 'k' },
  ]);
  const flags = (env: Record<string, string>) => leerEmpresas({ EMPRESAS_JSON: dos, ...env }).map((e) => [e.id, e.cuadernoTipos, e.firmaSoloSso]);

  test('solo la empresa de la lista se enciende', () => {
    expect(flags({ CUADERNO_TIPOS_EMPRESAS: 'renasur' })).toEqual([['renasur', true, false], ['akallpa', false, false]]);
    expect(flags({ CUADERNO_TIPOS_EMPRESAS: ' Renasur , otra ', FIRMA_SOLO_SSO_EMPRESAS: 'akallpa' })).toEqual([['renasur', true, false], ['akallpa', false, true]]);
  });
  test('sin variables, todo apagado; el interruptor global sigue valiendo', () => {
    expect(flags({})).toEqual([['renasur', false, false], ['akallpa', false, false]]);
    expect(flags({ CUADERNO_TIPOS: 'true' })).toEqual([['renasur', true, false], ['akallpa', true, false]]);
  });
  test('lo escrito en la entrada de la empresa manda sobre la lista', () => {
    const json = JSON.stringify([{ id: 'renasur', nombre: 'R', url: 'https://r.test/jsonrpc', database: 'd', userId: 1, apiKey: 'k', cuadernoTipos: false, firmaSoloSso: true }]);
    const e = leerEmpresas({ EMPRESAS_JSON: json, CUADERNO_TIPOS_EMPRESAS: 'renasur', FIRMA_SOLO_SSO_EMPRESAS: '' })[0];
    expect([e.cuadernoTipos, e.firmaSoloSso]).toEqual([false, true]);
  });
});
