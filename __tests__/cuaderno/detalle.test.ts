/** @jest-environment node */
import { fechaLegible, normalizarAsiento } from '@/lib/cuaderno/detalle';

describe('normalizarAsiento', () => {
  test('un asiento normal pasa igual', () => {
    const a = normalizarAsiento({
      id: 5, name: 'Asiento 5', date: '2026-11-03', clima: 'soleado', state: 'signed_residente',
      personal: '3 operarios', equipos: 'mezcladora', ocurrencias: 'Vaciado', observacion: '',
      location: { latitude: -12.19, longitude: -76.97, hasGPS: true },
      residente: { id: 7, name: 'Ana' }, supervisor: null, cuaderno: { id: 1, name: 'Obra A' },
      attachments: [{ id: 9, name: 'f.jpg', url: '/api/cuaderno/attachment/9' }],
      canApprove: true, canReject: true, createdAt: '2026-11-03 14:00:00',
    });
    expect(a.location).toEqual({ latitude: -12.19, longitude: -76.97, hasGPS: true });
    expect(a.attachments).toHaveLength(1);
    expect(a.canApprove).toBe(true);
  });

  test('GPS que llega como texto ya no tumba la pantalla (antes: toFixed is not a function)', () => {
    const a = normalizarAsiento({ id: 1, location: { latitude: '-12.190350', longitude: '-76.974470' } });
    expect(a.location.latitude).toBe(-12.19035);
    expect(typeof a.location.latitude!.toFixed(6)).toBe('string');
    expect(a.location.hasGPS).toBe(true);
  });

  test('los «vacíos» de Odoo (false, null) se vuelven texto vacío o null', () => {
    const a = normalizarAsiento({
      id: 2, name: false, date: false, clima: false, personal: false, equipos: null, ocurrencias: undefined,
      observacion: false, location: { latitude: false, longitude: false },
      residente: false, supervisor: false, cuaderno: false, attachments: false, createdAt: false,
    });
    expect(a.name).toBe('Asiento #2');
    expect(a.personal).toBe('');
    expect(a.observacion).toBe('');
    expect(a.location).toEqual({ latitude: null, longitude: null, hasGPS: false });
    expect(a.residente).toBeNull();
    expect(a.attachments).toEqual([]);
  });

  test('basura total no lanza excepción', () => {
    for (const x of [null, undefined, 5, 'x', [], { attachments: [null, 3, { id: 'x' }] }]) {
      expect(() => normalizarAsiento(x)).not.toThrow();
    }
    expect(normalizarAsiento({ attachments: [null, 3, { id: 'x' }] }).attachments).toEqual([]);
  });

  test('objetos donde se espera texto no llegan al render (antes: «Objects are not valid as a React child»)', () => {
    const a = normalizarAsiento({ id: 3, personal: { raro: 1 }, clima: ['x'] });
    expect(a.personal).toBe('');
    expect(a.clima).toBe('');
  });

  test('permisos solo valen si vienen en true', () => {
    expect(normalizarAsiento({ canApprove: 'true', canReject: 1 }).canApprove).toBe(false);
  });
});

describe('fechaLegible', () => {
  test('fecha de Odoo (UTC) a hora de Lima', () => {
    expect(fechaLegible('2026-11-03 14:00:00')).toMatch(/9:00/);
  });
  test('vacía o inválida: guion, nunca «Invalid Date»', () => {
    expect(fechaLegible('')).toBe('—');
    expect(fechaLegible('no es fecha')).toBe('—');
  });
});
