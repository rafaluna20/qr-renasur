/**
 * Tipos TypeScript Centralizados
 * 
 * Exporta todos los tipos de la aplicación.
 */

// Re-export de tipos de API
export type {
  APISuccessResponse,
  APIErrorResponse,
  APIResponse,
  User,
  RegisterUserRequest,
  RegisterUserResponse,
  Attendance,
  CheckInRequest,
  CheckInResponse,
  CheckOutRequest,
  CheckOutResponse,
  AttendanceQueryRequest,
  AttendanceQueryResponse,
  Task,
  TaskQueryRequest,
  TaskQueryResponse,
  HealthCheckResponse,
  HealthCheckStatus,
  LoginRequest,
  LoginResponse,
  RefreshTokenRequest,
  RefreshTokenResponse,
  AdminFormData,
  UserFormData,
  LocalStorageData,
  QRData,
  PaginationParams,
  PaginatedResponse,
} from './api';

// Tipos adicionales de la aplicación
export type UserRole = 'admin' | 'user';

export type Theme = 'light' | 'dark' | 'auto';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  duration?: number;
}
