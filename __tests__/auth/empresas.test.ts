/** @jest-environment node */
import { empresaDe, ErrorEmpresas, leerEmpresas } from '@/lib/empresas';
import { getOdooClient, resetOdooClient } from '@/lib/odoo-client';
import { buscarVinculos, type Vinculo } from '@/lib/vinculos';
import { datosDeSesion, empresaDeSesion, vinculosDe } from '@/lib/auth/sesion';
import { createSession, verifySession } from '@/lib/session';

const base = { nombre: 'X', url: 'https://odoo.example.com/jsonrpc', database: 'db', userId: 8, apiKey: 'k' };
const dos = JSON.stringify([
  { id: 'renasur', ...base, nombre: 'Renasur' },
  { id: 'akallpa', ...base, nombre: 'Akallpa', url: 'https://otro.example.com/jsonrpc', obra: false },
]);

describe('leerEmpresas', () => {
  test('sin EMPRESAS_JSON usa las variables ODOO_* de siempre como una única empresa', () => {
    const [e] = leerEmpresas({ ODOO_URL: 'https://o.example.com/jsonrpc/', ODOO_DATABASE: 'd', ODOO_USER_ID: '8', ODOO_API_KEY: 'k' });
    expect(e).toMatchObject({ id: 'principal', url: 'https://o.example.com/jsonrpc', userId: 8, obra: true });
    expect(leerEmpresas({})).toEqual([]);
  });

  test('lee varias empresas con sus capacidades', () => {
    const lista = leerEmpresas({ EMPRESAS_JSON: dos });
    expect(lista.map((e) => [e.id, e.obra, e.vinculoPorCorreo])).toEqual([['renasur', true, false], ['akallpa', false, false]]);
  });

  test('rechaza configuraciones peligrosas o rotas en vez de ignorarlas', () => {
    const malas = [
      'no es json', '[]', '{}',
      JSON.stringify([{ ...base, id: 'Mala Id' }]),
      JSON.stringify([{ ...base, id: 'a' }, { ...base, id: 'a' }].map((x) => ({ ...x, id: 'aa' }))),
      JSON.stringify([{ ...base, id: 'renasur', url: 'http://odoo.example.com/jsonrpc' }]),
      JSON.stringify([{ ...base, id: 'renasur', url: 'no-es-url' }]),
      JSON.stringify([{ ...base, id: 'renasur', apiKey: '' }]),
      JSON.stringify([{ ...base, id: 'renasur', userId: 'x' }]),
    ];
    for (const m of malas) expect(() => leerEmpresas({ EMPRESAS_JSON: m })).toThrow(ErrorEmpresas);
  });

  test('acepta http solo en localhost', () => {
    expect(() => leerEmpresas({ EMPRESAS_JSON: JSON.stringify([{ ...base, id: 'local', url: 'http://localhost:8069/jsonrpc' }]) })).not.toThrow();
  });
});

describe('empresaDe: la empresa nunca se adivina con varias', () => {
  const lista = leerEmpresas({ EMPRESAS_JSON: dos });
  test('con varias, sin empresa o con una desconocida, falla', () => {
    for (const malo of [undefined, null, '', 'otra', 'RENASUR', 5, {}]) expect(() => empresaDe(malo, lista)).toThrow(ErrorEmpresas);
    expect(empresaDe('akallpa', lista).id).toBe('akallpa');
  });
  test('con una sola, una sesión antigua sin empresa sigue valiendo', () => {
    expect(empresaDe(undefined, [lista[0]]).id).toBe('renasur');
  });
});

describe('cliente de Odoo por empresa', () => {
  const original = process.env.EMPRESAS_JSON;
  beforeEach(() => { process.env.EMPRESAS_JSON = dos; resetOdooClient(); });
  afterAll(() => { if (original === undefined) delete process.env.EMPRESAS_JSON; else process.env.EMPRESAS_JSON = original; resetOdooClient(); });

  test('cada empresa tiene su propio cliente y sin empresa NO se usa uno al azar', () => {
    expect(getOdooClient('renasur')).toBe(getOdooClient('renasur'));
    expect(getOdooClient('renasur')).not.toBe(getOdooClient('akallpa'));
    expect(() => getOdooClient()).toThrow(ErrorEmpresas);
    expect(() => getOdooClient('otra')).toThrow(ErrorEmpresas);
  });

  test('las llamadas van a la URL de SU empresa', async () => {
    const espia = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result: [] }) });
    (global as any).fetch = espia;
    await getOdooClient('akallpa').searchRead('hr.employee', [], ['id']);
    await getOdooClient('renasur').searchRead('hr.employee', [], ['id']);
    expect(espia.mock.calls.map((c) => c[0])).toEqual(['https://otro.example.com/jsonrpc', 'https://odoo.example.com/jsonrpc']);
  });
});

describe('buscarVinculos', () => {
  const lista = leerEmpresas({ EMPRESAS_JSON: JSON.stringify([
    { id: 'renasur', ...base, nombre: 'Renasur' },
    { id: 'akallpa', ...base, nombre: 'Akallpa', obra: false, vinculoPorCorreo: true },
  ]) });
  const identidad = { cuenta: 'wal00000007', email: 'Ana@Empresa.com' };
  const falso = (porEmpresa: Record<string, (dominio: any[]) => Promise<any[]>>) => (e: { id: string }) => ({
    searchRead: (_m: string, dominio: any[]) => porEmpresa[e.id](dominio),
  });

  test('una persona en dos empresas aparece vinculada en las dos, con ids distintos', async () => {
    const r = await buscarVinculos(identidad, lista, falso({
      renasur: async () => [{ id: 7, name: 'Ana', x_billetera_cuenta: 'WAL00000007', x_obra_role: 'supervisor' }],
      akallpa: async () => [{ id: 7, name: 'Ana T.', x_billetera_cuenta: 'WAL00000007' }],
    }));
    expect(r.vinculos.map((v) => [v.empresa, v.id, v.role])).toEqual([['renasur', 7, 'supervisor'], ['akallpa', 7, 'employee']]);
  });

  test('el vínculo por cuenta es exacto: una fila que no coincide no cuenta', async () => {
    const r = await buscarVinculos(identidad, [lista[0]], falso({ renasur: async () => [{ id: 9, name: 'Otra', x_billetera_cuenta: 'WAL00000099' }] }));
    expect(r.vinculos).toEqual([]);
  });

  test('sin campo x_obra_role en la empresa, el rol es siempre employee (aunque venga otro)', async () => {
    const r = await buscarVinculos(identidad, [lista[1]], falso({ akallpa: async () => [{ id: 3, name: 'A', x_billetera_cuenta: 'WAL00000007', x_obra_role: 'admin' }] }));
    expect(r.vinculos[0].role).toBe('employee');
  });

  test('sin vínculo por cuenta, el correo solo cuenta si la empresa lo permite y debe ser exacto y único', async () => {
    const sinCampo = () => Promise.reject(new Error("Invalid field 'x_billetera_cuenta' on model 'hr.employee'"));
    const porCorreo = async (d: any[]) => (d.some((c) => c[0] === 'work_email')
      ? [{ id: 5, name: 'Ana', work_email: 'ana@empresa.com' }, { id: 6, name: 'Pariente', work_email: 'anaXempresa.com' }]
      : sinCampo());
    const r = await buscarVinculos(identidad, lista, falso({ renasur: porCorreo, akallpa: porCorreo }));
    expect(r.vinculos.map((v) => v.empresa)).toEqual(['akallpa']); // renasur no permite vínculo por correo
    expect(r.problemas).toEqual([]);
  });

  test('dos empleados con el mismo correo o la misma cuenta = ambiguo, no se elige uno', async () => {
    const r = await buscarVinculos(identidad, [lista[0]], falso({ renasur: async () => [
      { id: 1, name: 'A', x_billetera_cuenta: 'WAL00000007' }, { id: 2, name: 'B', x_billetera_cuenta: 'WAL00000007' }] }));
    expect(r.vinculos).toEqual([]);
    expect(r.problemas).toEqual([{ empresa: 'renasur', motivo: 'ambiguo' }]);
  });

  test('una empresa caída no impide entrar a la otra', async () => {
    const r = await buscarVinculos(identidad, lista, falso({
      renasur: async () => { throw new Error('Failed to communicate with Odoo'); },
      akallpa: async () => [{ id: 3, name: 'Ana', x_billetera_cuenta: 'WAL00000007' }],
    }));
    expect(r.vinculos.map((v) => v.empresa)).toEqual(['akallpa']);
    expect(r.problemas).toEqual([{ empresa: 'renasur', motivo: 'red' }]);
  });
});

describe('sesión con empresa', () => {
  const vinculos: Vinculo[] = [
    { empresa: 'renasur', empresaNombre: 'Renasur', id: 7, role: 'employee', name: 'Ana' },
    { empresa: 'akallpa', empresaNombre: 'Akallpa', id: 7, role: 'admin', name: 'Ana' },
  ];

  test('la sesión lleva empresa y rol de ESA empresa', () => {
    const d = datosDeSesion(vinculos[1], vinculos, { email: 'a@x.com', cuenta: 'WAL1' });
    expect(d).toMatchObject({ empresa: 'akallpa', role: 'admin', id: 7 });
    expect(empresaDeSesion(d as any)).toBe('akallpa');
    expect(empresaDeSesion(null)).toBeUndefined();
    expect(empresaDeSesion({ empresa: 5 } as any)).toBeUndefined();
  });

  test('vinculosDe descarta basura', () => {
    expect(vinculosDe({ vinculos: [vinculos[0], { empresa: 1 }, null, 'x', { empresa: 'a', id: '3', role: 'r', name: 'n' }] })).toEqual([vinculos[0]]);
    expect(vinculosDe(null)).toEqual([]);
    expect(vinculosDe({ vinculos: 'no' })).toEqual([]);
  });

  test('un token pendiente NO sirve como sesión, y una sesión no sirve como pendiente', async () => {
    const pendiente = await createSession({ tipo: 'pendiente', vinculos }, '10m');
    const normal = await createSession({ id: 1, role: 'admin', empresa: 'akallpa' });
    expect(await verifySession(pendiente)).toBeNull();
    expect(await verifySession(pendiente, { pendiente: true })).not.toBeNull();
    expect(await verifySession(normal)).not.toBeNull();
    expect(await verifySession(normal, { pendiente: true })).toBeNull();
  });
});
