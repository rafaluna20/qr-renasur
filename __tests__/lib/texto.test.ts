/** @jest-environment node */
import { limpiarTexto } from '@/lib/validation/texto';

describe('limpiarTexto', () => {
  test('quita caracteres de control y el nulo que Postgres rechaza', () => {
    expect(limpiarTexto('a\u0000b\u0007c\u001Fd\u007Fe')).toBe('abcde');
  });
  test('conserva el texto de obra, incluso con < y >', () => {
    expect(limpiarTexto('cota <3 m y >2 m & "ok"')).toBe('cota <3 m y >2 m & "ok"');
  });
  test('normaliza saltos de línea y conserva los tabuladores que no son de control peligroso', () => {
    expect(limpiarTexto('a\r\nb\rc')).toBe('a\nb\nc');
  });
  test('recorta el exceso y tolera valores raros', () => {
    expect(limpiarTexto('x'.repeat(50), 10)).toHaveLength(10);
    expect(limpiarTexto(undefined)).toBe('');
    expect(limpiarTexto(null)).toBe('');
    expect(limpiarTexto(12)).toBe('12');
  });
});
