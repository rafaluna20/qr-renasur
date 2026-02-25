import { type NextRequest, NextResponse } from 'next/server';
import { getOdooClient, OdooError } from '@/lib/odoo-client';
import { logger } from '@/lib/logger';
import { z } from 'zod';

/**
 * API Route: Registrar Entrada (Check-in)
 *
 * Este endpoint marca la entrada de un empleado creando
 * un nuevo registro de asistencia con check_in.
 *
 * MEJORAS v2.1:
 * - Validación correcta de registros abiertos (cualquier fecha)
 * - Auto-cierre de registros > 24 horas
 * - Logging detallado para debugging
 * - Mensajes de error descriptivos
 */

// Schema de validación
const checkInSchema = z.object({
  userId: z.number().positive('userId debe ser un número positivo'),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  accuracy: z.number().optional(),
});

// Constantes
const AUTO_CLOSE_HOURS = 24; // Horas para auto-cerrar registros antiguos

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  let requestUserId: number | undefined;
  
  try {
    const body = await req.json();
    requestUserId = body.userId;

    // Validar datos de entrada
    const validationResult = checkInSchema.safeParse(body);
    if (!validationResult.success) {
      logger.warn('Validación fallida en check-in', {
        errors: validationResult.error.issues,
        body,
      });
      
      return NextResponse.json(
        {
          success: false,
          error: 'Datos de entrada inválidos',
          details: validationResult.error.issues,
        },
        { status: 400 }
      );
    }

    const { userId, latitude, longitude, accuracy } = validationResult.data;
    
    // Usar zona horaria de Perú (America/Lima, UTC-5)
    const now = new Date();
    const peruTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Lima' }));
    const pad = (n: number) => String(n).padStart(2, '0');

    // Formatear fecha para Odoo: YYYY-MM-DD HH:MM:SS (zona horaria Perú)
    const checkIn =
      `${peruTime.getFullYear()}-${pad(peruTime.getMonth() + 1)}-${pad(peruTime.getDate())} ` +
      `${pad(peruTime.getHours())}:${pad(peruTime.getMinutes())}:${pad(peruTime.getSeconds())}`;

    logger.info('Procesando check-in', {
      userId,
      checkIn,
      hasGPS: !!(latitude && longitude),
    });

    const odoo = getOdooClient();

    // CORRECCIÓN CRÍTICA: Buscar CUALQUIER registro abierto, no solo de hoy
    // Esto previene el error cuando hay registros abiertos de días anteriores
    const existingOpen = await odoo.searchRead('hr.attendance', [
      ['employee_id', '=', userId],
      ['check_out', '=', false],
    ], ['id', 'check_in', 'employee_id']);

    if (existingOpen.length > 0) {
      const openRecord = existingOpen[0];
      const checkInTime = new Date(openRecord.check_in);
      const hoursOpen = (now.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);
      
      logger.warn('Registro abierto encontrado', {
        attendanceId: openRecord.id,
        checkIn: openRecord.check_in,
        hoursOpen: hoursOpen.toFixed(2),
        willAutoClose: hoursOpen > AUTO_CLOSE_HOURS,
      });

      // Auto-cerrar registros > 24 horas
      if (hoursOpen > AUTO_CLOSE_HOURS) {
        logger.info('Auto-cerrando registro antiguo', {
          attendanceId: openRecord.id,
          originalCheckIn: openRecord.check_in,
          hoursOpen: hoursOpen.toFixed(2),
        });

        try {
          // Cerrar con el fin del día del check-in original
          const checkInDate = openRecord.check_in.split(' ')[0];
          const autoCheckOut = `${checkInDate} 23:59:59`;
          
          await odoo.write('hr.attendance', openRecord.id, {
            check_out: autoCheckOut,
          });

          logger.info('Registro antiguo cerrado exitosamente', {
            attendanceId: openRecord.id,
            autoCheckOut,
          });

          // Continuar con el nuevo check-in después del auto-cierre
        } catch (closeError) {
          logger.error('Error al auto-cerrar registro antiguo', closeError as Error, {
            attendanceId: openRecord.id,
          });
          
          // Si falla el auto-cierre, retornar error al usuario
          return NextResponse.json(
            {
              success: false,
              error: 'No se pudo cerrar automáticamente tu registro anterior. Contacta al administrador.',
              data: {
                attendanceId: openRecord.id,
                checkIn: openRecord.check_in,
                action: 'manual_close_required',
              },
            },
            { status: 409 }
          );
        }
      } else {
        // Registro reciente (< 24 horas), requiere cierre manual
        const checkInFormatted = checkInTime.toLocaleString('es-ES', {
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

        return NextResponse.json(
          {
            success: false,
            error: `Ya tienes un registro de entrada abierto desde ${checkInFormatted}. Por favor, registra tu salida primero.`,
            data: {
              attendanceId: openRecord.id,
              checkIn: openRecord.check_in,
              hoursOpen: Math.round(hoursOpen * 10) / 10,
              action: 'checkout_required',
            },
          },
          { status: 409 }
        );
      }
    }

    // Crear nuevo registro de asistencia con coordenadas
    const attendanceData: Record<string, any> = {
      employee_id: userId,
      check_in: checkIn,
    };

    // Agregar coordenadas si están disponibles
    if (latitude !== undefined && longitude !== undefined) {
      attendanceData.x_latitude = latitude;
      attendanceData.x_longitude = longitude;

      if (accuracy !== undefined) {
        attendanceData.x_accuracy = accuracy;
      }
      
      logger.info('Check-in con geolocalización', {
        userId,
        latitude: latitude.toFixed(6),
        longitude: longitude.toFixed(6),
        accuracy: accuracy?.toFixed(2),
      });
    } else {
      logger.warn('Check-in sin geolocalización', { userId });
    }

    logger.debug('Creando registro de asistencia', { attendanceData });

    const attendanceId = await odoo.create('hr.attendance', attendanceData);

    logger.info('Registro de asistencia creado', {
      attendanceId,
      userId,
      checkIn,
    });

    // Obtener el registro creado
    const [attendance] = await odoo.read('hr.attendance', [attendanceId], [
      'id',
      'employee_id',
      'check_in',
      'check_out',
      'worked_hours',
    ]);

    const duration = Date.now() - startTime;
    logger.info('Check-in completado exitosamente', {
      attendanceId,
      userId,
      duration: `${duration}ms`,
    });

    return NextResponse.json({
      success: true,
      data: {
        result: attendanceId,
        attendance,
        message: 'Entrada registrada exitosamente',
        checkIn,
        hasGPS: !!(latitude && longitude),
      }
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('Error en check-in', error as Error, {
      userId: requestUserId,
      duration: `${duration}ms`,
    });

    if (error instanceof OdooError) {
      // Extraer mensaje de error legible de Odoo
      let errorMessage = 'Error al comunicarse con el sistema de asistencias';
      
      if (error.message.includes('ValidationError')) {
        errorMessage = 'Error de validación en Odoo. Verifica que no tengas un registro abierto.';
      } else if (error.message.includes('AccessError')) {
        errorMessage = 'No tienes permisos para registrar asistencia. Contacta al administrador.';
      }

      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
          details: process.env.NODE_ENV === 'development'
            ? { message: error.message, code: error.code }
            : undefined,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Error interno del servidor al registrar entrada',
        details: process.env.NODE_ENV === 'development'
          ? (error instanceof Error ? error.message : String(error))
          : undefined,
      },
      { status: 500 }
    );
  }
}
