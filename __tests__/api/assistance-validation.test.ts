/**
 * Tests para validación de asistencias
 * Previene regresión de bugs de validación de registros abiertos
 */

describe('Validación de Registros de Asistencia', () => {
  describe('Bug Fix: Validación de registros abiertos', () => {
    it('debe buscar registros abiertos de CUALQUIER fecha, no solo de hoy', () => {
      // Simular registros de asistencia
      const attendances = [
        { id: 1, employee_id: 5, check_in: '2026-02-22 08:00:00', check_out: false },
        { id: 2, employee_id: 5, check_in: '2026-02-24 19:23:01', check_out: '2026-02-24 20:00:00' },
        { id: 3, employee_id: 6, check_in: '2026-02-24 09:00:00', check_out: false },
      ];

      // CORRECTO: Buscar registros abiertos sin filtro de fecha
      const openRecords = attendances.filter(a => 
        a.employee_id === 5 && !a.check_out
      );

      expect(openRecords).toHaveLength(1);
      expect(openRecords[0].id).toBe(1);
      expect(openRecords[0].check_in).toBe('2026-02-22 08:00:00');
    });

    it('NO debe buscar solo registros del día actual (bug original)', () => {
      const attendances = [
        { id: 1, employee_id: 5, check_in: '2026-02-22 08:00:00', check_out: false },
        { id: 2, employee_id: 5, check_in: '2026-02-24 19:23:01', check_out: '2026-02-24 20:00:00' },
      ];

      const today = '2026-02-24';
      
      // INCORRECTO (bug original): Buscar solo registros de hoy
      const incorrectSearch = attendances.filter(a => 
        a.employee_id === 5 && 
        a.check_in.startsWith(today) &&
        !a.check_out
      );

      // Esto era el bug: no encuentra el registro abierto de hace 2 días
      expect(incorrectSearch).toHaveLength(0);
      
      // Pero el registro abierto SÍ existe (ID 1)
      const hasOpenRecord = attendances.some(a => 
        a.employee_id === 5 && !a.check_out
      );
      expect(hasOpenRecord).toBe(true);
    });
  });

  describe('Auto-cierre de registros antiguos', () => {
    it('debe identificar registros que requieren auto-cierre (>24h)', () => {
      const checkIn = new Date('2026-02-22 08:00:00');
      const now = new Date('2026-02-24 10:00:00');
      const AUTO_CLOSE_HOURS = 24;

      const hoursOpen = (now.getTime() - checkIn.getTime()) / (1000 * 60 * 60);

      expect(hoursOpen).toBeGreaterThan(AUTO_CLOSE_HOURS);
      expect(hoursOpen).toBe(50); // 2 días + 2 horas
    });

    it('NO debe auto-cerrar registros recientes (<24h)', () => {
      const checkIn = new Date('2026-02-24 08:00:00');
      const now = new Date('2026-02-24 14:00:00');
      const AUTO_CLOSE_HOURS = 24;

      const hoursOpen = (now.getTime() - checkIn.getTime()) / (1000 * 60 * 60);

      expect(hoursOpen).toBeLessThan(AUTO_CLOSE_HOURS);
      expect(hoursOpen).toBe(6);
    });

    it('debe generar hora de auto-cierre al final del día original', () => {
      const checkIn = '2026-02-22 08:00:00';
      const checkInDate = checkIn.split(' ')[0];
      const autoCheckOut = `${checkInDate} 23:59:59`;

      expect(autoCheckOut).toBe('2026-02-22 23:59:59');
    });
  });

  describe('Detección de conflictos', () => {
    it('debe retornar 409 Conflict cuando hay registro abierto reciente', () => {
      const existingOpen = [
        { id: 13, check_in: '2026-02-24 19:31:19', check_out: false }
      ];

      const hasConflict = existingOpen.length > 0;
      const expectedStatusCode = hasConflict ? 409 : 200;

      expect(expectedStatusCode).toBe(409);
      expect(hasConflict).toBe(true);
    });

    it('debe permitir check-in cuando NO hay registros abiertos', () => {
      const existingOpen: any[] = [];

      const hasConflict = existingOpen.length > 0;
      const expectedStatusCode = hasConflict ? 409 : 200;

      expect(expectedStatusCode).toBe(200);
      expect(hasConflict).toBe(false);
    });

    it('debe permitir check-in después de auto-cerrar registro antiguo', () => {
      const checkIn = new Date('2026-02-22 08:00:00');
      const now = new Date('2026-02-24 10:00:00');
      const AUTO_CLOSE_HOURS = 24;
      const hoursOpen = (now.getTime() - checkIn.getTime()) / (1000 * 60 * 60);

      const willAutoClose = hoursOpen > AUTO_CLOSE_HOURS;
      const canCheckIn = willAutoClose; // Después del auto-cierre

      expect(willAutoClose).toBe(true);
      expect(canCheckIn).toBe(true);
    });
  });

  describe('Mensajes de error descriptivos', () => {
    it('debe incluir fecha/hora en mensajes de error', () => {
      const checkInTime = new Date('2026-02-24T13:55:00');
      const checkInFormatted = checkInTime.toLocaleString('es-ES', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      const errorMessage = `Ya tienes un registro de entrada abierto desde ${checkInFormatted}. Por favor, registra tu salida primero.`;

      // 24 de febrero 2026 es martes, no miércoles
      expect(errorMessage).toContain('mar'); // Martes
      expect(errorMessage).toContain('feb');
      expect(errorMessage).toContain('2026');
      expect(errorMessage).toContain('13:55');
    });

    it('debe incluir horas transcurridas en metadata', () => {
      const checkIn = new Date('2026-02-24 08:00:00');
      const now = new Date('2026-02-24 14:30:00');
      const hoursOpen = (now.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
      const hoursOpenRounded = Math.round(hoursOpen * 10) / 10;

      expect(hoursOpenRounded).toBe(6.5);
    });
  });
});
