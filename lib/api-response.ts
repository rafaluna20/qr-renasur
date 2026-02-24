/**
 * Utilidades para Responses HTTP Consistentes
 * 
 * Proporciona funciones helper para crear responses estandarizados
 * en todas las API routes.
 */

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { OdooError } from './odoo-client';
import { logger } from './logger';

/**
 * Response exitoso
 */
export function successResponse<T = any>(
  data: T,
  message?: string,
  status: number = 200
) {
  return NextResponse.json(
    {
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
    },
    { status }
  );
}

/**
 * Response de recurso creado
 */
export function createdResponse<T = any>(
  data: T,
  message: string = 'Recurso creado exitosamente'
) {
  return successResponse(data, message, 201);
}

/**
 * Response de error genérico
 */
export function errorResponse(
  message: string,
  details?: any,
  status: number = 500
) {
  logger.error(message, undefined, { details, status });

  return NextResponse.json(
    {
      success: false,
      error: message,
      details,
      timestamp: new Date().toISOString(),
    },
    { status }
  );
}

/**
 * Response de validación fallida (400 Bad Request)
 */
export function validationErrorResponse(
  message: string = 'Datos de entrada inválidos',
  errors: any
) {
  return errorResponse(message, errors, 400);
}

/**
 * Response de no autorizado (401 Unauthorized)
 */
export function unauthorizedResponse(
  message: string = 'No autorizado'
) {
  return errorResponse(message, undefined, 401);
}

/**
 * Response de prohibido (403 Forbidden)
 */
export function forbiddenResponse(
  message: string = 'Acceso denegado'
) {
  return errorResponse(message, undefined, 403);
}

/**
 * Response de no encontrado (404 Not Found)
 */
export function notFoundResponse(
  message: string = 'Recurso no encontrado'
) {
  return errorResponse(message, undefined, 404);
}

/**
 * Response de conflicto (409 Conflict)
 */
export function conflictResponse(
  message: string,
  details?: any
) {
  return errorResponse(message, details, 409);
}

/**
 * Response de método no permitido (405 Method Not Allowed)
 */
export function methodNotAllowedResponse(
  allowedMethods: string[] = []
) {
  return NextResponse.json(
    {
      success: false,
      error: 'Método HTTP no permitido',
      allowedMethods,
      timestamp: new Date().toISOString(),
    },
    { 
      status: 405,
      headers: allowedMethods.length > 0 
        ? { 'Allow': allowedMethods.join(', ') }
        : {}
    }
  );
}

/**
 * Manejo automático de errores comunes
 */
export function handleAPIError(error: unknown): NextResponse {
  // Error de validación Zod
  if (error instanceof ZodError) {
    return validationErrorResponse(
      'Datos de entrada inválidos',
      error.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message,
      }))
    );
  }

  // Error de Odoo
  if (error instanceof OdooError) {
    logger.error('Odoo error', error, {
      code: error.code,
      data: error.data,
    });

    return errorResponse(
      'Error en la comunicación con Odoo',
      {
        message: error.message,
        code: error.code,
      },
      500
    );
  }

  // Error estándar
  if (error instanceof Error) {
    logger.error('Unhandled error', error);

    // No exponer detalles internos en producción
    const details = process.env.NODE_ENV === 'production' 
      ? undefined 
      : { message: error.message, stack: error.stack };

    return errorResponse(
      'Error interno del servidor',
      details,
      500
    );
  }

  // Error desconocido
  logger.error('Unknown error type', undefined, { error });
  return errorResponse('Error desconocido', undefined, 500);
}

/**
 * Wrapper para manejar errores en API routes
 */
export function withErrorHandling<T extends any[]>(
  handler: (...args: T) => Promise<NextResponse>
) {
  return async (...args: T): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      return handleAPIError(error);
    }
  };
}

/**
 * Tipos para responses tipados
 */
export interface APISuccessResponse<T = any> {
  success: true;
  message?: string;
  data: T;
  timestamp: string;
}

export interface APIErrorResponse {
  success: false;
  error: string;
  details?: any;
  timestamp: string;
}

export type APIResponse<T = any> = APISuccessResponse<T> | APIErrorResponse;
