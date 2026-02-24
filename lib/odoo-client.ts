/**
 * Cliente centralizado para Odoo JSON-RPC
 * 
 * Beneficios:
 * - Elimina código duplicado
 * - Centraliza credenciales
 * - Manejo de errores consistente
 * - Type-safe con TypeScript
 * - Fácil de testear
 */

interface OdooConfig {
  url: string;
  database: string;
  userId: number;
  apiKey: string;
}

interface OdooResponse<T = any> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data: any;
  };
}

export class OdooError extends Error {
  constructor(
    message: string,
    public code: number,
    public data: any
  ) {
    super(message);
    this.name = 'OdooError';
  }
}

export class OdooClient {
  private config: OdooConfig;
  private requestId: number = 0;

  constructor() {
    // Validar que existan las variables de entorno
    const url = process.env.ODOO_URL;
    const database = process.env.ODOO_DATABASE;
    const userId = process.env.ODOO_USER_ID;
    const apiKey = process.env.ODOO_API_KEY;

    if (!url || !database || !userId || !apiKey) {
      throw new Error(
        'Missing required Odoo environment variables. ' +
        'Please check .env.local file.'
      );
    }

    this.config = {
      url,
      database,
      userId: Number(userId),
      apiKey,
    };
  }

  /**
   * Método genérico para llamar a Odoo
   */
  private async call<T = any>(
    model: string,
    method: string,
    args: any[] = [],
    kwargs: Record<string, any> = {}
  ): Promise<T> {
    this.requestId++;

    const payload = {
      jsonrpc: '2.0',
      method: 'call',
      id: this.requestId,
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [
          this.config.database,
          this.config.userId,
          this.config.apiKey,
          model,
          method,
          args,
          kwargs,
        ],
      },
    };

    try {
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: OdooResponse<T> = await response.json();

      if (data.error) {
        // TEMPORAL: Logging detallado del error de Odoo
        console.error('=== ODOO ERROR DETAILS ===');
        console.error('Full error object:', JSON.stringify(data.error, null, 2));
        console.error('Error message:', data.error.message);
        console.error('Error code:', data.error.code);
        console.error('Error data:', data.error.data);
        console.error('========================');

        throw new OdooError(
          data.error.message,
          data.error.code,
          data.error.data
        );
      }

      return data.result as T;
    } catch (error) {
      if (error instanceof OdooError) {
        throw error;
      }
      throw new Error(
        `Failed to communicate with Odoo: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Buscar y leer registros
   */
  async searchRead<T = any>(
    model: string,
    domain: any[] = [],
    fields: string[] = [],
    options: {
      limit?: number;
      offset?: number;
      order?: string;
    } = {}
  ): Promise<T[]> {
    return this.call<T[]>(model, 'search_read', [domain], {
      fields,
      ...options,
    });
  }

  /**
   * Crear un nuevo registro
   */
  async create<T = any>(
    model: string,
    values: Record<string, any>
  ): Promise<number> {
    return this.call<number>(model, 'create', [[values]]);
  }

  /**
   * Actualizar registros existentes
   */
  async write(
    model: string,
    ids: number[],
    values: Record<string, any>
  ): Promise<boolean> {
    return this.call<boolean>(model, 'write', [ids, values]);
  }

  /**
   * Eliminar registros
   */
  async unlink(model: string, ids: number[]): Promise<boolean> {
    return this.call<boolean>(model, 'unlink', [[ids]]);
  }

  /**
   * Buscar IDs de registros
   */
  async search(
    model: string,
    domain: any[] = [],
    options: {
      limit?: number;
      offset?: number;
      order?: string;
    } = {}
  ): Promise<number[]> {
    return this.call<number[]>(model, 'search', [domain], options);
  }

  /**
   * Leer registros por IDs
   */
  async read<T = any>(
    model: string,
    ids: number[],
    fields: string[] = []
  ): Promise<T[]> {
    return this.call<T[]>(model, 'read', [[ids]], { fields });
  }

  /**
   * Contar registros
   */
  async searchCount(model: string, domain: any[] = []): Promise<number> {
    return this.call<number>(model, 'search_count', [domain]);
  }
}

// Singleton instance
let odooClientInstance: OdooClient | null = null;

export function getOdooClient(): OdooClient {
  if (!odooClientInstance) {
    odooClientInstance = new OdooClient();
  }
  return odooClientInstance;
}

// Type definitions para modelos comunes de Odoo
export interface OdooEmployee {
  id: number;
  name: string;
  work_email: string;
  work_phone: string;
  identification_id: string;
  image_128: string;
  active: boolean;
}

export interface OdooAttendance {
  id: number;
  employee_id: [number, string];
  check_in: string;
  check_out?: string;
  worked_hours?: number;
}

export interface OdooAnalyticLine {
  id: number;
  date: string;
  project_id: [number, string];
  task_id: [number, string];
  name: string;
  unit_amount: number;
  employee_id: [number, string];
  so_line: any;
}
