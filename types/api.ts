/**
 * Tipos TypeScript para API
 * 
 * Define interfaces y types para requests/responses de la API.
 */

// ============================================
// RESPONSE GENÉRICOS
// ============================================

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

// ============================================
// USER/EMPLOYEE
// ============================================

export interface User {
  id: number;
  name: string;
  work_email: string;
  work_phone: string;
  identification_id: string;
  image_128: string;
  active: boolean;
}

export interface RegisterUserRequest {
  name: string;
  email: string;
  phone: string;
  dni: string;
}

export interface RegisterUserResponse {
  result: number; // Employee ID
  message: string;
}

// ============================================
// ATTENDANCE
// ============================================

export interface Attendance {
  id: number;
  employee_id: [number, string];
  check_in: string;
  check_out?: string;
  worked_hours?: number;
}

export interface CheckInRequest {
  userId: number;
}

export interface CheckInResponse {
  result: number; // Attendance ID
  attendance: Attendance;
  message: string;
  checkIn: string;
}

export interface CheckOutRequest {
  registryId: number;
}

export interface CheckOutResponse {
  message: string;
  attendance: Attendance;
  checkOut: string;
}

export interface AttendanceQueryRequest {
  userId: number;
  allHistory?: boolean;
}

export interface AttendanceQueryResponse {
  result: Attendance[];
  count: number;
  filter: 'all' | 'today';
}

// ============================================
// TASKS
// ============================================

export interface Task {
  id: number;
  date: string;
  project_id: [number, string];
  task_id: [number, string];
  name: string;
  unit_amount: number;
  employee_id: [number, string];
  so_line: any;
}

export interface TaskQueryRequest {
  userId: number | string;
  limit?: number;
}

export interface TaskQueryResponse {
  result: Task[];
  count: number;
}

// ============================================
// HEALTH CHECK
// ============================================

export interface HealthCheckStatus {
  status: 'up' | 'down' | 'unknown';
  message?: string;
  responseTime?: number;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    api: HealthCheckStatus;
    odoo: HealthCheckStatus;
    environment: HealthCheckStatus;
  };
}

// ============================================
// AUTH (Futuro)
// ============================================

export interface LoginRequest {
  email: string;
  password: string;
  role: 'admin' | 'user';
}

export interface LoginResponse {
  token: string;
  refreshToken: string;
  user: User;
  expiresIn: number;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  token: string;
  expiresIn: number;
}

// ============================================
// FORM DATA
// ============================================

export interface AdminFormData {
  proyecto: string;
  tarea: string;
}

export interface UserFormData {
  empleado: string;
  horas: string;
}

// ============================================
// LOCAL STORAGE
// ============================================

export interface LocalStorageData {
  isAuthenticated: boolean;
  userRole: 'admin' | 'user';
  userEmail: string;
  userId: number;
  userName: string;
  userImage: string;
  proyectoID?: string;
  tareaID?: string;
}

// ============================================
// QR DATA
// ============================================

export interface QRData {
  proyectoID: string;
  tareaID: string;
  url: string;
}

// ============================================
// PAGINATION
// ============================================

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}
