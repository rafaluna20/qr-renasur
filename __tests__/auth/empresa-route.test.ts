/** @jest-environment node */
const mockGetPending = jest.fn();
const mockGetSession = jest.fn();
const mockSetSessionCookie = jest.fn();
const mockClearPendingCookie = jest.fn();
jest.mock('@/lib/session', () => ({
  getPending: (...a: unknown[]) => mockGetPending(...a),
  getSession: (...a: unknown[]) => mockGetSession(...a),
  setSessionCookie: (...a: unknown[]) => mockSetSessionCookie(...a),
  clearPendingCookie: (...a: unknown[]) => mockClearPendingCookie(...a),
}));
jest.mock('@/lib/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import { POST } from '@/app/api/auth/empresa/route';

const vinculos = [
  { empresa: 'renasur', empresaNombre: 'Renasur', id: 7, role: 'employee', name: 'Ana' },
  { empresa: 'akallpa', empresaNombre: 'Akallpa', id: 42, role: 'admin', name: 'Ana' },
];
const pendiente = { tipo: 'pendiente', email: 'ana@x.com', cuenta: 'WAL00000007', vinculos };
const pedir = (cuerpo: unknown) => POST(new Request('http://x/api/auth/empresa', { method: 'POST', body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) }));

beforeEach(() => { jest.clearAllMocks(); mockGetPending.mockResolvedValue(null); mockGetSession.mockResolvedValue(null); });

test('sin cookie pendiente ni sesión no hay nada que elegir (401)', async () => {
  expect((await pedir({ empresa: 'renasur' })).status).toBe(401);
  expect(mockSetSessionCookie).not.toHaveBeenCalled();
});

test('elegir una empresa de la lista abre la sesión con el id y el rol de ESA empresa', async () => {
  mockGetPending.mockResolvedValue(pendiente);
  const r = await pedir({ empresa: 'akallpa' });
  expect(r.status).toBe(200);
  expect(mockSetSessionCookie).toHaveBeenCalledWith(expect.objectContaining({ empresa: 'akallpa', id: 42, role: 'admin', cuenta: 'WAL00000007' }));
  expect(mockClearPendingCookie).toHaveBeenCalled();
});

test('una empresa que NO está en los vínculos firmados se rechaza (403), aunque exista en el sistema', async () => {
  mockGetPending.mockResolvedValue({ ...pendiente, vinculos: [vinculos[0]] });
  for (const malo of ['akallpa', 'otra', '', null, 5, { a: 1 }]) {
    expect((await pedir({ empresa: malo })).status).toBe(403);
  }
  expect(mockSetSessionCookie).not.toHaveBeenCalled();
});

test('cambiar de empresa con una sesión abierta también se limita a sus vínculos', async () => {
  mockGetSession.mockResolvedValue({ id: 7, role: 'employee', empresa: 'renasur', email: 'ana@x.com', cuenta: 'WAL00000007', vinculos });
  expect((await pedir({ empresa: 'akallpa' })).status).toBe(200);
  expect(mockSetSessionCookie).toHaveBeenCalledWith(expect.objectContaining({ empresa: 'akallpa', role: 'admin' }));
  mockGetSession.mockResolvedValue({ id: 7, role: 'employee', empresa: 'renasur', vinculos: [vinculos[0]] });
  expect((await pedir({ empresa: 'akallpa' })).status).toBe(403);
});

test('cuerpo ilegible = 400', async () => {
  mockGetPending.mockResolvedValue(pendiente);
  expect((await pedir('no es json')).status).toBe(400);
});
