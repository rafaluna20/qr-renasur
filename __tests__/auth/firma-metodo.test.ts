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
