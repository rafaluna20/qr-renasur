# 🎯 QR Generator Studio

Sistema de gestión de asistencia y tareas mediante códigos QR, integrado con Odoo ERP.

[![Version](https://img.shields.io/badge/version-2.0.2-blue.svg)](./CHANGELOG.md)
[![Next.js](https://img.shields.io/badge/Next.js-16.1.0-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

---

## 📋 Tabla de Contenidos

- [Características](#-características)
- [Arquitectura](#-arquitectura)
- [Inicio Rápido](#-inicio-rápido)
- [Configuración](#-configuración)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [APIs](#-apis)
- [Desarrollo](#-desarrollo)
- [Testing](#-testing)
- [Despliegue](#-despliegue)
- [Documentación](#-documentación)

---

## ✨ Características

### Para Administradores
- 🎯 Generación de códigos QR para proyectos/tareas
- 📊 Panel de administración intuitivo
- 💾 Descarga de códigos QR generados
- 📈 Visualización de estadísticas

### Para Usuarios
- 📱 Dashboard personalizado con foto de perfil
- ✅ Marcado de asistencia mediante escaneo QR
- ⏱️ Registro manual de tareas
- 📊 Historial de tareas completadas (vista día/semana)
- 📅 Historial de asistencias con estadísticas
- 🔒 Verificación QR antes de finalizar tareas

### Técnicas (v2.0)
- 🔐 **Seguridad empresarial** - Credenciales en variables de entorno
- 📝 **Logging estructurado** - Debugging eficiente
- ✅ **Validación automática** - Zod en todas las APIs
- 🚀 **Rate limiting** - Protección contra abuso
- 🎯 **Type-safe** - TypeScript strict mode
- 🔄 **Cliente Odoo centralizado** - Sin código duplicado
- 📍 **GPS tracking** - Coordenadas geográficas en asistencias (v2.0.2)
- 🔍 **Diagnóstico automático** - Detección de problemas de configuración (v2.0.2)

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────┐
│                   FRONTEND LAYER                     │
│  Next.js 16 (React 19) - App Router                 │
│  - Dashboard Admin/User                              │
│  - QR Scanner Component                              │
│  - Responsive UI (Tailwind CSS 4)                   │
└─────────────────┬───────────────────────────────────┘
                  │ Next.js API Routes
┌─────────────────▼───────────────────────────────────┐
│              API LAYER (Server-Side)                 │
│  - Validación (Zod)                                  │
│  - Autenticación/Autorización                        │
│  - Rate Limiting                                     │
│  - Logging estructurado                              │
│  - Error Handling consistente                        │
└─────────────────┬───────────────────────────────────┘
                  │ Odoo Client (JSON-RPC)
┌─────────────────▼───────────────────────────────────┐
│                DATA LAYER                            │
│  Odoo ERP v14+                                       │
│  - hr.employee (Empleados)                           │
│  - hr.attendance (Asistencias)                       │
│  - account.analytic.line (Tareas/Horas)             │
└─────────────────────────────────────────────────────┘
```

### Stack Tecnológico

**Frontend:**
- Next.js 16.1.0 (App Router)
- React 19.2.3
- TypeScript 5
- Tailwind CSS 4
- html5-qrcode 2.3.8

**Backend:**
- Next.js API Routes
- Zod 4.2.1 (Validación)
- Custom Odoo Client (JSON-RPC)

**Integración:**
- Odoo ERP (XML-RPC/JSON-RPC)

---

## 🚀 Inicio Rápido

### Prerequisitos

- Node.js 20+ 
- npm o yarn
- Acceso a instancia Odoo v14+
- Credenciales de Odoo (API Key o password)

### Instalación

```bash
# 1. Clonar repositorio
git clone <repo-url>
cd qr-generator

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con tus credenciales

# 4. Ejecutar en desarrollo
npm run dev

# 5. Abrir navegador
# http://localhost:3000
```

---

## ⚙️ Configuración

### Variables de Entorno

Crea un archivo `.env.local` basado en `.env.example`:

```env
# Odoo Configuration (SERVER-SIDE ONLY)
ODOO_URL=https://tu-odoo.com/jsonrpc
ODOO_DATABASE=tu_database
ODOO_USER_ID=8
ODOO_API_KEY=tu_api_key

# Admin Credentials (SERVER-SIDE ONLY)
ADMIN_EMAIL=admin@empresa.com
ADMIN_PASSWORD=password_seguro

# Application Settings (CLIENT-SIDE)
NEXT_PUBLIC_URL=http://localhost:3000
NEXT_PUBLIC_PROYECTO_ID=1
NEXT_PUBLIC_TAREA_ID=1

# JWT (Futuro)
JWT_SECRET=genera_con_openssl_rand_base64_32
```

**⚠️ IMPORTANTE:**
- Variables **sin** `NEXT_PUBLIC_` solo están disponibles en servidor
- Variables **con** `NEXT_PUBLIC_` se exponen en el cliente
- **NUNCA** uses `NEXT_PUBLIC_` para credenciales sensibles

### Generar JWT Secret

```bash
# Linux/Mac
openssl rand -base64 32

# Windows PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

📖 **Guía completa:** Ver [`SETUP_INSTRUCCIONES.md`](./SETUP_INSTRUCCIONES.md)

---

## 📁 Estructura del Proyecto

```
qr-generator/
├── app/                          # Next.js App Router
│   ├── api/                      # API Routes (Backend)
│   │   ├── assistance/           # Endpoints de asistencia
│   │   │   ├── route.ts          # GET asistencias
│   │   │   ├── in/route.ts       # POST check-in (con GPS)
│   │   │   └── out/route.ts      # POST check-out
│   │   ├── diagnostic/           # Herramientas de diagnóstico
│   │   │   └── gps-fields/       # Verificar campos GPS en Odoo
│   │   ├── health/               # Health check
│   │   │   └── route.ts          # GET /api/health
│   │   ├── task/                 # Tareas completadas
│   │   │   └── route.ts          # GET tareas
│   │   └── users/                # Gestión usuarios
│   │       ├── login/route.ts    # POST login
│   │       └── register/route.ts # POST register
│   ├── login/                    # Página de login
│   ├── register/                 # Página de registro
│   ├── page.tsx                  # Dashboard principal
│   ├── layout.tsx                # Layout raíz
│   └── globals.css               # Estilos globales
├── components/                   # Componentes React
│   ├── QRScannerModal.tsx       # Modal escáner QR
│   └── ui/                       # Componentes UI
├── lib/                          # Utilidades (Backend)
│   ├── odoo-client.ts           # Cliente Odoo centralizado
│   ├── logger.ts                # Logging estructurado
│   ├── api-response.ts          # Responses HTTP
│   ├── request-validator.ts     # Validación requests
│   ├── utils.ts                 # Utilidades generales
│   └── index.ts                 # Barrel export
├── public/                       # Archivos estáticos
├── .env.example                  # Template variables
├── .env.local                    # TUS credenciales (NO commitear)
├── .gitignore                    # Git ignore mejorado
├── next.config.ts                # Config Next.js
├── tailwind.config.ts            # Config Tailwind
├── tsconfig.json                 # Config TypeScript
├── package.json                  # Dependencias
├── README.md                     # Este archivo
├── CHANGELOG.md                  # Registro de cambios
├── SETUP_INSTRUCCIONES.md        # Guía de configuración
├── REVISION_EXPERTO.md           # Análisis técnico (75 págs)
├── PROPUESTAS_ESTRATEGICAS.md    # Visión estratégica
├── ODOO_CAMPOS_GPS.md            # Guía campos GPS en Odoo
├── SOLUCION_GPS.md               # Solución problema GPS (v2.0.2)
└── create_gps_fields.sql         # Script SQL para campos GPS
```

---

## 🔌 APIs

### Endpoints Disponibles

#### 🏥 Health Check
```http
GET /api/health
```
Verifica el estado del sistema y dependencias.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-10T06:00:00.000Z",
  "uptime": 3600,
  "version": "2.0.0",
  "checks": {
    "api": { "status": "up" },
    "odoo": { "status": "up" },
    "environment": { "status": "up" }
  }
}
```

#### 🔍 Diagnóstico

**Verificar campos GPS en Odoo:**
```http
GET /api/diagnostic/gps-fields
```

**Response (campos OK):**
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

**Response (campos NO existen):**
```json
{
  "status": "error",
  "message": "❌ Los campos GPS NO EXISTEN en Odoo. Debes crearlos.",
  "testResults": {
    "fieldsExist": false,
    "hasData": false
  },
  "recommendations": [
    "1. CREAR CAMPOS GPS: Los campos no existen. Sigue la guía en ODOO_CAMPOS_GPS.md",
    "2. MÉTODO RÁPIDO: Ejecuta el script SQL proporcionado en la documentación"
  ]
}
```

📖 **Ver guía completa:** [`SOLUCION_GPS.md`](./SOLUCION_GPS.md)

#### 👤 Usuarios

**Registrar usuario:**
```http
POST /api/users/register
Content-Type: application/json

{
  "name": "Juan Pérez",
  "email": "juan@ejemplo.com",
  "phone": "987654321",
  "dni": "12345678"
}
```

**Listar usuarios:**
```http
POST /api/users/login
```

#### ✅ Asistencia

**Marcar entrada (con GPS):**
```http
POST /api/assistance/in
Content-Type: application/json

{
  "userId": 5,
  "latitude": -12.449162,
  "longitude": -76.755698,
  "accuracy": 79.00
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "result": 123,
    "message": "Entrada registrada exitosamente",
    "hasGPS": true,
    "checkIn": "2026-02-24 19:23:01"
  }
}
```

**Marcar salida:**
```http
POST /api/assistance/out
Content-Type: application/json

{
  "registryId": 123
}
```

**Consultar asistencias:**
```http
POST /api/assistance
Content-Type: application/json

{
  "userId": 5,
  "allHistory": false
}
```

#### 📋 Tareas

**Obtener tareas completadas:**
```http
POST /api/task
Content-Type: application/json

{
  "userId": 5,
  "limit": 100
}
```

### Response Format

Todas las APIs retornan formato consistente:

**Success:**
```json
{
  "success": true,
  "message": "Operación exitosa",
  "data": { ... },
  "timestamp": "2026-02-10T06:00:00.000Z"
}
```

**Error:**
```json
{
  "success": false,
  "error": "Mensaje de error",
  "details": { ... },
  "timestamp": "2026-02-10T06:00:00.000Z"
}
```

---

## 💻 Desarrollo

### Scripts Disponibles

```bash
# Desarrollo
npm run dev          # Servidor desarrollo (localhost:3000)

# Producción
npm run build        # Build para producción
npm start            # Servidor producción

# Linting
npm run lint         # ESLint
```

### Crear Nueva API Route

```typescript
// app/api/example/route.ts
import { NextRequest } from 'next/server';
import { 
  getOdooClient,
  logger,
  successResponse,
  handleAPIError,
  validateRequestBody 
} from '@/lib';
import { z } from 'zod';

// 1. Definir schema
const schema = z.object({
  param: z.string().min(1),
});

// 2. Handler
export async function POST(req: NextRequest) {
  try {
    // Validar
    const data = await validateRequestBody(req, schema);
    
    // Lógica
    const odoo = getOdooClient();
    const result = await odoo.searchRead('model', [], ['field']);
    
    // Log
    logger.info('Operation completed', { result });
    
    // Response
    return successResponse(result);
    
  } catch (error) {
    return handleAPIError(error);
  }
}
```

### Logging

```typescript
import { logger } from '@/lib';

// Niveles
logger.debug('Debug info', { data });
logger.info('Info message', { userId: 123 });
logger.warn('Warning', { issue: 'something' });
logger.error('Error occurred', error, { context: 'payment' });

// Logger por módulo
const moduleLogger = logger.child('auth');
moduleLogger.info('User logged in');
```

### Validación

```typescript
import { commonSchemas } from '@/lib';
import { z } from 'zod';

const schema = z.object({
  email: commonSchemas.email,
  dni: commonSchemas.dni,
  phone: commonSchemas.phone,
  userId: commonSchemas.flexibleId,
});
```

---

## 🧪 Testing

```bash
# Ejecutar todos los tests
npm test

# Modo watch (desarrollo)
npm run test:watch

# Con reporte de cobertura
npm run test:coverage

# Para CI/CD
npm run test:ci
```

### **Tests Implementados (v2.0.1):**

| Suite | Tests | Cobertura |
|-------|-------|-----------|
| **Date Utils** | 10 tests | Zona horaria, formatos |
| **Odoo Client** | 11 tests | CRUD, errores, singleton |
| **Assistance Validation** | 9 tests | Validación, auto-cierre |
| **TOTAL** | **30 tests** | **✅ 100% pasando** |

**Estado actual:** Tests unitarios implementados. Tests E2E pendientes para Sprint 4.

Ver [`__tests__/`](./__tests__/) para los archivos de test.

---

## 🚀 Despliegue

### Vercel (Recomendado)

```bash
# 1. Instalar Vercel CLI
npm i -g vercel

# 2. Deploy
vercel

# 3. Configurar variables de entorno
vercel env add ODOO_URL
vercel env add ODOO_DATABASE
# ... resto de variables

# 4. Deploy a producción
vercel --prod
```

### Docker (Futuro)

```dockerfile
# Dockerfile no incluido aún
# Ver roadmap en PROPUESTAS_ESTRATEGICAS.md
```

### Checklist Pre-Deploy

- [ ] Variables de entorno configuradas en hosting
- [ ] `.env.local` **NO** está en git
- [ ] Credenciales de producción diferentes a desarrollo
- [ ] Health check funcionando: `/api/health`
- [ ] HTTPS habilitado
- [ ] Rate limiting configurado
- [ ] Logs monitoreados (futura integración ELK/CloudWatch)

---

## 📚 Documentación

### Documentos Principales

- **[README.md](./README.md)** - Este archivo (Overview general)
- **[SETUP_INSTRUCCIONES.md](./SETUP_INSTRUCCIONES.md)** - Guía de configuración paso a paso
- **[CHANGELOG.md](./CHANGELOG.md)** - Registro de cambios (v2.0.2)
- **[REVISION_EXPERTO.md](./REVISION_EXPERTO.md)** - Análisis técnico completo (75 páginas)
- **[PROPUESTAS_ESTRATEGICAS.md](./PROPUESTAS_ESTRATEGICAS.md)** - Visión estratégica y roadmap
- **[ODOO_CAMPOS_GPS.md](./ODOO_CAMPOS_GPS.md)** - Guía para crear campos GPS en Odoo
- **[SOLUCION_GPS.md](./SOLUCION_GPS.md)** - Solución problema GPS (v2.0.2)

### Documentación Técnica

#### Utilidades (lib/)
- `odoo-client.ts` - Cliente para Odoo JSON-RPC
- `logger.ts` - Sistema de logging estructurado
- `api-response.ts` - Helpers para responses HTTP
- `request-validator.ts` - Validación y sanitización

#### APIs
Cada endpoint está documentado con JSDoc en su archivo.

---

## 🤝 Contribuir

### Workflow

1. Fork el repositorio
2. Crear branch: `git checkout -b feature/nueva-funcionalidad`
3. Commit cambios: `git commit -am 'feat: agregar funcionalidad X'`
4. Push: `git push origin feature/nueva-funcionalidad`
5. Crear Pull Request

### Convenciones

**Commits:** Seguir [Conventional Commits](https://www.conventionalcommits.org/)
- `feat:` Nueva funcionalidad
- `fix:` Bug fix
- `docs:` Documentación
- `refactor:` Refactorización
- `test:` Tests
- `chore:` Mantenimiento

**Código:**
- TypeScript strict mode
- ESLint sin warnings
- Prettier para formato
- JSDoc en funciones públicas

---

## 📊 Estado del Proyecto

| Aspecto | Estado | Detalles |
|---------|--------|----------|
| **Seguridad** | 🟢 7/10 | Variables entorno, validación backend |
| **Código** | 🟢 8.5/10 | Type-safe, sin duplicación |
| **APIs** | 🟢 100% | 7 endpoints funcionando |
| **UI/UX** | 🟢 9/10 | Moderna, responsive |
| **Tests** | 🟢 8/10 | 30 tests unitarios ✅ |
| **Docs** | 🟢 9/10 | Completa y actualizada |
| **Performance** | 🟡 6/10 | Mejorable (ver roadmap) |
| **Bugs Críticos** | 🟢 0 | Todos corregidos ✅ |
| **GPS Tracking** | 🟢 9/10 | Implementado con diagnóstico |

**Versión:** 2.0.2 (GPS Solution + Diagnostic Tools)
**Última actualización:** 25 de Febrero, 2026

---

## 🗺️ Roadmap

### Completado (v2.0 - v2.0.2) ✅
- Seguridad de credenciales
- Cliente Odoo centralizado
- Logging estructurado
- Validación automática
- Documentación completa
- Bug fixes críticos (validación + zona horaria)
- Tests automatizados (30 tests)
- GPS tracking con diagnóstico automático
- Herramientas de troubleshooting

### Próximos Sprints

**Sprint 3-5 (6 semanas):**
- 🔐 Autenticación JWT con NextAuth.js
- ⚡ Performance optimization (React Query)
- 🧪 Testing infrastructure (Jest + Cypress)

**Sprint 6-9 (8 semanas):**
- 📊 CQRS + PostgreSQL read models
- 🔍 Observabilidad (Prometheus + Grafana)
- 📱 PWA con offline support

**Sprint 10-14 (10 semanas):**
- 🤖 Analytics con IA (TensorFlow.js)
- 🏢 Multi-tenant SaaS
- 💳 Billing y suscripciones

Ver detalles completos en [`PROPUESTAS_ESTRATEGICAS.md`](./PROPUESTAS_ESTRATEGICAS.md)

---

## 📝 Licencia

MIT License - Ver archivo [LICENSE](./LICENSE) para detalles.

---

## 👥 Equipo

- **Technical Lead:** Senior Solutions Architect (25+ años experiencia)
- **Stack:** Next.js, TypeScript, Odoo ERP

---

## 🐛 Reportar Issues

Si encuentras un bug o tienes una sugerencia:

1. Verifica que no exista ya en [Issues](../../issues)
2. Crea un nuevo issue con:
   - Título descriptivo
   - Pasos para reproducir
   - Comportamiento esperado vs actual
   - Screenshots si aplica
   - Versión del proyecto

---

## 💬 Soporte

- 📧 Email: soporte@empresa.com
- 📖 Docs: Este repositorio
- 🐛 Issues: GitHub Issues

---

**🎉 ¡Listo para usar!**

El proyecto está en versión 2.0.0 con fundamentos sólidos. Revisa [`PROPUESTAS_ESTRATEGICAS.md`](./PROPUESTAS_ESTRATEGICAS.md) para el plan de evolución completo.
