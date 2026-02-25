# 🔍 Solución: Coordenadas GPS no se guardan en Odoo

## 📊 Diagnóstico del Problema

**Síntoma:** La aplicación funciona correctamente, pero las coordenadas GPS (latitud/longitud) no aparecen en Odoo.

**Causa raíz:** Los campos personalizados GPS **NO EXISTEN** en el modelo `hr.attendance` de Odoo.

---

## ✅ PASO 1: Ejecutar Diagnóstico Automático

He creado un endpoint que verifica si los campos GPS existen en Odoo:

### Ejecutar desde el navegador:

```
http://localhost:3000/api/diagnostic/gps-fields
```

O desde la terminal:

```bash
curl http://localhost:3000/api/diagnostic/gps-fields
```

### Interpretación de resultados:

#### ✅ TODO BIEN (status: "success")
```json
{
  "status": "success",
  "message": "✅ Los campos GPS existen y tienen datos. Todo funciona correctamente.",
  "testResults": {
    "fieldsExist": true,
    "hasData": true
  }
}
```
**No necesitas hacer nada más.**

#### ⚠️ CAMPOS EXISTEN PERO SIN DATOS (status: "warning")
```json
{
  "status": "warning",
  "message": "⚠️ Los campos GPS existen pero no tienen datos.",
  "testResults": {
    "fieldsExist": true,
    "hasData": false
  }
}
```
**Los campos existen, verifica permisos o que la app esté enviando coordenadas.**

#### ❌ CAMPOS NO EXISTEN (status: "error")
```json
{
  "status": "error",
  "message": "❌ Los campos GPS NO EXISTEN en Odoo. Debes crearlos.",
  "testResults": {
    "fieldsExist": false,
    "hasData": false
  }
}
```
**DEBES CREAR LOS CAMPOS GPS (ve al Paso 2).**

---

## 🔧 PASO 2: Crear Campos GPS en Odoo

Si el diagnóstico indica que **los campos NO existen**, tienes 3 opciones:

### ⚡ OPCIÓN A: Script SQL Rápido (RECOMENDADO)

**Requisito:** Acceso a PostgreSQL

1. **Conectar a la base de datos:**
   ```bash
   psql -U odoo -d db_akallpa_nueva
   ```

2. **Ejecutar este script:**
   ```sql
   -- Crear columnas en la tabla
   ALTER TABLE hr_attendance 
   ADD COLUMN IF NOT EXISTS x_latitude NUMERIC(10,7),
   ADD COLUMN IF NOT EXISTS x_longitude NUMERIC(10,7),
   ADD COLUMN IF NOT EXISTS x_accuracy NUMERIC(10,2),
   ADD COLUMN IF NOT EXISTS x_latitude_out NUMERIC(10,7),
   ADD COLUMN IF NOT EXISTS x_longitude_out NUMERIC(10,7),
   ADD COLUMN IF NOT EXISTS x_accuracy_out NUMERIC(10,2);

   -- Registrar campos en Odoo (metadatos)
   DO $$
   DECLARE model_id INTEGER;
   BEGIN
       SELECT id INTO model_id FROM ir_model WHERE model = 'hr.attendance';
       
       INSERT INTO ir_model_fields (name, model_id, model, field_description, ttype, state, store)
       VALUES ('x_latitude', model_id, 'hr.attendance', 'Latitud Entrada', 'float', 'manual', true)
       ON CONFLICT (name, model_id) DO NOTHING;
       
       INSERT INTO ir_model_fields (name, model_id, model, field_description, ttype, state, store)
       VALUES ('x_longitude', model_id, 'hr.attendance', 'Longitud Entrada', 'float', 'manual', true)
       ON CONFLICT (name, model_id) DO NOTHING;
       
       INSERT INTO ir_model_fields (name, model_id, model, field_description, ttype, state, store)
       VALUES ('x_accuracy', model_id, 'hr.attendance', 'Precisión Entrada (m)', 'float', 'manual', true)
       ON CONFLICT (name, model_id) DO NOTHING;
       
       INSERT INTO ir_model_fields (name, model_id, model, field_description, ttype, state, store)
       VALUES ('x_latitude_out', model_id, 'hr.attendance', 'Latitud Salida', 'float', 'manual', true)
       ON CONFLICT (name, model_id) DO NOTHING;
       
       INSERT INTO ir_model_fields (name, model_id, model, field_description, ttype, state, store)
       VALUES ('x_longitude_out', model_id, 'hr.attendance', 'Longitud Salida', 'float', 'manual', true)
       ON CONFLICT (name, model_id) DO NOTHING;
       
       INSERT INTO ir_model_fields (name, model_id, model, field_description, ttype, state, store)
       VALUES ('x_accuracy_out', model_id, 'hr.attendance', 'Precisión Salida (m)', 'float', 'manual', true)
       ON CONFLICT (name, model_id) DO NOTHING;
   END $$;
   ```

3. **Reiniciar Odoo:**
   ```bash
   sudo systemctl restart odoo
   ```

4. **Verificar:** Ejecuta el diagnóstico nuevamente.

---

### 🖱️ OPCIÓN B: Interfaz de Odoo (Manual)

**Requisito:** Acceso de administrador a Odoo

1. **Activar Modo Desarrollador:**
   - Ir a **Ajustes** ⚙️
   - Scroll hasta el final
   - Clic en **"Activar modo de desarrollador"**

2. **Navegar a Modelos:**
   - **Ajustes** > **Técnico** > **Estructura de Base de Datos** > **Modelos**
   - Buscar: `hr.attendance`
   - Hacer clic en el modelo

3. **Crear los 6 campos:**

   Ve a la pestaña **"Campos"** y crea cada uno:

   | Nombre | Descripción | Tipo | Dígitos |
   |--------|-------------|------|---------|
   | `x_latitude` | Latitud Entrada | Float | 10, 7 |
   | `x_longitude` | Longitud Entrada | Float | 10, 7 |
   | `x_accuracy` | Precisión Entrada (metros) | Float | 10, 2 |
   | `x_latitude_out` | Latitud Salida | Float | 10, 7 |
   | `x_longitude_out` | Longitud Salida | Float | 10, 7 |
   | `x_accuracy_out` | Precisión Salida (metros) | Float | 10, 2 |

   **Para cada campo:**
   - Clic en **"Crear"** o **"Añadir una línea"**
   - Completar los datos según la tabla
   - **Guardar**

4. **Verificar:** 
   - Ir a **Asistencias** (Employees > Attendances)
   - Los campos deberían aparecer (aunque vacíos)

---

### 🎨 OPCIÓN C: Módulo Personalizado (Profesional)

Ver la guía completa en [`ODOO_CAMPOS_GPS.md`](ODOO_CAMPOS_GPS.md) sección "Método 3".

Esta opción crea un módulo Odoo que puedes instalar/desinstalar fácilmente.

---

## 🧪 PASO 3: Verificar que Funciona

### 3.1. Ejecutar diagnóstico nuevamente

```bash
curl http://localhost:3000/api/diagnostic/gps-fields
```

Deberías ver: `"status": "success"` o al menos `"fieldsExist": true`

### 3.2. Probar check-in con GPS

1. Desde la app, registra una entrada
2. Revisa los logs del servidor:
   ```
   ℹ️ [INFO] Check-in con geolocalización
     "latitude": "-12.449162",
     "longitude": "-76.755698",
     "accuracy": "79.00"
   ```

### 3.3. Verificar en Odoo

**Opción A: SQL**
```sql
SELECT id, check_in, x_latitude, x_longitude, x_accuracy
FROM hr_attendance
WHERE x_latitude IS NOT NULL
ORDER BY id DESC
LIMIT 5;
```

**Opción B: Interfaz Odoo**
- Ir a **Asistencias**
- Abrir un registro reciente
- Ver los campos GPS (si creaste la vista personalizada)

---

## 🔍 Análisis Técnico

### ✅ La App SÍ Envía las Coordenadas

Código en [`app/api/assistance/in/route.ts`](app/api/assistance/in/route.ts:171-187):

```typescript
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
}
```

Los logs confirman que las coordenadas se reciben:
```
ℹ️ [INFO] Check-in con geolocalización
  "latitude": "-12.449162",
  "longitude": "-76.755698",
  "accuracy": "79.00"
```

### ❌ El Problema: Campos No Existen en Odoo

Odoo **silenciosamente ignora** campos que no existen. Por eso:
- ✅ El check-in tiene éxito (200 OK)
- ✅ El registro se crea en `hr_attendance`
- ❌ Pero los campos `x_latitude`, `x_longitude`, `x_accuracy` no se guardan

**Solución:** Crear los campos personalizados en Odoo.

---

## 📊 Campos GPS Requeridos

| Campo | Tipo | Precisión | Uso |
|-------|------|-----------|-----|
| `x_latitude` | Float | (10, 7) | Latitud al marcar **entrada** |
| `x_longitude` | Float | (10, 7) | Longitud al marcar **entrada** |
| `x_accuracy` | Float | (10, 2) | Precisión GPS en metros (**entrada**) |
| `x_latitude_out` | Float | (10, 7) | Latitud al marcar **salida** |
| `x_longitude_out` | Float | (10, 7) | Longitud al marcar **salida** |
| `x_accuracy_out` | Float | (10, 2) | Precisión GPS en metros (**salida**) |

**Nota:** Actualmente la app solo usa los campos de entrada (`x_latitude`, `x_longitude`, `x_accuracy`). Los campos de salida están preparados para futuras implementaciones.

---

## 🎯 Checklist de Verificación

- [ ] Ejecutar diagnóstico: `GET /api/diagnostic/gps-fields`
- [ ] Si `fieldsExist: false`, crear campos GPS en Odoo
- [ ] Reiniciar Odoo después de crear campos
- [ ] Ejecutar diagnóstico nuevamente → debe mostrar `fieldsExist: true`
- [ ] Probar check-in desde la app
- [ ] Verificar logs: debe mostrar "Check-in con geolocalización"
- [ ] Verificar en Odoo: coordenadas deben estar guardadas

---

## 🆘 Troubleshooting

### Problema: "No tengo acceso a PostgreSQL"
**Solución:** Usa la Opción B (interfaz de Odoo) o contacta al administrador del servidor.

### Problema: "No puedo activar Modo Desarrollador"
**Solución:** Tu usuario necesita permisos de administrador en Odoo.

### Problema: "Los campos se crearon pero no tienen datos"
**Posibles causas:**
1. **Permisos:** El usuario de Odoo no tiene permisos de escritura
2. **Versión de Odoo:** Algunos campos pueden tener restricciones
3. **Cache:** Limpia el cache del navegador y reinicia Odoo

**Verificación:**
```bash
# Ver logs del servidor Next.js
# Deberías ver: "Check-in con geolocalización"
```

### Problema: "Error al ejecutar script SQL"
**Solución:** Verifica que:
- El nombre de la base de datos sea correcto: `db_akallpa_nueva`
- El usuario tenga permisos de administrador de PostgreSQL
- Odoo esté detenido antes de ejecutar el script (opcional pero recomendado)

---

## 📚 Referencias

- [`ODOO_CAMPOS_GPS.md`](ODOO_CAMPOS_GPS.md) - Guía detallada paso a paso
- [`app/api/assistance/in/route.ts`](app/api/assistance/in/route.ts) - Código de check-in con GPS
- [`app/api/diagnostic/gps-fields/route.ts`](app/api/diagnostic/gps-fields/route.ts) - Endpoint de diagnóstico
- [`hooks/useGeolocation.ts`](hooks/useGeolocation.ts) - Hook que captura coordenadas GPS

---

## ✅ Resumen Ejecutivo

1. **La aplicación funciona correctamente** y envía las coordenadas GPS
2. **El problema está en Odoo:** los campos GPS no existen
3. **Solución:** Ejecutar el script SQL para crear los 6 campos
4. **Verificación:** Usar el endpoint de diagnóstico `/api/diagnostic/gps-fields`
5. **Tiempo estimado:** 5-10 minutos

**Comando rápido completo:**
```bash
# 1. Crear campos
psql -U odoo -d db_akallpa_nueva -f create_gps_fields.sql

# 2. Reiniciar Odoo
sudo systemctl restart odoo

# 3. Verificar
curl http://localhost:3000/api/diagnostic/gps-fields
```

¡Listo! 🎉
