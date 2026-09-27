/** @jest-environment node */
const mockSesion = jest.fn();
jest.mock('@/lib/session', () => ({ getSessionFromRequest: (...a: unknown[]) => mockSesion(...a) }));

import { GET } from '@/app/api/auth/me/route';

const pedir = () => GET(new Request('http://x/api/auth/me'));

test('sin sesión: 401 y sin caché', async () => {
  mockSesion.mockResolvedValue(null);
  const r = await pedir();
  expect(r.status).toBe(401);
  expect(r.headers.get('cache-control')).toBe('no-store');
});

test('con sesión devuelve solo lo necesario: identidad, empresa activa y empresas disponibles (nunca la cuenta ni los ids de otras empresas)', async () => {
  mockSesion.mockResolvedValue({
    id: 42, email: 'ana@x.com', role: 'admin', name: 'Ana', empresa: 'akallpa', empresaNombre: 'Akallpa', cuenta: 'WAL00000007',
    vinculos: [
      { empresa: 'renasur', empresaNombre: 'Renasur', id: 7, role: 'employee', name: 'Ana' },
      { empresa: 'akallpa', empresaNombre: 'Akallpa', id: 42, role: 'admin', name: 'Ana' },
    ],
  });
  const cuerpo = await (await pedir()).json();
  expect(cuerpo.user).toEqual({
    id: 42, email: 'ana@x.com', role: 'admin', name: 'Ana', empresa: 'akallpa', empresaNombre: 'Akallpa',
    empresas: [{ id: 'renasur', nombre: 'Renasur' }, { id: 'akallpa', nombre: 'Akallpa' }],
  });
  expect(JSON.stringify(cuerpo)).not.toContain('WAL00000007');
});
