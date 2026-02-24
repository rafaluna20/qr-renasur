# 📍 Implementación de Geolocalización en Asistencias

## Resumen

Se ha implementado el seguimiento de ubicación GPS cuando los empleados marcan entrada/salida de asistencia. Esta funcionalidad permite:

- ✅ Capturar coordenadas GPS (latitud/longitud) al marcar entrada
- ✅ Capturar coordenadas GPS al marcar salida
- ✅ Precisión de ubicación (accuracy en metros)
- ✅ Funciona sin ubicación si el usuario deniega permisos
- ✅ Almacena coordenadas en campos personalizados de Odoo

---

## 🏗️ Arquitectura

### 1. Frontend - Hook Personalizado

**Archivo:** [`hooks/useGeolocation.ts`](hooks/useGeolocation.ts)

Hook React que utiliza la API de Geolocation del navegador:

```typescript
const { getLocation, error, loading } = useGeolocation();

// Obtener ubicación
const coords = await getLocation();
// coords = { latitude, longitude, accuracy, timestamp, ... }
```

**Características:**
- ✅ Promesas asíncronas para ubicación
- ✅ Manejo de errores específicos (permiso denegado, timeout, no disponible)
- ✅ Alta precisión (GPS si está disponible)
- ✅ Timeout de 10 segundos
- ✅ Sin caché (ubicación siempre actualizada)

**Utilidades adicionales:**
- `calculateDistance(lat1, lon1, lat2, lon2)` - Calcular distancia entre dos puntos (Haversine)
- `formatCoordinates(lat, lng, decimals)` - Formatear coordenadas para mostrar

### 2. Frontend - Integración en UI

**Archivo:** [`app/page.tsx`](app/page.tsx:767)

La función `executeAssistance()` en el componente `UserDashboard`:

```typescript
const executeAssistance = async () => {
  // 1. Obtener ubicación GPS
  setStatus({ type: 'loading', message: 'Obteniendo ubicación...' });
  const coords = await getLocation();
  
  // 2. Preparar datos con ubicación (si está disponible)
  const locationData = coords ? {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy,
  } : {};
  
  // 3. Enviar a API con coordenadas
  await fetch('/api/assistance/in', {
    method: 'POST',
    body: JSON.stringify({ userId, ...locationData }),
  });
};
```

**Comportamiento:**
- 🟢 Si el usuario **permite** ubicación: se envían coordenadas
- 🟡 Si el usuario **deniega** ubicación: continúa sin coordenadas (no bloquea el registro)
- 🔴 Si hay **error de GPS**: muestra advertencia pero permite continuar

### 3. Backend - API de Entrada

**Archivo:** [`app/api/assistance/in/route.ts`](app/api/assistance/in/route.ts)

Schema Zod actualizado para aceptar coordenadas opcionales:

```typescript
const checkInSchema = z.object({
  userId: z.number().positive(),
  latitude: z.number().optional(),   // ← Nuevo
  longitude: z.number().optional(),  // ← Nuevo
  accuracy: z.number().optional(),   // ← Nuevo
});
```

**Lógica de guardado:**

```typescript
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
}

await odoo.create('hr.attendance', attendanceData);
```

### 4. Backend - API de Salida

**Archivo:** [`app/api/assistance/out/route.ts`](app/api/assistance/out/route.ts)

Similar a la entrada, pero con campos diferentes:

```typescript
const updateData: Record<string, any> = {
  check_out: checkOut,
};

// Coordenadas de salida (campos separados)
if (latitude !== undefined && longitude !== undefined) {
  updateData.x_latitude_out = latitude;   // ← Salida
  updateData.x_longitude_out = longitude; // ← Salida
  updateData.x_accuracy_out = accuracy;   // ← Salida
}

await odoo.write('hr.attendance', [registryId], updateData);
```

---

## 🗄️ Campos Personalizados en Odoo

Para que funcione correctamente, el modelo `hr.attendance` en Odoo debe tener estos campos personalizados:

### Campos de Entrada (Check-in)

```python
# En el modelo hr.attendance
x_latitude = fields.Float(
    string='Latitud Entrada',
    digits=(10, 7),  # 7 decimales de precisión (~11mm)
    help='Latitud GPS al momento del check-in'
)

x_longitude = fields.Float(
    string='Longitud Entrada',
    digits=(10, 7),
    help='Longitud GPS al momento del check-in'
)

x_accuracy = fields.Float(
    string='Precisión Entrada (metros)',
    help='Precisión de la ubicación en metros'
)
```

### Campos de Salida (Check-out)

```python
x_latitude_out = fields.Float(
    string='Latitud Salida',
    digits=(10, 7),
    help='Latitud GPS al momento del check-out'
)

x_longitude_out = fields.Float(
    string='Longitud Salida',
    digits=(10, 7),
    help='Longitud GPS al momento del check-out'
)

x_accuracy_out = fields.Float(
    string='Precisión Salida (metros)',
    help='Precisión de la ubicación en metros al salir'
)
```

### Script SQL para Agregar Campos (Alternativa)

Si no puedes crear módulo personalizado, ejecuta en PostgreSQL:

```sql
-- Campos de entrada
ALTER TABLE hr_attendance 
ADD COLUMN IF NOT EXISTS x_latitude NUMERIC(10,7),
ADD COLUMN IF NOT EXISTS x_longitude NUMERIC(10,7),
ADD COLUMN IF NOT EXISTS x_accuracy NUMERIC(10,2);

-- Campos de salida
ALTER TABLE hr_attendance 
ADD COLUMN IF NOT EXISTS x_latitude_out NUMERIC(10,7),
ADD COLUMN IF NOT EXISTS x_longitude_out NUMERIC(10,7),
ADD COLUMN IF NOT EXISTS x_accuracy_out NUMERIC(10,2);

-- Actualizar metadatos en Odoo
UPDATE ir_model_fields 
SET state = 'manual' 
WHERE model = 'hr.attendance' 
AND name LIKE 'x_latitude%' OR name LIKE 'x_longitude%' OR name LIKE 'x_accuracy%';
```

---

## 🔒 Permisos del Navegador

### Solicitud de Permisos

La primera vez que un usuario marca asistencia, el navegador solicitará permiso:

```
┌─────────────────────────────────────────┐
│ 🌍 [Sitio] quiere usar tu ubicación    │
│                                         │
│ [Permitir]  [Bloquear]                 │
└─────────────────────────────────────────┘
```

### Estados Posibles

| Estado | Comportamiento | Resultado |
|--------|----------------|-----------|
| **Permitir** | ✅ Captura coordenadas | Asistencia con ubicación |
| **Bloquear** | ⚠️ Muestra advertencia | Asistencia sin ubicación |
| **Timeout** | ⏱️ Después de 10s | Asistencia sin ubicación |

### Reactivar Permisos Bloqueados

Si el usuario bloqueó los permisos, debe habilitarlos manualmente:

**Chrome/Edge:**
1. Clic en el candado 🔒 a la izquierda de la URL
2. Ir a "Configuración del sitio"
3. Cambiar "Ubicación" a "Permitir"

**Firefox:**
1. Clic en el candado 🔒
2. "Conexión segura" > "Más información"
3. "Permisos" > Ubicación > "Permitir"

**Safari:**
1. Safari > Preferencias
2. "Sitios web" > "Ubicación"
3. Seleccionar el sitio y cambiar a "Permitir"

---

## 📊 Flujo de Datos Completo

```
┌─────────────────────┐
│  Usuario presiona   │
│  "Marcar Asistencia"│
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Frontend solicita   │
│ ubicación GPS       │◄─── navigator.geolocation.getCurrentPosition()
└──────────┬──────────┘
           │
           ├─── ✅ Éxito: { lat, lng, accuracy }
           │
           └─── ❌ Error: null (pero continúa)
           │
           ▼
┌─────────────────────┐
│ Frontend envía      │
│ POST /api/assistance│
│ { userId, lat, lng }│
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Backend valida      │
│ con Zod schema      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Backend guarda en   │
│ Odoo hr.attendance  │
│ x_latitude, x_longitude
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Respuesta al usuario│
│ "Entrada registrada │
│  (Ubicación: ...)  "│
└─────────────────────┘
```

---

## 🧪 Pruebas

### 1. Prueba Manual - Con Ubicación

1. Abrir `http://localhost:3000`
2. Login como empleado
3. Hacer clic en "Marcar Asistencia"
4. Permitir ubicación cuando el navegador lo solicite
5. Verificar mensaje: "¡Entrada registrada a las HH:MM! (Ubicación: -12.xxxxx, -77.xxxxx)"

### 2. Prueba Manual - Sin Ubicación

1. Bloquear permisos de ubicación en el navegador
2. Hacer clic en "Marcar Asistencia"
3. Verificar que funciona sin bloquear: "¡Entrada registrada a las HH:MM! (Sin ubicación)"

### 3. Verificar en Odoo

```sql
SELECT 
  id,
  employee_id,
  check_in,
  check_out,
  x_latitude as lat_in,
  x_longitude as lng_in,
  x_accuracy as acc_in,
  x_latitude_out as lat_out,
  x_longitude_out as lng_out,
  x_accuracy_out as acc_out
FROM hr_attendance
ORDER BY check_in DESC
LIMIT 10;
```

### 4. Prueba de Precisión

Valores típicos de `accuracy`:

| Tipo | Precisión (metros) |
|------|-------------------|
| GPS puro | 5-20m |
| WiFi | 20-100m |
| Red móvil | 100-1000m |
| IP (fallback) | >1000m |

---

## 🌍 Casos de Uso

### 1. Control de Presencia Física

Verificar que el empleado esté en la ubicación correcta:

```typescript
import { calculateDistance } from '@/hooks';

const OFFICE_LAT = -12.046374;
const OFFICE_LNG = -77.042793;
const MAX_DISTANCE = 100; // 100 metros

const distance = calculateDistance(
  OFFICE_LAT, OFFICE_LNG,
  coords.latitude, coords.longitude
);

if (distance > MAX_DISTANCE) {
  alert(`Estás a ${Math.round(distance)}m de la oficina. Acércate más.`);
}
```

### 2. Reportes de Movilidad

Analizar desde dónde marcan los empleados:

```sql
SELECT 
  employee_id,
  COUNT(*) as check_ins,
  AVG(x_latitude) as avg_lat,
  AVG(x_longitude) as avg_lng,
  AVG(x_accuracy) as avg_precision
FROM hr_attendance
WHERE x_latitude IS NOT NULL
GROUP BY employee_id;
```

### 3. Auditoría de Ubicaciones

Detectar anomalías (múltiples ubicaciones muy distantes el mismo día):

```sql
SELECT 
  a1.employee_id,
  a1.check_in,
  a1.x_latitude as lat1,
  a1.x_longitude as lng1,
  a2.check_in,
  a2.x_latitude as lat2,
  a2.x_longitude as lng2
FROM hr_attendance a1
JOIN hr_attendance a2 
  ON a1.employee_id = a2.employee_id 
  AND DATE(a1.check_in) = DATE(a2.check_in)
  AND a1.id < a2.id
WHERE a1.x_latitude IS NOT NULL 
  AND a2.x_latitude IS NOT NULL;
```

---

## ⚠️ Consideraciones

### Privacidad

- 🔒 Las coordenadas solo se capturan al marcar asistencia (no rastreo continuo)
- 🔒 El usuario debe dar permiso explícito
- 🔒 Se almacenan solo en la base de datos de Odoo (no terceros)
- 🔒 Cumple con GDPR/LOPD si se informa al empleado

### Precisión

- 📍 GPS en exteriores: ±5-20 metros
- 📍 WiFi en interiores: ±20-100 metros  
- 📍 Dispositivos móviles suelen ser más precisos que laptops

### Limitaciones

- ❌ No funciona en navegadores antiguos (IE11)
- ❌ Requiere HTTPS en producción (no HTTP)
- ❌ Puede fallar en interiores sin WiFi
- ❌ Consume batería en dispositivos móviles

---

## 🚀 Mejoras Futuras

### 1. Geofencing (Cerca Virtual)

Validar que el empleado esté dentro de un radio:

```typescript
// TODO: Implementar en v2.1
if (distance > MAX_RADIUS) {
  throw new Error('Debes estar en la oficina para marcar asistencia');
}
```

### 2. Mapas Interactivos

Mostrar ubicaciones en un mapa:

```tsx
// TODO: Integrar Google Maps o Mapbox
<Map 
  center={[coords.latitude, coords.longitude]}
  markers={attendanceHistory}
/>
```

### 3. Tracking de Ruta

Para empleados en campo, rastrear la ruta del día:

```typescript
// TODO: Implementar tracking continuo opcional
const routeTracker = useRouteTracking({
  interval: 5 * 60 * 1000, // Cada 5 minutos
  enabled: userRole === 'field_worker'
});
```

### 4. Alertas de Ubicación Sospechosa

Machine Learning para detectar patrones anómalos:

```python
# TODO: Script Python para análisis
from sklearn.cluster import DBSCAN

# Detectar si un empleado marca desde ubicaciones inusuales
clusters = DBSCAN(eps=0.01).fit(coordinates)
```

---

## 📚 Referencias

- [MDN: Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API)
- [Haversine Formula](https://en.wikipedia.org/wiki/Haversine_formula)
- [GPS Accuracy](https://www.gps.gov/systems/gps/performance/accuracy/)
- [HTTPS Requirement](https://developer.chrome.com/blog/geolocation-on-secure-contexts-only/)

---

## 📝 Changelog

### v2.1.0 - 2026-02-10

- ✅ Implementado hook `useGeolocation`
- ✅ Captura de coordenadas en entrada/salida
- ✅ Almacenamiento en Odoo (`x_latitude`, `x_longitude`, `x_accuracy`)
- ✅ Manejo de errores sin bloquear el registro
- ✅ Feedback visual de ubicación en mensajes de éxito
- ✅ Campos separados para entrada y salida
- ✅ Documentación completa

---

**Implementado por:** Roo AI Assistant  
**Fecha:** 10 de Febrero, 2026  
**Versión:** 2.1.0
