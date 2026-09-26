/** @jest-environment node */
import { puedeActuarSobre, reglaDeApi, rolPermitido } from '@/lib/auth/access-rules';

const cerrado = { registroAbierto: false };

describe('reglaDeApi', () => {
  test('solo entrar, salir, SSO y salud son públicas', () => {
    for (const ruta of ['/api/health', '/api/auth/login', '/api/auth/logout', '/api/auth/sso']) {
      expect(reglaDeApi(ruta, cerrado)).toEqual({ tipo: 'publica' });
    }
  });

  test('todo lo demás exige sesión, incluidas las rutas que antes estaban abiertas', () => {
    for (const ruta of [
      '/api/assistance', '/api/assistance/in', '/api/assistance/out', '/api/task', '/api/complete-task', '/api/audit/log',
      '/api/cuaderno/list', '/api/cuaderno/attachment/12', '/api/cuaderno/detail/3', '/api/cuaderno/sync', '/api/cuaderno/upload_photo',
    ]) {
      expect(reglaDeApi(ruta, cerrado)).toEqual({ tipo: 'sesion' });
    }
  });

  test('aprobar y rechazar asientos exigen supervisor o administrador', () => {
    for (const ruta of ['/api/cuaderno/approve', '/api/cuaderno/reject']) {
      expect(reglaDeApi(ruta, cerrado)).toEqual({ tipo: 'sesion', roles: ['supervisor', 'admin'] });
    }
  });

  test('la lista de empleados, el registro y el diagnóstico son solo de administrador', () => {
    for (const ruta of ['/api/users/login', '/api/users/register', '/api/users', '/api/diagnostic/gps-fields']) {
      expect(reglaDeApi(ruta, cerrado)).toEqual({ tipo: 'sesion', roles: ['admin'] });
    }
  });

  test('el auto-registro solo se abre a propósito y solo esa ruta', () => {
    expect(reglaDeApi('/api/users/register', { registroAbierto: true })).toEqual({ tipo: 'publica' });
    expect(reglaDeApi('/api/users/login', { registroAbierto: true })).toEqual({ tipo: 'sesion', roles: ['admin'] });
  });

  test('las rutas públicas se comparan exactas: un prefijo o pariente no las hereda', () => {
    for (const ruta of ['/api/health/x', '/api/auth/login/extra', '/api/auth/sso2', '/api/auth', '/api/authx/login']) {
      expect(reglaDeApi(ruta, cerrado).tipo).toBe('sesion');
    }
  });

  test('la barra final no abre nada', () => {
    expect(reglaDeApi('/api/cuaderno/approve/', cerrado)).toEqual({ tipo: 'sesion', roles: ['supervisor', 'admin'] });
    expect(reglaDeApi('/api/users/register/', cerrado)).toEqual({ tipo: 'sesion', roles: ['admin'] });
  });

  test('rutas con trucos (..) o mal codificadas nunca son públicas: piden administrador', () => {
    for (const ruta of ['/api/auth/login/../../users/login', '/api/health/%2e%2e/users', '/api/x%', '/api/a\\b', '/api/%00']) {
      expect(reglaDeApi(ruta, cerrado)).toEqual({ tipo: 'sesion', roles: ['admin'] });
    }
  });
});

describe('puedeActuarSobre', () => {
  test('uno mismo sí, otro empleado no', () => {
    expect(puedeActuarSobre({ id: 7, role: 'employee' }, 7)).toBe(true);
    expect(puedeActuarSobre({ id: 7, role: 'employee' }, 8)).toBe(false);
    expect(puedeActuarSobre({ id: 7, role: 'resident' }, 8)).toBe(false);
  });

  test('supervisor y administrador sí pueden', () => {
    expect(puedeActuarSobre({ id: 1, role: 'supervisor' }, 8)).toBe(true);
    expect(puedeActuarSobre({ id: 1, role: 'admin' }, 8)).toBe(true);
  });

  test('sin sesión, o con un id inválido, no', () => {
    expect(puedeActuarSobre(null, 7)).toBe(false);
    for (const id of [0, -3, Number.NaN]) expect(puedeActuarSobre({ id: 0, role: 'employee' }, id)).toBe(false);
  });

  test('el id de la sesión como texto también se compara bien', () => {
    expect(puedeActuarSobre({ id: '7' as unknown as number, role: 'employee' }, 7)).toBe(true);
  });
});

test('rolPermitido', () => {
  expect(rolPermitido('admin', undefined)).toBe(true);
  expect(rolPermitido('employee', ['supervisor', 'admin'])).toBe(false);
  expect(rolPermitido(undefined, ['admin'])).toBe(false);
  expect(rolPermitido('supervisor', ['supervisor', 'admin'])).toBe(true);
});
