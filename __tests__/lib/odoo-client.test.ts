/**
 * Tests para el cliente Odoo
 * Verifica que las operaciones CRUD funcionan correctamente
 */

import { getOdooClient, OdooClient, OdooError } from '@/lib/odoo-client';

// Mock de fetch
global.fetch = jest.fn();

describe('OdooClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('debe retornar la misma instancia en múltiples llamadas', () => {
      const client1 = getOdooClient();
      const client2 = getOdooClient();
      
      expect(client1).toBe(client2);
    });
  });

  describe('searchRead', () => {
    it('debe buscar registros correctamente', async () => {
      const mockResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: [
          { id: 1, name: 'Test User', email: 'test@example.com' }
        ]
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const client = getOdooClient();
      const result = await client.searchRead('hr.employee', [], ['id', 'name', 'email']);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Test User');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('debe manejar errores de Odoo correctamente', async () => {
      const mockError = {
        jsonrpc: '2.0',
        id: 1,
        error: {
          code: 200,
          message: 'ValidationError',
          data: { message: 'Error de validación' }
        }
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockError,
      });

      const client = getOdooClient();

      await expect(
        client.searchRead('hr.employee', [], ['id'])
      ).rejects.toThrow(OdooError);
    });
  });

  describe('create', () => {
    it('debe crear un registro y retornar su ID', async () => {
      const mockResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: 123
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const client = getOdooClient();
      const id = await client.create('hr.attendance', {
        employee_id: 5,
        check_in: '2026-02-24 19:23:01'
      });

      expect(id).toBe(123);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('write', () => {
    it('debe actualizar un registro existente', async () => {
      const mockResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: true
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const client = getOdooClient();
      const success = await client.write('hr.attendance', 123, {
        check_out: '2026-02-24 20:00:00'
      });

      expect(success).toBe(true);
    });

    it('debe aceptar array de IDs', async () => {
      const mockResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: true
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const client = getOdooClient();
      const success = await client.write('hr.attendance', [123, 124], {
        x_processed: true
      });

      expect(success).toBe(true);
    });
  });

  describe('Manejo de Errores', () => {
    it('debe lanzar OdooError con detalles completos', async () => {
      const mockError = {
        jsonrpc: '2.0',
        id: 1,
        error: {
          code: 500,
          message: 'AccessError: No tienes permisos',
          data: {
            name: 'odoo.exceptions.AccessError',
            debug: 'Stack trace...',
            message: 'No tienes permisos para esta operación'
          }
        }
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockError,
      });

      const client = getOdooClient();

      try {
        await client.searchRead('hr.attendance', [], ['id']);
      } catch (error) {
        expect(error).toBeInstanceOf(OdooError);
        expect((error as OdooError).code).toBe(500);
        expect((error as OdooError).message).toContain('AccessError');
      }
    });

    it('debe manejar errores de red', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      );

      const client = getOdooClient();

      await expect(
        client.searchRead('hr.attendance', [], ['id'])
      ).rejects.toThrow('Failed to communicate with Odoo');
    });

    it('debe manejar respuestas HTTP no-ok', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const client = getOdooClient();

      await expect(
        client.searchRead('hr.attendance', [], ['id'])
      ).rejects.toThrow('HTTP error! status: 500');
    });
  });
});
