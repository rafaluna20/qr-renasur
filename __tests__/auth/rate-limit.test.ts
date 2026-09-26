/** @jest-environment node */
import { limpiarIntentos, MAX_INTENTOS, registrarIntento, reiniciarTodo, VENTANA_MS } from '@/lib/auth/rate-limit';

beforeEach(() => reiniciarTodo());

test('permite hasta el máximo y luego bloquea con el tiempo de espera', () => {
  for (let i = 0; i < MAX_INTENTOS; i++) expect(registrarIntento('ip|a@x.com', 1000).permitido).toBe(true);
  const bloqueo = registrarIntento('ip|a@x.com', 2000);
  expect(bloqueo.permitido).toBe(false);
  expect(bloqueo.reintentarEn).toBeGreaterThan(0);
  expect(bloqueo.reintentarEn).toBeLessThanOrEqual(VENTANA_MS / 1000);
});

test('cada IP y correo tiene su propia cuenta', () => {
  for (let i = 0; i < MAX_INTENTOS + 2; i++) registrarIntento('ip1|a@x.com', 1000);
  expect(registrarIntento('ip2|a@x.com', 1000).permitido).toBe(true);
  expect(registrarIntento('ip1|b@x.com', 1000).permitido).toBe(true);
});

test('pasada la ventana se reinicia', () => {
  for (let i = 0; i < MAX_INTENTOS + 1; i++) registrarIntento('k', 1000);
  expect(registrarIntento('k', 1000 + VENTANA_MS + 1).permitido).toBe(true);
});

test('un inicio de sesión correcto limpia el contador', () => {
  for (let i = 0; i < MAX_INTENTOS; i++) registrarIntento('k', 1000);
  limpiarIntentos('k');
  expect(registrarIntento('k', 1000).permitido).toBe(true);
});
