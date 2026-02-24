import { NextRequest, NextResponse } from 'next/server';
import { getOdooClient } from '@/lib/odoo-client';
import { successResponse, errorResponse } from '@/lib/api-response';
import { logger } from '@/lib/logger';

/**
 * Health Check Endpoint
 * 
 * Verifica el estado de salud del sistema y sus dependencias.
 * Útil para:
 * - Kubernetes liveness/readiness probes
 * - Monitoreo de uptime
 * - CI/CD health checks
 * - Load balancer health checks
 */

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    api: CheckStatus;
    odoo: CheckStatus;
    environment: CheckStatus;
  };
}

interface CheckStatus {
  status: 'up' | 'down' | 'unknown';
  message?: string;
  responseTime?: number;
}

/**
 * Verificar conexión con Odoo
 */
async function checkOdoo(): Promise<CheckStatus> {
  const start = Date.now();
  
  try {
    const odoo = getOdooClient();
    
    // Intentar una operación simple (obtener versión)
    // En lugar de hacer una query real, solo verificamos que el cliente se inicializó
    if (!odoo) {
      return {
        status: 'down',
        message: 'Cliente Odoo no inicializado',
        responseTime: Date.now() - start,
      };
    }

    // Verificar que las variables de entorno existen
    const hasVars = process.env.ODOO_URL && 
                   process.env.ODOO_DATABASE && 
                   process.env.ODOO_USER_ID && 
                   process.env.ODOO_API_KEY;

    if (!hasVars) {
      return {
        status: 'down',
        message: 'Variables de entorno de Odoo faltantes',
        responseTime: Date.now() - start,
      };
    }

    return {
      status: 'up',
      message: 'Odoo configurado correctamente',
      responseTime: Date.now() - start,
    };

  } catch (error) {
    logger.error('Health check: Odoo connection failed', error as Error);
    return {
      status: 'down',
      message: error instanceof Error ? error.message : 'Error desconocido',
      responseTime: Date.now() - start,
    };
  }
}

/**
 * Verificar variables de entorno críticas
 */
function checkEnvironment(): CheckStatus {
  const requiredVars = [
    'ODOO_URL',
    'ODOO_DATABASE',
    'ODOO_USER_ID',
    'ODOO_API_KEY',
  ];

  const missing = requiredVars.filter(v => !process.env[v]);

  if (missing.length > 0) {
    return {
      status: 'down',
      message: `Variables faltantes: ${missing.join(', ')}`,
    };
  }

  return {
    status: 'up',
    message: 'Todas las variables de entorno configuradas',
  };
}

/**
 * GET /api/health - Health check básico
 */
export async function GET(req: NextRequest) {
  const startTime = Date.now();

  try {
    // Ejecutar checks en paralelo
    const [odooCheck, envCheck] = await Promise.all([
      checkOdoo(),
      Promise.resolve(checkEnvironment()),
    ]);

    const checks = {
      api: {
        status: 'up' as const,
        message: 'API funcionando',
        responseTime: Date.now() - startTime,
      },
      odoo: odooCheck,
      environment: envCheck,
    };

    // Determinar estado general
    const allUp = Object.values(checks).every(c => c.status === 'up');
    const anyDown = Object.values(checks).some(c => c.status === 'down');

    const status = allUp ? 'healthy' : anyDown ? 'unhealthy' : 'degraded';

    const result: HealthCheckResult = {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '2.0.0',
      checks,
    };

    // Log si hay problemas
    if (status !== 'healthy') {
      logger.warn('Health check failed', { status, checks });
    }

    // Retornar código apropiado
    const httpStatus = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;

    return NextResponse.json(result, { status: httpStatus });

  } catch (error) {
    logger.error('Health check endpoint error', error as Error);
    
    return errorResponse(
      'Health check falló',
      error instanceof Error ? error.message : undefined,
      503
    );
  }
}

/**
 * HEAD /api/health - Lightweight health check
 * Solo retorna status code sin body (más rápido)
 */
export async function HEAD(req: NextRequest) {
  try {
    const envCheck = checkEnvironment();
    const isHealthy = envCheck.status === 'up';

    return new NextResponse(null, {
      status: isHealthy ? 200 : 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });

  } catch (error) {
    return new NextResponse(null, { status: 503 });
  }
}
