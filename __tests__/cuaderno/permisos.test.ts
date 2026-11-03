/** @jest-environment node */
import {
  bytesDeBase64,
  detectarTipoImagen,
  nombreSeguroDeFoto,
  puedeAnotar,
  puedeTrabajarAsiento,
} from '@/lib/cuaderno/permisos';
import { fechaRazonable, validarAsientoSync } from '@/lib/validation/asiento-sync';

const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
const HTML = new TextEncoder().encode('<html><script>alert(1)</script></html>');

describe('puedeTrabajarAsiento', () => {
  test('el residente ve su asiento y no el de otro', () => {
    expect(puedeTrabajarAsiento({ id: 7, role: 'employee' }, 7)).toBe(true);
    expect(puedeTrabajarAsiento({ id: '7', role: 'resident' }, 7)).toBe(true);
    expect(puedeTrabajarAsiento({ id: 7, role: 'employee' }, 8)).toBe(false);
  });
  test('supervisor y administrador ven todos', () => {
    expect(puedeTrabajarAsiento({ id: 1, role: 'supervisor' }, 99)).toBe(true);
    expect(puedeTrabajarAsiento({ id: 1, role: 'admin' }, null)).toBe(true);
  });
  test('sin sesión, sin residente o con id inválido: no', () => {
    expect(puedeTrabajarAsiento(null, 7)).toBe(false);
    expect(puedeTrabajarAsiento({ id: 7, role: 'employee' }, null)).toBe(false);
    expect(puedeTrabajarAsiento({ id: 0, role: 'employee' }, 0)).toBe(false);
    expect(puedeTrabajarAsiento({ id: 'x', role: 'employee' }, NaN)).toBe(false);
  });
  test('solo anotan residente, supervisor y administrador (un empleado común no)', () => {
    expect(puedeAnotar({ id: 1, role: 'resident' })).toBe(true);
    expect(puedeAnotar({ id: 1, role: 'supervisor' })).toBe(true);
    expect(puedeAnotar({ id: 1, role: 'admin' })).toBe(true);
    expect(puedeAnotar({ id: 1, role: 'employee' })).toBe(false);
    expect(puedeAnotar({ id: 1, role: undefined })).toBe(false);
    expect(puedeAnotar(null)).toBe(false);
  });
});

describe('fotos', () => {
  test('el tipo sale de los bytes, no de lo declarado', () => {
    expect(detectarTipoImagen(JPG)).toBe('image/jpeg');
    expect(detectarTipoImagen(PNG)).toBe('image/png');
    expect(detectarTipoImagen(WEBP)).toBe('image/webp');
    expect(detectarTipoImagen(HTML)).toBeNull();
    expect(detectarTipoImagen(new Uint8Array())).toBeNull();
  });
  test('nombre seguro: sin rutas, con la extensión del tipo real', () => {
    expect(nombreSeguroDeFoto('../../etc/pass wd.html', 'image/jpeg')).toBe('pass wd.jpg');
    expect(nombreSeguroDeFoto('', 'image/png')).toBe('foto_obra.png');
    expect(nombreSeguroDeFoto('a<b>c.svg', 'image/webp')).toBe('a_b_c.webp');
  });
  test('bytes de un base64 sin decodificarlo', () => {
    expect(bytesDeBase64(Buffer.from(JPG).toString('base64'))).toBe(JPG.length);
    expect(bytesDeBase64(Buffer.from('ab').toString('base64'))).toBe(2);
  });
});

describe('validarAsientoSync', () => {
  const hoy = new Date('2026-11-03T15:00:00Z');
  const base = { cuaderno_id: '12', date: '2026-11-03', clima: 'nublado', personal: '3 operarios', equipos: '', ocurrencias: 'Vaciado de zapatas', state: 'signed_residente' };

  test('acepta lo que manda el formulario (textos cortos, cuaderno como texto, GPS en 0)', () => {
    const r = validarAsientoSync({ ...base, latitude: 0, longitude: 0, gps_accuracy: 0 }, hoy);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.asiento.cuaderno_id).toBe(12);
  });
  test('la fecha en UTC de las 19:00 Lima (día siguiente) no se rechaza', () => {
    expect(validarAsientoSync({ ...base, date: '2026-11-04' }, hoy).ok).toBe(true);
  });
  test('rechaza fecha lejana, mal formada o imposible', () => {
    expect(fechaRazonable('2026-12-25', hoy)).toBe(false);
    expect(fechaRazonable('2019-12-31', hoy)).toBe(false);
    expect(fechaRazonable('2026-02-31', hoy)).toBe(false);
    expect(validarAsientoSync({ ...base, date: 'hoy' }, hoy).ok).toBe(false);
  });
  test('rechaza clima, estado y GPS fuera de lo permitido', () => {
    expect(validarAsientoSync({ ...base, clima: 'nevada' }, hoy).ok).toBe(false);
    expect(validarAsientoSync({ ...base, state: 'approved' }, hoy).ok).toBe(false);
    expect(validarAsientoSync({ ...base, latitude: 200 }, hoy).ok).toBe(false);
    expect(validarAsientoSync({ ...base, cuaderno_id: '-1' }, hoy).ok).toBe(false);
  });
  test('rechaza textos desmedidos', () => {
    expect(validarAsientoSync({ ...base, ocurrencias: 'x'.repeat(5001) }, hoy).ok).toBe(false);
  });
});
