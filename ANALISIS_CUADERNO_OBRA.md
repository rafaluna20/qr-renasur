# Análisis de la Funcionalidad: Cuaderno de Obra Digital

## 📋 Resumen Ejecutivo

La aplicación implementa un **Cuaderno de Obra Digital** completo que permite registrar, gestionar y aprobar asientos de obra con capacidades offline-first, geolocalización GPS, firmas digitales y sincronización con Odoo ERP.

---

## 🏗️ Arquitectura General

### Componentes Principales

1. **Frontend (Next.js/React)**
   - [`app/cuaderno/nuevo/page.tsx`](app/cuaderno/nuevo/page.tsx) - Formulario de creación de asientos

2. **Capa de Persistencia Offline**
   - [`lib/cuaderno/offline-storage.ts`](lib/cuaderno/offline-storage.ts) - IndexedDB para almacenamiento local

3. **API Endpoints (Next.js API Routes)**
   - [`/api/cuaderno/sync`](app/api/cuaderno/sync/route.ts) - Sincronización con Odoo
   - [`/api/cuaderno/list`](app/api/cuaderno/list/route.ts) - Listar asientos
   - [`/api/cuaderno/approve`](app/api/cuaderno/approve/route.ts) - Aprobar asiento
   - [`/api/cuaderno/reject`](app/api/cuaderno/reject/route.ts) - Rechazar/Observar asiento
   - [`/api/cuaderno/resolve`](app/api/cuaderno/resolve/route.ts) - Subsanar observaciones
   - [`/api/cuaderno/list-cuadernos`](app/api/cuaderno/list-cuadernos/route.ts) - Listar cuadernos disponibles
   - [`/api/cuaderno/upload_photo`](app/api/cuaderno/upload_photo/route.ts) - Subir fotografías

4. **Backend (Odoo ERP)**
   - Modelo: `obra.cuaderno` (proyectos/obras)
   - Modelo: `obra.cuaderno.asiento` (registros diarios)

---

## 📝 Flujo de Trabajo Completo

### 1. Creación de Asiento (Residente de Obra)

#### Paso 1: Inicialización del Formulario
```typescript
// Al cargar la página:
1. Se obtiene la ubicación GPS (no bloquea el formulario si falla)
2. Se carga la lista de cuadernos desde Odoo
3. Se verifica el estado de conectividad (online/offline)
4. Se cuentan los asientos pendientes de sincronizar
```

#### Paso 2: Captura de Datos
El formulario captura:
- **Cuaderno de Obra** (selección desde Odoo)
- **Fecha** (automática: fecha actual)
- **Clima** (soleado, nublado, lluvia ligera, lluvia fuerte)
- **Personal** (resumen textual, ej: "1 Ing. Residente, 5 Peones")
- **Equipos/Maquinaria** (resumen textual)
- **Ocurrencias** (descripción detallada del día)
- **GPS** (coordenadas + precisión, opcional)
- **Hash de Seguridad** (SHA-256 de datos clave)

#### Paso 3: Guardado Offline-First
```typescript
// Estrategia implementada:
1. Guardar PRIMERO en IndexedDB (local)
2. Intentar sincronización inmediata si hay conexión
3. Si falla la sincronización, mantener en cola local
4. Notificar al usuario del estado actual
```

#### Paso 4: Sincronización con Odoo
```typescript
// Lógica en dos fases:
Fase 1: Crear registro en Odoo en estado 'draft'
Fase 2: Transición a 'signed_residente' mediante método del workflow
```

**Ventajas de este enfoque:**
- ✅ Respeta las validaciones del workflow de Odoo
- ✅ Evita errores de campos protegidos
- ✅ Permite rollback parcial (registro creado pero no firmado)

---

### 2. Gestión de Estados del Asiento

#### Estados en el Workflow

```
draft (borrador)
    ↓
signed_residente (firmado por residente)
    ↓
    ├──→ approved (aprobado por supervisor)
    └──→ rejected (observado por supervisor)
            ↓
         resolved (subsanado por residente)
            ↓
         signed_residente (nuevamente pendiente de revisión)
```

#### Transiciones Implementadas

| Acción | Método Odoo | Endpoint | Usuario |
|--------|-------------|----------|---------|
| Firmar | `action_sign_residente` | `/api/cuaderno/sync` | Residente |
| Aprobar | `action_approve_supervisor` | `/api/cuaderno/approve` | Supervisor |
| Observar | `action_reject` | `/api/cuaderno/reject` | Supervisor |
| Subsanar | `action_resolve` | `/api/cuaderno/resolve` | Residente |

---

### 3. Sincronización Offline

#### Arquitectura Offline-First

**IndexedDB Storage:**
```typescript
interface AsientoOffline {
    offline_uuid: string;        // UUID local único
    cuaderno_id: string;         // ID del cuaderno en Odoo
    date: string;                // Fecha del asiento
    clima: string;               // Condición climática
    personal: string;            // Resumen de personal
    equipos: string;             // Resumen de equipos
    ocurrencias: string;         // Descripción detallada
    latitude: number;            // GPS latitud
    longitude: number;           // GPS longitud
    gps_accuracy: number;        // Precisión GPS
    state: string;               // Estado del asiento
    residente_id?: string;       // ID del residente
    created_at: number;          // Timestamp de creación
    synced: boolean;             // Estado de sincronización
    security_hash: string;       // Hash SHA-256
    photos?: Array;              // Fotos adjuntas (base64)
}
```

#### Proceso de Sincronización

**1. Detección de Pendientes**
```typescript
// Se consultan asientos con synced: false
const pending = await getUnsyncedAsientos();
```

**2. Envío en Lote**
```typescript
// Se envían todos los pendientes en una sola petición
POST /api/cuaderno/sync
Body: { asientos: [asiento1, asiento2, ...] }
```

**3. Procesamiento Individual**
```typescript
// El backend procesa cada asiento:
for (const asiento of asientos) {
    try {
        // Crear en Odoo (draft)
        const id = await odoo.create('obra.cuaderno.asiento', vals);
        
        // Transición de estado si corresponde
        if (asiento.state === 'signed_residente') {
            await odoo.execute_kw('obra.cuaderno.asiento', 
                'action_sign_residente', [[id]], {});
        }
        
        result = { status: 'success', odoo_id: id };
    } catch (error) {
        result = { status: 'error', error: error.message };
    }
}
```

**4. Marcado como Sincronizado**
```typescript
// Solo se eliminan de IndexedDB los exitosos
for (const success of successfulUuids) {
    await markAsientoSynced(success);
}
```

#### Manejo de Errores

**Tipos de resultado:**
- `success` - Creado y firmado correctamente
- `success_partial` - Creado pero no firmado (requiere revisión manual)
- `error` - No se pudo crear (permanece en cola)

**Estrategia de Reintento:**
- Los asientos con error permanecen en IndexedDB
- Se pueden reintentar manualmente desde la UI
- Sincronización automática cuando se detecta conexión

---

### 4. Sistema de GPS y Geolocalización

#### Obtención de Coordenadas

```typescript
// Configuración GPS
navigator.geolocation.getCurrentPosition(
    callback,
    errorCallback,
    {
        enableHighAccuracy: true,  // Precisión máxima
        timeout: 15000             // 15 segundos máximo
    }
);
```

#### Estados del GPS

| Estado | Descripción | Acción |
|--------|-------------|--------|
| `idle` | No iniciado | Se muestra indicador gris |
| `loading` | Obteniendo ubicación | Indicador animado amarillo |
| `ok` | GPS obtenido | Indicador verde + coordenadas |
| `error` | Sin GPS | Indicador rojo, **el formulario sigue disponible** |

**⚠️ Importante:** El GPS es **opcional**. Si falla:
- El asiento se guarda con coordenadas en 0
- Se notifica al usuario pero no se bloquea el envío
- Odoo acepta valores vacíos en campos GPS

#### Almacenamiento en Odoo

Campos GPS en `obra.cuaderno.asiento`:
- `latitude` (Float) - Latitud decimal
- `longitude` (Float) - Longitud decimal
- `gps_accuracy` (Float) - Precisión en metros

---

### 5. Sistema de Fotografías

#### Flujo de Subida de Fotos

```typescript
// 1. Captura en el dispositivo (base64)
const photo = { 
    name: 'foto_obra.jpg',
    base64: '...',
    mimetype: 'image/jpeg'
};

// 2. Almacenamiento temporal con el asiento
asiento.photos = [photo];

// 3. Subida a Odoo después de la sincronización
POST /api/cuaderno/upload_photo
{
    asiento_id: 123,
    file_name: 'foto_obra.jpg',
    file_base64: '...',
    mimetype: 'image/jpeg'
}

// 4. Creación de adjunto en Odoo
ir.attachment {
    name: 'foto_obra.jpg',
    type: 'binary',
    datas: base64,
    res_model: 'obra.cuaderno.asiento',
    res_id: 123
}
```

**Ventajas:**
- ✅ Las fotos se guardan localmente con el asiento
- ✅ Se sincronizan automáticamente cuando hay conexión
- ✅ Se vinculan al registro específico en Odoo

---

### 6. Sistema de Firmas Digitales

#### Hash de Seguridad (SHA-256)

```typescript
// Entrada para el hash
const hashInput = `${date}|${latitude},${longitude}|${ocurrencias}`;

// Generación
const encoder = new TextEncoder();
const data = encoder.encode(hashInput);
const hashBuffer = await crypto.subtle.digest('SHA-256', data);
const hashArray = Array.from(new Uint8Array(hashBuffer));
const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
```

**Propósito:**
- Integridad de datos
- Verificación de no-alteración
- Auditoría forense

**Almacenamiento:**
- Campo: `x_hash_seguridad` en Odoo
- Se calcula en el cliente antes de guardar
- Se verifica en Odoo para detección de manipulación

---

### 7. Permisos y Roles

#### Filtrado por Usuario

```typescript
// Supervisores ven todos los asientos
const domain = role === 'supervisor' 
    ? []
    : [['residente_id', '=', employeeId]];

// Residentes solo ven los suyos propios
const asientos = await odoo.searchRead(
    'obra.cuaderno.asiento',
    domain,
    fields
);
```

#### Permisos de Acción

| Acción | Residente | Supervisor |
|--------|-----------|------------|
| Crear asiento | ✅ | ✅ |
| Firmar asiento | ✅ | ❌ |
| Aprobar asiento | ❌ | ✅ |
| Observar asiento | ❌ | ✅ |
| Subsanar observación | ✅ | ❌ |
| Ver todos los asientos | ❌ | ✅ |

---

## 🔧 Características Técnicas Destacadas

### 1. Offline-First Design
- ✅ Funciona completamente sin conexión
- ✅ Sincronización automática al recuperar conexión
- ✅ Cola de pendientes visible para el usuario
- ✅ Sincronización manual disponible

### 2. Resiliencia de Datos
- ✅ Guardado local antes de envío a servidor
- ✅ Manejo granular de errores por asiento
- ✅ Estados parciales (creado pero no firmado)
- ✅ Reintentos automáticos y manuales

### 3. UX/UI Adaptativa
- ✅ Indicadores de estado en tiempo real (GPS, conectividad)
- ✅ Feedback claro en cada operación
- ✅ Contador de pendientes visible
- ✅ Formulario nunca bloqueado por GPS

### 4. Seguridad
- ✅ Hash criptográfico de integridad
- ✅ Validación de campos en cliente y servidor
- ✅ Workflow con estados protegidos
- ✅ Permisos por rol de usuario

### 5. Integración con Odoo
- ✅ Respeto total del workflow de Odoo
- ✅ Métodos de negocio en lugar de write directo
- ✅ Validaciones del servidor respetadas
- ✅ Relaciones many2one correctamente gestionadas

---

## 📊 Estadísticas y Reportes

### Métricas Disponibles

En el endpoint [`/api/cuaderno/list`](app/api/cuaderno/list/route.ts:30):

```typescript
const stats = {
    total: asientos.length,
    pending: asientos.filter(a => a.state === 'signed_residente').length,
    approved: asientos.filter(a => a.state === 'approved').length,
    rejected: asientos.filter(a => a.state === 'rejected').length,
    draft: asientos.filter(a => a.state === 'draft').length,
};
```

**Utilidad:**
- Dashboard de estado de asientos
- KPIs de aprobación/rechazo
- Seguimiento de productividad

---

## 🔄 Flujos de Usuario Completos

### Flujo 1: Residente crea asiento sin conexión

```
1. Residente abre /cuaderno/nuevo
2. GPS se obtiene automáticamente (o falla)
3. Completa formulario
4. Click en "Registrar y Firmar"
   → Guardado en IndexedDB ✓
   → Intento de sync falla (sin conexión)
   → Toast: "📴 Sin conexión. Se enviará cuando recuperes internet"
5. Contador muestra "1 PENDIENTE"
6. [Más tarde] Conexión se recupera
   → Toast: "Conexión restaurada. Los asientos pendientes se sincronizarán"
7. Usuario puede sync manual o esperar próximo asiento
8. Sync exitoso → Toast: "✅ Asiento registrado y enviado a Odoo"
```

### Flujo 2: Supervisor revisa y aprueba

```
1. Supervisor ve lista de asientos pendientes
2. Filtra por estado "signed_residente"
3. Revisa el asiento (clima, personal, equipos, ocurrencias)
4. Ve fotos adjuntas si las hay
5. Decide acción:
   
   Opción A - Aprobar:
   → POST /api/cuaderno/approve { id, observacion }
   → Odoo: action_approve_supervisor()
   → Estado: approved
   → Toast: "Asiento aprobado correctamente"
   
   Opción B - Observar:
   → POST /api/cuaderno/reject { id, observacion }
   → Odoo: action_reject()
   → Estado: rejected
   → Toast: "Asiento observado correctamente"
```

### Flujo 3: Residente subsana observación

```
1. Residente ve sus asientos rechazados
2. Lee la observación del supervisor
3. Completa el texto de subsanación
4. Click en "Subsanar"
   → POST /api/cuaderno/resolve { id, observacion }
   → Odoo: action_resolve()
   → Estado: resolved → signed_residente
5. El asiento vuelve a la cola de revisión del supervisor
```

---

## 🎯 Puntos Fuertes de la Implementación

1. **Arquitectura Sólida**
   - Separación clara de responsabilidades
   - Capas bien definidas (UI, Storage, API, Backend)

2. **Manejo de Errores Robusto**
   - Errores específicos por asiento
   - Estados parciales contemplados
   - Mensajes claros al usuario

3. **Experiencia de Usuario**
   - Nunca se bloquea el flujo por GPS
   - Feedback constante de estado
   - Funciona offline completamente

4. **Integridad de Datos**
   - Hash de seguridad
   - Validaciones en múltiples capas
   - Workflow protegido

5. **Escalabilidad**
   - Sincronización en lote
   - IndexedDB para gran volumen offline
   - API optimizada

---

## 🐛 Áreas de Mejora Potenciales

1. **Compresión de Fotos**
   - Las fotos en base64 pueden ser muy pesadas
   - Considerar compresión antes de guardar
   - Uso de formatos modernos (WebP)

2. **Sincronización en Background**
   - Service Worker para sync cuando app está cerrada
   - Background Sync API

3. **Validación de Duplicados**
   - Hash de seguridad podría prevenir duplicados
   - Verificación antes de crear en Odoo

4. **Caché de Lista de Cuadernos**
   - Lista de cuadernos se carga cada vez
   - Podría cachearse con invalidación inteligente

5. **Paginación en Listado**
   - Limit de 100 asientos hardcoded
   - Implementar paginación para proyectos grandes

---

## 📚 Resumen de Endpoints API

| Endpoint | Método | Descripción | Autenticación |
|----------|--------|-------------|---------------|
| `/api/cuaderno/list` | POST | Lista asientos del usuario | ✅ |
| `/api/cuaderno/list-cuadernos` | GET | Lista cuadernos disponibles | ✅ |
| `/api/cuaderno/sync` | POST | Sincroniza asientos offline | ✅ |
| `/api/cuaderno/approve` | POST | Aprueba un asiento | ✅ (supervisor) |
| `/api/cuaderno/reject` | POST | Rechaza/observa un asiento | ✅ (supervisor) |
| `/api/cuaderno/resolve` | POST | Subsana un asiento observado | ✅ (residente) |
| `/api/cuaderno/upload_photo` | POST | Sube foto a un asiento | ✅ |

---

## 🔐 Modelo de Datos en Odoo

### obra.cuaderno
```python
# Representa un proyecto/obra
- id (Integer)
- name (Char)
- project_id (Many2one → project.project)
- display_name (Char, computed)
```

### obra.cuaderno.asiento
```python
# Representa un registro diario
- id (Integer)
- cuaderno_id (Many2one → obra.cuaderno)
- date (Date)
- clima (Selection)
- ocurrencias (Text)
- latitude (Float)
- longitude (Float)
- gps_accuracy (Float)
- state (Selection: draft, signed_residente, approved, rejected, resolved)
- residente_id (Many2one → hr.employee)
- supervisor_id (Many2one → hr.employee)
- observacion (Text)
- x_personal (Char, custom)
- x_equipos (Char, custom)
- x_hash_seguridad (Char, custom)
- attachment_ids (One2many → ir.attachment)

# Métodos de workflow
- action_sign_residente()
- action_approve_supervisor(observacion)
- action_reject(observacion)
- action_resolve(observacion)
```

---

## 🎓 Conclusión

La implementación del **Cuaderno de Obra Digital** es una solución enterprise-grade que combina:

- ✅ Arquitectura offline-first para trabajar en campo sin conexión
- ✅ Integración profunda con Odoo ERP
- ✅ Workflow robusto con estados y transiciones controladas
- ✅ Geolocalización GPS con fallback elegante
- ✅ Sistema de firmas digitales con hash criptográfico
- ✅ Gestión de fotografías vinculadas
- ✅ Sincronización inteligente y resiliente
- ✅ UX clara y adaptativa

Es una herramienta lista para producción que responde a las necesidades reales de gestión de obras en construcción.

---

**Última actualización:** 2026-05-08  
**Versión del sistema:** control-app v2.0
