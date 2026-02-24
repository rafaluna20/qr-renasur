/**
 * Utilidades de Fecha y Hora
 * 
 * Funciones helper para trabajar con fechas en la aplicación.
 * Compatible con formato de Odoo y formatos de display.
 */

import { DATE_FORMATS, TIME_INTERVALS } from './constants';

/**
 * Formatear número con ceros a la izquierda
 */
function pad(num: number, size: number = 2): string {
  return String(num).padStart(size, '0');
}

// ============================================
// FORMATEO DE FECHAS
// ============================================

/**
 * Formatear fecha para Odoo: YYYY-MM-DD HH:mm:ss
 */
export function formatDateForOdoo(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Formatear solo fecha para Odoo: YYYY-MM-DD
 */
export function formatDateOnlyForOdoo(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  
  return `${year}-${month}-${day}`;
}

/**
 * Formatear fecha para display: DD/MM/YYYY
 */
export function formatDateForDisplay(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * Formatear hora para display: HH:mm
 */
export function formatTimeForDisplay(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Formatear fecha y hora para display: DD/MM/YYYY HH:mm
 */
export function formatDateTimeForDisplay(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${formatDateForDisplay(d)} ${formatTimeForDisplay(d)}`;
}

// ============================================
// PARSING DE FECHAS
// ============================================

/**
 * Parsear fecha de Odoo a Date object
 */
export function parseDateFromOdoo(odooDate: string): Date {
  // Odoo format: "YYYY-MM-DD HH:mm:ss"
  return new Date(odooDate.replace(' ', 'T') + 'Z');
}

/**
 * Parsear hora HH:mm a Date object (hoy)
 */
export function parseTime(timeString: string): Date {
  const [hours, minutes] = timeString.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

// ============================================
// CÁLCULOS DE TIEMPO
// ============================================

/**
 * Calcular duración entre dos horas (HH:mm)
 */
export function calculateDuration(
  startTime: string,
  endTime: string
): { hours: number; minutes: number; formatted: string; totalMinutes: number } {
  const [startHours, startMinutes] = startTime.split(':').map(Number);
  const [endHours, endMinutes] = endTime.split(':').map(Number);
  
  let totalMinutes = (endHours * 60 + endMinutes) - (startHours * 60 + startMinutes);
  
  // Manejar paso de medianoche
  if (totalMinutes < 0) {
    totalMinutes += 24 * 60;
  }
  
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  return {
    hours,
    minutes,
    formatted: `${pad(hours)}:${pad(minutes)}`,
    totalMinutes,
  };
}

/**
 * Convertir horas decimales a formato HH:mm
 */
export function decimalHoursToFormatted(decimalHours: number): string {
  const hours = Math.floor(decimalHours);
  const minutes = Math.round((decimalHours - hours) * 60);
  return `${pad(hours)}:${pad(minutes)}`;
}

/**
 * Convertir formato HH:mm a horas decimales
 */
export function formattedToDecimalHours(formatted: string): number {
  const [hours, minutes] = formatted.split(':').map(Number);
  return hours + (minutes / 60);
}

/**
 * Formato legible de horas y minutos
 */
export function formatHoursMinutes(decimalHours: number): string {
  const hours = Math.floor(decimalHours);
  const minutes = Math.round((decimalHours - hours) * 60);
  return `${hours}h ${pad(minutes)}m`;
}

// ============================================
// OPERACIONES DE FECHA
// ============================================

/**
 * Obtener inicio del día (00:00:00)
 */
export function getStartOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Obtener fin del día (23:59:59)
 */
export function getEndOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Obtener inicio de la semana (Domingo 00:00:00)
 */
export function getStartOfWeek(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Obtener fin de la semana (Sábado 23:59:59)
 */
export function getEndOfWeek(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + 6;
  d.setDate(diff);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Obtener inicio del mes
 */
export function getStartOfMonth(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

/**
 * Obtener fin del mes
 */
export function getEndOfMonth(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

// ============================================
// COMPARACIONES
// ============================================

/**
 * Verificar si dos fechas son el mismo día
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return date1.getFullYear() === date2.getFullYear() &&
         date1.getMonth() === date2.getMonth() &&
         date1.getDate() === date2.getDate();
}

/**
 * Verificar si una fecha es hoy
 */
export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

/**
 * Verificar si una fecha es ayer
 */
export function isYesterday(date: Date): boolean {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameDay(date, yesterday);
}

/**
 * Verificar si una fecha es esta semana
 */
export function isThisWeek(date: Date): boolean {
  const start = getStartOfWeek();
  const end = getEndOfWeek();
  return date >= start && date <= end;
}

// ============================================
// FORMATEO RELATIVO
// ============================================

/**
 * Obtener descripción relativa de fecha
 */
export function getRelativeDateDescription(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / TIME_INTERVALS.DAY);
  
  if (isToday(d)) return 'Hoy';
  if (isYesterday(d)) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} días`;
  if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} semanas`;
  if (diffDays < 365) return `Hace ${Math.floor(diffDays / 30)} meses`;
  return `Hace ${Math.floor(diffDays / 365)} años`;
}

// ============================================
// UTILIDADES ADICIONALES
// ============================================

/**
 * Obtener nombre del día de la semana
 */
export function getDayName(date: Date, short: boolean = false): string {
  const days = short 
    ? ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
    : ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return days[date.getDay()];
}

/**
 * Obtener nombre del mes
 */
export function getMonthName(date: Date, short: boolean = false): string {
  const months = short
    ? ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
    : ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return months[date.getMonth()];
}

/**
 * Agregar días a una fecha
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Agregar horas a una fecha
 */
export function addHours(date: Date, hours: number): Date {
  const result = new Date(date);
  result.setHours(result.getHours() + hours);
  return result;
}

/**
 * Verificar si es hora laboral (8am - 6pm)
 */
export function isWorkingHours(date: Date = new Date()): boolean {
  const hours = date.getHours();
  return hours >= 8 && hours < 18;
}

/**
 * Verificar si es día laboral (Lunes - Viernes)
 */
export function isWorkingDay(date: Date = new Date()): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5; // Monday = 1, Friday = 5
}
