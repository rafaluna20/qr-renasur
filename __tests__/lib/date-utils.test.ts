/**
 * Tests para utilidades de fecha y zona horaria
 * Aseguran que la conversión a America/Lima funciona correctamente
 */

describe('Date Utils - Zona Horaria', () => {
  describe('Conversión a zona horaria America/Lima', () => {
    it('debe convertir correctamente UTC a hora de Perú', () => {
      // UTC: 2026-02-25 00:23:01
      // Perú (UTC-5): 2026-02-24 19:23:01
      const utcDate = new Date('2026-02-25T00:23:01Z');
      const peruTime = new Date(utcDate.toLocaleString('en-US', { timeZone: 'America/Lima' }));
      
      expect(peruTime.getDate()).toBe(24);
      expect(peruTime.getHours()).toBe(19);
    });

    it('debe generar fecha en formato YYYY-MM-DD para Perú', () => {
      const utcDate = new Date('2026-02-25T00:23:01Z');
      const peruTime = new Date(utcDate.toLocaleString('en-US', { timeZone: 'America/Lima' }));
      
      const pad = (n: number) => String(n).padStart(2, '0');
      const dateStr = `${peruTime.getFullYear()}-${pad(peruTime.getMonth() + 1)}-${pad(peruTime.getDate())}`;
      
      expect(dateStr).toBe('2026-02-24');
    });

    it('debe manejar correctamente el cambio de día', () => {
      // UTC: 05:00 (madrugada día siguiente)
      // Perú: 00:00 (medianoche día actual)
      const utcDate = new Date('2026-02-25T05:00:00Z');
      const peruTime = new Date(utcDate.toLocaleString('en-US', { timeZone: 'America/Lima' }));
      
      expect(peruTime.getDate()).toBe(25); // Mismo día que UTC en este caso
      expect(peruTime.getHours()).toBe(0);  // Medianoche en Perú
    });

    it('debe manejar correctamente horarios nocturnos', () => {
      // UTC: 01:00 (madrugada)
      // Perú: 20:00 (noche del día anterior)
      const utcDate = new Date('2026-02-25T01:00:00Z');
      const peruTime = new Date(utcDate.toLocaleString('en-US', { timeZone: 'America/Lima' }));
      
      expect(peruTime.getDate()).toBe(24); // Día anterior
      expect(peruTime.getHours()).toBe(20); // 8 PM
    });
  });

  describe('Formato de fecha para Odoo', () => {
    it('debe generar timestamp en formato YYYY-MM-DD HH:MM:SS', () => {
      const peruTime = new Date('2026-02-24T19:23:01');
      const pad = (n: number) => String(n).padStart(2, '0');
      
      const timestamp = 
        `${peruTime.getFullYear()}-${pad(peruTime.getMonth() + 1)}-${pad(peruTime.getDate())} ` +
        `${pad(peruTime.getHours())}:${pad(peruTime.getMinutes())}:${pad(peruTime.getSeconds())}`;
      
      expect(timestamp).toBe('2026-02-24 19:23:01');
    });

    it('debe agregar ceros a la izquierda en números menores a 10', () => {
      const date = new Date('2026-01-05T08:05:03');
      const pad = (n: number) => String(n).padStart(2, '0');
      
      const timestamp = 
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
        `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
      
      expect(timestamp).toBe('2026-01-05 08:05:03');
    });
  });

  describe('Cálculo de horas transcurridas', () => {
    it('debe calcular correctamente horas entre dos timestamps', () => {
      const checkIn = new Date('2026-02-24T08:00:00');
      const now = new Date('2026-02-24T10:30:00');
      
      const hoursOpen = (now.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
      
      expect(hoursOpen).toBe(2.5);
    });

    it('debe detectar registros que requieren auto-cierre (>24h)', () => {
      const checkIn = new Date('2026-02-22T08:00:00');
      const now = new Date('2026-02-24T10:00:00');
      
      const hoursOpen = (now.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
      const AUTO_CLOSE_HOURS = 24;
      
      expect(hoursOpen).toBeGreaterThan(AUTO_CLOSE_HOURS);
      expect(hoursOpen).toBe(50); // 2 días + 2 horas
    });

    it('debe identificar registros recientes que NO requieren auto-cierre', () => {
      const checkIn = new Date('2026-02-24T08:00:00');
      const now = new Date('2026-02-24T14:00:00');
      
      const hoursOpen = (now.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
      const AUTO_CLOSE_HOURS = 24;
      
      expect(hoursOpen).toBeLessThan(AUTO_CLOSE_HOURS);
      expect(hoursOpen).toBe(6);
    });
  });

  describe('Búsqueda de registros por fecha', () => {
    it('debe generar fecha Perú para búsqueda en frontend', () => {
      // Simular fecha actual
      const mockDate = new Date('2026-02-25T00:23:01Z'); // UTC
      
      const peruDate = mockDate.toLocaleString('es-PE', { 
        timeZone: 'America/Lima',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      
      const [day, month, year] = peruDate.split('/');
      const todayPeru = `${year}-${month}-${day}`;
      
      expect(todayPeru).toBe('2026-02-24');
    });

    it('debe permitir buscar registros usando startsWith', () => {
      const records = [
        { id: 1, check_in: '2026-02-24 19:23:01' },
        { id: 2, check_in: '2026-02-24 08:15:00' },
        { id: 3, check_in: '2026-02-23 20:00:00' },
      ];
      
      const todayPeru = '2026-02-24';
      const todayRecords = records.filter(r => r.check_in.startsWith(todayPeru));
      
      expect(todayRecords).toHaveLength(2);
      expect(todayRecords[0].id).toBe(1);
      expect(todayRecords[1].id).toBe(2);
    });
  });
});
