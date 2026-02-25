import { type NextRequest, NextResponse } from 'next/server';
import { getOdooClient, OdooError } from '@/lib/odoo-client';
import { logger } from '@/lib/logger';

/**
 * API Route: Diagnóstico de Campos GPS
 * 
 * Verifica si los campos GPS personalizados existen en Odoo
 * y si tienen datos guardados.
 */

const GPS_FIELDS = {
  checkin: ['x_latitude', 'x_longitude', 'x_accuracy'],
  checkout: ['x_latitude_out', 'x_longitude_out', 'x_accuracy_out'],
};

export async function GET(req: NextRequest) {
  try {
    const odoo = getOdooClient();
    
    logger.info('Iniciando diagnóstico de campos GPS');
    
    const diagnosticResult: any = {
      success: true,
      timestamp: new Date().toISOString(),
      odoo: {
        url: process.env.ODOO_URL,
        db: process.env.ODOO_DB,
      },
      fields: {
        checkin: {},
        checkout: {},
      },
      testResults: {
        fieldsExist: false,
        hasData: false,
        errors: [],
      },
    };

    // Test 1: Verificar si los campos existen leyendo metadatos
    logger.info('Test 1: Verificando existencia de campos GPS');
    
    try {
      // Buscar un registro reciente para probar los campos
      const recentRecords = await odoo.searchRead(
        'hr.attendance',
        [['check_in', '!=', false]],
        ['id', 'employee_id', 'check_in', 'check_out', ...GPS_FIELDS.checkin, ...GPS_FIELDS.checkout],
        { limit: 5 }
      );

      diagnosticResult.testResults.sampleRecords = recentRecords.length;
      
      // Los campos existen si llegamos aquí sin error
      diagnosticResult.testResults.fieldsExist = true;
      
      if (recentRecords.length > 0) {
        
        // Analizar cada campo
        const allFields = [...GPS_FIELDS.checkin, ...GPS_FIELDS.checkout];
        
        allFields.forEach((fieldName) => {
          const category = GPS_FIELDS.checkin.includes(fieldName) ? 'checkin' : 'checkout';
          const fieldData: any = {
            name: fieldName,
            exists: true,
            hasData: false,
            sampleValues: [],
          };

          // Verificar si hay datos en este campo
          recentRecords.forEach((record: any) => {
            if (record[fieldName] !== undefined && record[fieldName] !== null && record[fieldName] !== false) {
              fieldData.hasData = true;
              fieldData.sampleValues.push({
                attendanceId: record.id,
                value: record[fieldName],
                checkIn: record.check_in,
              });
            }
          });

          diagnosticResult.fields[category][fieldName] = fieldData;
          
          if (fieldData.hasData) {
            diagnosticResult.testResults.hasData = true;
          }
        });

        logger.info('Campos GPS encontrados', {
          totalRecords: recentRecords.length,
          fieldsWithData: Object.values(diagnosticResult.fields.checkin).filter((f: any) => f.hasData).length +
                          Object.values(diagnosticResult.fields.checkout).filter((f: any) => f.hasData).length,
        });

      } else {
        // Actualizar mensaje: campos existen pero sin datos para verificar
        diagnosticResult.testResults.errors.push(
          'No hay registros de asistencia para verificar. Haz un check-in de prueba desde la app.'
        );
      }

    } catch (error) {
      logger.error('Error al verificar campos GPS', error as Error);
      
      // Analizar el error para identificar campos faltantes
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('x_latitude') || 
          errorMessage.includes('x_longitude') ||
          errorMessage.includes('x_accuracy')) {
        
        diagnosticResult.testResults.fieldsExist = false;
        diagnosticResult.testResults.errors.push(
          'Los campos GPS NO EXISTEN en Odoo. Debes crearlos siguiendo la guía en ODOO_CAMPOS_GPS.md'
        );
        
        // Identificar campos específicos que faltan
        const missingFields: string[] = [];
        [...GPS_FIELDS.checkin, ...GPS_FIELDS.checkout].forEach(field => {
          if (errorMessage.includes(field)) {
            missingFields.push(field);
          }
        });
        
        diagnosticResult.fields.missing = missingFields.length > 0 ? missingFields : 'Todos los campos GPS';
        
      } else {
        diagnosticResult.testResults.errors.push(errorMessage);
      }
    }

    // Test 2: Verificar ir.model.fields (metadatos de Odoo)
    logger.info('Test 2: Verificando metadatos de campos en ir.model.fields');
    
    try {
      const modelFields = await odoo.searchRead(
        'ir.model.fields',
        [
          ['model', '=', 'hr.attendance'],
          ['name', 'in', [...GPS_FIELDS.checkin, ...GPS_FIELDS.checkout]],
        ],
        ['name', 'field_description', 'ttype', 'state']
      );

      diagnosticResult.metadata = {
        fieldsInModel: modelFields.length,
        expectedFields: 6,
        fields: modelFields,
      };

      if (modelFields.length === 0) {
        diagnosticResult.testResults.errors.push(
          'Los campos GPS no están registrados en ir.model.fields. Debes crearlos en Odoo.'
        );
      } else if (modelFields.length < 6) {
        const foundFields = modelFields.map((f: any) => f.name);
        const missingFields = [...GPS_FIELDS.checkin, ...GPS_FIELDS.checkout].filter(
          f => !foundFields.includes(f)
        );
        
        diagnosticResult.testResults.errors.push(
          `Solo ${modelFields.length} de 6 campos GPS existen. Faltan: ${missingFields.join(', ')}`
        );
      }

      logger.info('Metadatos de campos GPS', {
        found: modelFields.length,
        expected: 6,
      });

    } catch (metadataError) {
      logger.warn('No se pudo verificar metadatos', metadataError as Error);
      diagnosticResult.testResults.errors.push(
        'No se pudo verificar metadatos. Puede que no tengas permisos de administrador.'
      );
    }

    // Generar recomendaciones
    diagnosticResult.recommendations = generateRecommendations(diagnosticResult);

    // Determinar estado general
    if (diagnosticResult.testResults.fieldsExist && diagnosticResult.testResults.hasData) {
      diagnosticResult.status = 'success';
      diagnosticResult.message = '✅ Los campos GPS existen y tienen datos. Todo funciona correctamente.';
    } else if (diagnosticResult.testResults.fieldsExist && !diagnosticResult.testResults.hasData) {
      // Verificar si es por falta de registros o por falta de datos GPS
      const hasAnyRecords = diagnosticResult.testResults.sampleRecords > 0;
      
      if (hasAnyRecords) {
        diagnosticResult.status = 'warning';
        diagnosticResult.message = '⚠️ Los campos GPS existen pero no tienen datos. La app no está enviando coordenadas o hay un problema de permisos.';
      } else {
        diagnosticResult.status = 'info';
        diagnosticResult.message = '📋 Los campos GPS están configurados correctamente. Haz un check-in de prueba para verificar que las coordenadas se guarden.';
      }
    } else {
      diagnosticResult.status = 'error';
      diagnosticResult.message = '❌ Los campos GPS NO EXISTEN en Odoo. Debes crearlos siguiendo la guía.';
    }

    return NextResponse.json(diagnosticResult);

  } catch (error) {
    logger.error('Error en diagnóstico GPS', error as Error);
    
    return NextResponse.json(
      {
        success: false,
        error: 'Error al ejecutar diagnóstico',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

function generateRecommendations(diagnostic: any): string[] {
  const recommendations: string[] = [];
  const hasAnyRecords = diagnostic.testResults.sampleRecords > 0;

  if (!diagnostic.testResults.fieldsExist) {
    recommendations.push(
      '1. CREAR CAMPOS GPS: Los campos no existen. Sigue la guía en ODOO_CAMPOS_GPS.md'
    );
    recommendations.push(
      '2. MÉTODO RÁPIDO: Ejecuta el script SQL proporcionado en la documentación'
    );
    recommendations.push(
      '3. REINICIAR ODOO: Después de crear los campos, reinicia el servicio de Odoo'
    );
    recommendations.push(
      '4. VERIFICAR: Vuelve a ejecutar este diagnóstico para confirmar'
    );
  } else if (diagnostic.testResults.fieldsExist && !diagnostic.testResults.hasData && hasAnyRecords) {
    recommendations.push(
      '1. VERIFICAR GPS EN LA APP: Asegúrate de que la app tiene permiso para acceder a la ubicación'
    );
    recommendations.push(
      '2. REVISAR LOGS: Revisa los logs del servidor para ver si hay errores al guardar GPS'
    );
    recommendations.push(
      '3. PROBAR CHECK-IN: Registra una nueva entrada desde la app y verifica si las coordenadas se guardan'
    );
    recommendations.push(
      '4. VERIFICAR PERMISOS ODOO: Confirma que el usuario tiene permisos de escritura en hr.attendance'
    );
  } else if (diagnostic.testResults.fieldsExist && !hasAnyRecords) {
    recommendations.push(
      '✅ Los campos GPS están configurados correctamente en Odoo'
    );
    recommendations.push(
      '📍 SIGUIENTE PASO: Haz un check-in desde la app (asegúrate de permitir acceso a ubicación)'
    );
    recommendations.push(
      '🔍 Después del check-in, vuelve a ejecutar este diagnóstico para verificar que las coordenadas se guardaron'
    );
  } else if (diagnostic.metadata && diagnostic.metadata.fieldsInModel < 6) {
    recommendations.push(
      `FALTAN ${6 - diagnostic.metadata.fieldsInModel} CAMPOS: ${diagnostic.fields.missing || 'Desconocidos'}`
    );
    recommendations.push(
      'Crea los campos faltantes siguiendo la guía en ODOO_CAMPOS_GPS.md'
    );
  } else {
    recommendations.push(
      '✅ Todo está configurado correctamente'
    );
    recommendations.push(
      '📍 Los campos GPS existen y están recibiendo datos'
    );
  }

  return recommendations;
}
