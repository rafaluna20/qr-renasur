/** @jest-environment node */
const mockGetSessionFromRequest = jest.fn();
jest.mock('@/lib/session', () => ({
  getSessionFromRequest: (...a: unknown[]) => mockGetSessionFromRequest(...a),
}));
jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('@/lib', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import { POST } from '@/app/api/complete-task/route';
import { MAX_INTENTOS_POR_CORREO, registrarIntento, reiniciarTodo } from '@/lib/auth/rate-limit';

const pedir = (cuerpo: unknown) =>
  POST(new Request('http://x/api/complete-task', { method: 'POST', body: JSON.stringify(cuerpo) }));
const valido = { id_proyecto: '5', id_tarea: '12', id_usuario: '7', descripcion: 'Vaciado', horas: '02:30', date: '2026-11-03T15:00:00Z' };

let fetchOriginal: typeof fetch;
beforeEach(() => {
  jest.clearAllMocks();
  fetchOriginal = global.fetch;
  global.fetch = jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
  mockGetSessionFromRequest.mockResolvedValue({ id: 7, role: 'employee', empresa: 'akallpa' });
});
afterEach(() => { global.fetch = fetchOriginal; });

describe('complete-task', () => {
  test('sin sesión: 401 y no se llama a n8n', async () => {
    mockGetSessionFromRequest.mockResolvedValue(null);
    expect((await pedir(valido)).status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('a n8n solo viajan los campos conocidos (no el cuerpo entero del navegador)', async () => {
    const r = await pedir({ ...valido, campo_raro: 'x', admin: true });
    expect(r.status).toBe(200);
    const enviado = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(Object.keys(enviado).sort()).toEqual(['date', 'descripcion', 'empresa', 'horas', 'id_proyecto', 'id_tarea', 'id_usuario']);
    expect(enviado.empresa).toBe('akallpa');
  });

  test('otro empleado: 403; supervisor sí puede', async () => {
    expect((await pedir({ ...valido, id_usuario: '8' })).status).toBe(403);
    mockGetSessionFromRequest.mockResolvedValue({ id: 1, role: 'supervisor' });
    expect((await pedir({ ...valido, id_usuario: '8' })).status).toBe(200);
  });

  test('datos inválidos: 400', async () => {
    for (const malo of [{ ...valido, horas: 'mucho' }, { ...valido, id_usuario: 'abc' }, { ...valido, id_tarea: '' }, { ...valido, descripcion: 'x'.repeat(2001) }]) {
      expect((await pedir(malo)).status).toBe(400);
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('si n8n falla: 500 sin detalles internos', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 502 });
    const r = await pedir(valido);
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toMatch(/502|n8n/);
  });
});

describe('límite por correo (sin importar la IP)', () => {
  beforeEach(() => reiniciarTodo());
  test('cambiar de IP no reinicia el conteo del correo', () => {
    for (let i = 0; i < MAX_INTENTOS_POR_CORREO; i++) {
      expect(registrarIntento('correo|a@x.com', 1000, MAX_INTENTOS_POR_CORREO).permitido).toBe(true);
    }
    expect(registrarIntento('correo|a@x.com', 1000, MAX_INTENTOS_POR_CORREO).permitido).toBe(false);
    expect(registrarIntento('correo|b@x.com', 1000, MAX_INTENTOS_POR_CORREO).permitido).toBe(true);
  });
});
