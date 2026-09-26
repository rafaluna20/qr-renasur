/** @jest-environment node */
import { canjearCodigo, configSso, firmar, RE_CODIGO } from '@/lib/sso';

const CONFIG = { url: 'https://banco.example.com', app: 'asistencia', secreto: 'secreto-de-prueba-compartido' };
const CODIGO = 'A'.repeat(43);
const respuesta = (cuerpo: unknown, ok = true) => ({ ok, json: async () => cuerpo }) as Response;
const usuario = { email: 'ana@empresa.com', name: 'Ana', account: 'WAL00000001', email_verified: true };
const comoFetch = (f: unknown) => f as unknown as typeof fetch;

test('la firma coincide con el vector compartido con el banco y las demás plataformas', () => {
  const cuerpo = '{"jsonrpc":"2.0","method":"call","params":{"account_number":"WAL00000001"}}';
  expect(firmar('secreto-de-prueba-compartido', 1790000000, '/api/inv/banco/resumen', cuerpo)).toBe(
    'f3ded845a6ea19e6794b8e1a9514c1d3b39e7ecdededec9038ed2a805bd7dbd9'
  );
});

describe('configSso', () => {
  test('exige URL, aplicación y secreto', () => {
    expect(configSso({ WALLET_URL: 'https://b.example.com/', WALLET_SSO_APP: 'asistencia', WALLET_SSO_SECRET: 's' })).toEqual({
      url: 'https://b.example.com', app: 'asistencia', secreto: 's', db: undefined,
    });
    expect(configSso({ WALLET_URL: 'https://b', WALLET_SSO_APP: 'a' })).toBeNull();
    expect(configSso({})).toBeNull();
  });
});

describe('canjearCodigo', () => {
  test('canjea con firma válida en la ruta y con el cuerpo exactos', async () => {
    const fetchFalso = jest.fn().mockResolvedValue(respuesta({ result: { success: true, user: usuario } }));
    const r = await canjearCodigo(CODIGO, CONFIG, comoFetch(fetchFalso), () => 1790000000_000);
    expect(r).toEqual({ ok: true, usuario: { email: 'ana@empresa.com', nombre: 'Ana', cuenta: 'WAL00000001' } });
    const [url, opciones] = fetchFalso.mock.calls[0];
    expect(url).toBe('https://banco.example.com/api/wallet/sso/exchange');
    expect(JSON.parse(opciones.body).params).toEqual({ code: CODIGO });
    expect(opciones.headers['x-wallet-platform']).toBe('asistencia');
    expect(opciones.headers['x-wallet-signature']).toBe(firmar('secreto-de-prueba-compartido', 1790000000, '/api/wallet/sso/exchange', opciones.body));
  });

  test('agrega la base de datos cuando se configura', async () => {
    const fetchFalso = jest.fn().mockResolvedValue(respuesta({ result: { success: true, user: usuario } }));
    await canjearCodigo(CODIGO, { ...CONFIG, db: 'mi base' }, comoFetch(fetchFalso));
    expect(fetchFalso.mock.calls[0][0]).toBe('https://banco.example.com/api/wallet/sso/exchange?db=mi%20base');
  });

  test('un correo NO verificado, o sin correo, se rechaza', async () => {
    for (const u of [{ ...usuario, email_verified: false }, { ...usuario, email_verified: undefined }, { ...usuario, email: '' }, { ...usuario, email: undefined }]) {
      const r = await canjearCodigo(CODIGO, CONFIG, comoFetch(jest.fn().mockResolvedValue(respuesta({ result: { success: true, user: u } }))));
      expect(r).toEqual({ ok: false, motivo: 'codigo' });
    }
  });

  test('un código rechazado por el banco (vencido, usado, ajeno) es «codigo»', async () => {
    const r = await canjearCodigo(CODIGO, CONFIG, comoFetch(jest.fn().mockResolvedValue(respuesta({ result: { success: false, code: 'codigo_invalido' } }))));
    expect(r).toEqual({ ok: false, motivo: 'codigo' });
  });

  test('fallas de red o HTTP son «red» y no lanzan', async () => {
    expect(await canjearCodigo(CODIGO, CONFIG, comoFetch(jest.fn().mockRejectedValue(new Error('caída'))))).toEqual({ ok: false, motivo: 'red' });
    expect(await canjearCodigo(CODIGO, CONFIG, comoFetch(jest.fn().mockResolvedValue(respuesta({}, false))))).toEqual({ ok: false, motivo: 'red' });
    const ilegible = { ok: true, json: async () => { throw new Error('no es json'); } };
    expect(await canjearCodigo(CODIGO, CONFIG, comoFetch(jest.fn().mockResolvedValue(ilegible)))).toEqual({ ok: false, motivo: 'red' });
  });

  test('sin configuración o con un código de formato raro no llama al banco', async () => {
    const fetchFalso = jest.fn();
    expect(await canjearCodigo(CODIGO, null, comoFetch(fetchFalso))).toEqual({ ok: false, motivo: 'configuracion' });
    for (const malo of ['', 'corto', 'x'.repeat(101), 'con espacios y simbolos ' + 'a'.repeat(20), '../../etc/passwd' + 'a'.repeat(20)]) {
      expect(await canjearCodigo(malo, CONFIG, comoFetch(fetchFalso))).toEqual({ ok: false, motivo: 'codigo' });
    }
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  test('RE_CODIGO acepta el formato token_urlsafe del banco', () => {
    expect(RE_CODIGO.test(CODIGO)).toBe(true);
    expect(RE_CODIGO.test('abc-_DEF123456789012345678')).toBe(true);
  });
});
