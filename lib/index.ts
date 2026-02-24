/**
 * Índice central de utilidades
 * 
 * Exporta todas las utilidades del directorio lib/
 * para facilitar imports en el resto de la aplicación.
 */

// Odoo Client
export {
  getOdooClient,
  OdooClient,
  OdooError,
  type OdooEmployee,
  type OdooAttendance,
  type OdooAnalyticLine,
} from './odoo-client';

// Logger
export {
  logger,
  Logger,
  LogLevel,
  logAPIRequest,
  logOdooOperation,
  type APIRequestLog,
  type OdooOperationLog,
} from './logger';

// API Responses
export {
  successResponse,
  createdResponse,
  errorResponse,
  validationErrorResponse,
  unauthorizedResponse,
  forbiddenResponse,
  notFoundResponse,
  conflictResponse,
  methodNotAllowedResponse,
  handleAPIError,
  withErrorHandling,
  type APISuccessResponse,
  type APIErrorResponse,
  type APIResponse,
} from './api-response';

// Request Validation
export {
  validateRequestBody,
  extractRequestMetadata,
  validateMethod,
  checkRateLimit,
  commonSchemas,
  sanitizeString,
  validateContentType,
  logValidationError,
} from './request-validator';

// Utils (si existe)
export * from './utils';
