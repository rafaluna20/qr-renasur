/**
 * Constantes Centralizadas
 * 
 * Define valores constantes usados en toda la aplicación.
 * Facilita mantenimiento y evita magic numbers/strings.
 */

// ============================================
// CONFIGURACIÓN DE LA APLICACIÓN
// ============================================

export const APP_CONFIG = {
  name: 'QR Generator Studio',
  version: '2.0.0',
  description: 'Sistema de gestión de asistencia y tareas con QR',
  author: 'Tu Empresa',
} as const;

// ============================================
// ROLES DE USUARIO
// ============================================

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}

export const USER_ROLES = {
  ADMIN: 'admin',
  USER: 'user',
} as const;

// ============================================
// LÍMITES Y UMBRALES
// ============================================

export const LIMITS = {
  // Rate limiting
  RATE_LIMIT_WINDOW_MS: 60 * 1000, // 1 minuto
  RATE_LIMIT_MAX_REQUESTS: 100,    // 100 requests por ventana
  
  // Paginación
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  
  // Archivos
  MAX_FILE_SIZE_MB: 10,
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,
  
  // QR Code
  QR_SIZE_PX: 300,
  
  // Timeouts
  API_TIMEOUT_MS: 30 * 1000,      // 30 segundos
  ODOO_TIMEOUT_MS: 10 * 1000,     // 10 segundos
  
  // Cache
  CACHE_TTL_SHORT: 5 * 60 * 1000,   // 5 minutos
  CACHE_TTL_MEDIUM: 30 * 60 * 1000, // 30 minutos
  CACHE_TTL_LONG: 24 * 60 * 60 * 1000, // 24 horas
} as const;

// ============================================
// CÓDIGOS DE STATUS HTTP
// ============================================

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

// ============================================
// MENSAJES DE ERROR COMUNES
// ============================================

export const ERROR_MESSAGES = {
  // Autenticación
  UNAUTHORIZED: 'No autorizado',
  INVALID_CREDENTIALS: 'Credenciales inválidas',
  SESSION_EXPIRED: 'Sesión expirada',
  
  // Validación
  VALIDATION_ERROR: 'Datos de entrada inválidos',
  REQUIRED_FIELD: 'Campo requerido',
  INVALID_FORMAT: 'Formato inválido',
  
  // Recursos
  NOT_FOUND: 'Recurso no encontrado',
  ALREADY_EXISTS: 'El recurso ya existe',
  
  // Rate limiting
  TOO_MANY_REQUESTS: 'Demasiadas peticiones. Intenta de nuevo más tarde.',
  
  // Servidor
  INTERNAL_ERROR: 'Error interno del servidor',
  SERVICE_UNAVAILABLE: 'Servicio no disponible',
  
  // Odoo específico
  ODOO_CONNECTION_ERROR: 'Error de conexión con Odoo',
  ODOO_AUTHENTICATION_ERROR: 'Error de autenticación con Odoo',
} as const;

// ============================================
// MENSAJES DE ÉXITO
// ============================================

export const SUCCESS_MESSAGES = {
  CREATED: 'Creado exitosamente',
  UPDATED: 'Actualizado exitosamente',
  DELETED: 'Eliminado exitosamente',
  
  USER_REGISTERED: 'Usuario registrado exitosamente',
  LOGIN_SUCCESS: 'Inicio de sesión exitoso',
  LOGOUT_SUCCESS: 'Cierre de sesión exitoso',
  
  ATTENDANCE_CHECKED_IN: 'Entrada registrada exitosamente',
  ATTENDANCE_CHECKED_OUT: 'Salida registrada exitosamente',
  
  TASK_CREATED: 'Tarea creada exitosamente',
  TASK_COMPLETED: 'Tarea completada exitosamente',
} as const;

// ============================================
// KEYS DE LOCALSTORAGE
// ============================================

export const STORAGE_KEYS = {
  // Autenticación
  IS_AUTHENTICATED: 'isAuthenticated',
  USER_ROLE: 'userRole',
  USER_EMAIL: 'userEmail',
  USER_ID: 'userID',
  USER_NAME: 'userName',
  USER_IMAGE: 'userImage',
  
  // Proyecto/Tarea
  PROYECTO_ID: 'proyectoID',
  TAREA_ID: 'tareaID',
  
  // Tareas
  ACTIVE_TASKS: 'activeTasks',
  COMPLETED_TASKS: 'completedTasks',
  
  // Preferencias
  THEME: 'theme',
  LANGUAGE: 'language',
} as const;

// ============================================
// RUTAS DE LA APLICACIÓN
// ============================================

export const ROUTES = {
  // Públicas
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  
  // Dashboard
  DASHBOARD: '/',
  
  // Billetera (si se implementa)
  WALLET: '/billetera',
  WALLET_HISTORY: '/billetera/historial',
  WALLET_RECHARGE: '/billetera/recargar',
  
  // API
  API: {
    HEALTH: '/api/health',
    USERS_LOGIN: '/api/users/login',
    USERS_REGISTER: '/api/users/register',
    ASSISTANCE: '/api/assistance',
    ASSISTANCE_IN: '/api/assistance/in',
    ASSISTANCE_OUT: '/api/assistance/out',
    TASKS: '/api/task',
  },
} as const;

// ============================================
// MODELOS DE ODOO
// ============================================

export const ODOO_MODELS = {
  EMPLOYEE: 'hr.employee',
  ATTENDANCE: 'hr.attendance',
  ANALYTIC_LINE: 'account.analytic.line',
  PROJECT: 'project.project',
  TASK: 'project.task',
  PARTNER: 'res.partner',
} as const;

// ============================================
// REGEX PATTERNS
// ============================================

export const REGEX_PATTERNS = {
  // Perú específico
  DNI: /^\d{8}$/,
  PHONE: /^9\d{8}$/,
  
  // General
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  URL: /^https?:\/\/.+/,
  
  // Seguridad
  NO_HTML_TAGS: /^[^<>]*$/,
  ALPHANUMERIC: /^[a-zA-Z0-9]+$/,
  ALPHANUMERIC_SPACES: /^[a-zA-Z0-9\s]+$/,
} as const;

// ============================================
// FORMATOS DE FECHA/HORA
// ============================================

export const DATE_FORMATS = {
  // ISO 8601
  ISO: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
  ISO_DATE: 'YYYY-MM-DD',
  ISO_TIME: 'HH:mm:ss',
  
  // Odoo
  ODOO_DATETIME: 'YYYY-MM-DD HH:mm:ss',
  ODOO_DATE: 'YYYY-MM-DD',
  
  // Display
  DISPLAY_DATE: 'DD/MM/YYYY',
  DISPLAY_TIME: 'HH:mm',
  DISPLAY_DATETIME: 'DD/MM/YYYY HH:mm',
  
  // Nombres
  MONTH_DAY: 'D [de] MMM',
  WEEKDAY_SHORT: 'ddd',
} as const;

// ============================================
// INTERVALOS DE TIEMPO (MS)
// ============================================

export const TIME_INTERVALS = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
  MONTH: 30 * 24 * 60 * 60 * 1000,
} as const;

// ============================================
// CONFIGURACIÓN DE QR
// ============================================

export const QR_CONFIG = {
  SIZE: 300,
  API_URL: 'https://api.qrserver.com/v1/create-qr-code/',
  ERROR_CORRECTION: 'M', // L, M, Q, H
  MARGIN: 4,
} as const;

// ============================================
// TEMAS
// ============================================

export const THEMES = {
  LIGHT: 'light',
  DARK: 'dark',
  AUTO: 'auto',
} as const;

// ============================================
// TIPOS DE NOTIFICACIÓN
// ============================================

export const NOTIFICATION_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
} as const;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Verificar si un rol es admin
 */
export function isAdminRole(role: string): boolean {
  return role === UserRole.ADMIN;
}

/**
 * Verificar si un rol es user
 */
export function isUserRole(role: string): boolean {
  return role === UserRole.USER;
}

/**
 * Obtener URL completa de API
 */
export function getApiUrl(endpoint: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';
  return `${baseUrl}${endpoint}`;
}

/**
 * Verificar si está en producción
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Verificar si está en desarrollo
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}
