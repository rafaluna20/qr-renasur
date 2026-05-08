# Campos Requeridos en Odoo para Cuaderno de Obra

## 📦 Modelo: `obra.cuaderno`

Este modelo representa el proyecto/obra donde se registran los asientos.

### Campos Necesarios

```python
class ObraCuaderno(models.Model):
    _name = 'obra.cuaderno'
    _description = 'Cuaderno de Obra'

    # Campos básicos
    name = fields.Char('Nombre', required=True)
    project_id = fields.Many2one('project.project', 'Proyecto')
    display_name = fields.Char('Nombre para Mostrar', compute='_compute_display_name', store=True)
```

---

## 📋 Modelo: `obra.cuaderno.asiento`

Este modelo representa cada registro diario del cuaderno de obra.

### Campos Requeridos por la App

Según el código en [`app/api/cuaderno/sync/route.ts`](app/api/cuaderno/sync/route.ts:50), estos son los campos que la aplicación envía:

#### 1. Campos Estándar (Built-in)

```python
class ObraCuadernoAsiento(models.Model):
    _name = 'obra.cuaderno.asiento'
    _description = 'Asiento de Cuaderno de Obra'

    # ═══════════════════════════════════════════════════════════════
    # CAMPOS OBLIGATORIOS
    # ═══════════════════════════════════════════════════════════════
    
    # Relación con el cuaderno/proyecto
    cuaderno_id = fields.Many2one(
        'obra.cuaderno', 
        string='Cuaderno de Obra',
        required=True,
        ondelete='cascade'
    )
    
    # Información básica del registro
    date = fields.Date(
        string='Fecha',
        required=True,
        default=fields.Date.today
    )
    
    clima = fields.Selection([
        ('soleado', 'Soleado ☀️'),
        ('nublado', 'Nublado ☁️'),
        ('lluvia_ligera', 'Lluvia Ligera 🌦️'),
        ('lluvia_fuerte', 'Lluvia Fuerte 🌧️'),
    ], string='Clima', required=True, default='soleado')
    
    ocurrencias = fields.Text(
        string='Ocurrencias y Trabajos del Día',
        required=True
    )
    
    # ═══════════════════════════════════════════════════════════════
    # CAMPOS PERSONALIZADOS (Campos x_)
    # Nota: Estos campos deben crearse en Odoo con prefijo x_
    # ═══════════════════════════════════════════════════════════════
    
    x_personal = fields.Char(
        string='Resumen de Personal',
        help='Ejemplo: 1 Ing. Residente, 5 Peones, 2 Oficiales'
    )
    
    x_equipos = fields.Char(
        string='Resumen de Equipos/Maquinaria',
        help='Ejemplo: 1 Excavadora operativa, 2 Volquetes'
    )
    
    x_hash_seguridad = fields.Char(
        string='Hash de Seguridad (SHA-256)',
        help='Hash criptográfico para verificar integridad de datos',
        readonly=True
    )
    
    # ═══════════════════════════════════════════════════════════════
    # CAMPOS GPS (OPCIONALES)
    # Estos campos pueden tener valor 0 si GPS no está disponible
    # ═══════════════════════════════════════════════════════════════
    
    latitude = fields.Float(
        string='Latitud',
        digits=(10, 6),
        help='Coordenada GPS - Latitud'
    )
    
    longitude = fields.Float(
        string='Longitud',
        digits=(10, 6),
        help='Coordenada GPS - Longitud'
    )
    
    gps_accuracy = fields.Float(
        string='Precisión GPS',
        help='Precisión en metros de la ubicación GPS'
    )
    
    # ═══════════════════════════════════════════════════════════════
    # CAMPOS DE WORKFLOW Y CONTROL
    # ═══════════════════════════════════════════════════════════════
    
    state = fields.Selection([
        ('draft', 'Borrador'),
        ('signed_residente', 'Firmado por Residente'),
        ('approved', 'Aprobado'),
        ('rejected', 'Observado'),
        ('resolved', 'Subsanado'),
    ], string='Estado', default='draft', required=True, readonly=True)
    
    # Usuarios involucrados en el proceso
    residente_id = fields.Many2one(
        'hr.employee',
        string='Residente de Obra',
        help='Ingeniero residente que registra el asiento'
    )
    
    supervisor_id = fields.Many2one(
        'hr.employee',
        string='Supervisor',
        help='Supervisor que revisa y aprueba'
    )
    
    observacion = fields.Text(
        string='Observaciones',
        help='Comentarios del supervisor o texto de subsanación del residente'
    )
    
    # ═══════════════════════════════════════════════════════════════
    # CAMPOS PARA ADJUNTOS (FOTOS)
    # ═══════════════════════════════════════════════════════════════
    
    attachment_ids = fields.One2many(
        'ir.attachment',
        'res_id',
        domain=[('res_model', '=', 'obra.cuaderno.asiento')],
        string='Fotografías'
    )
    
    attachment_count = fields.Integer(
        string='Número de Fotos',
        compute='_compute_attachment_count'
    )
    
    # ═══════════════════════════════════════════════════════════════
    # MÉTODOS COMPUTED
    # ═══════════════════════════════════════════════════════════════
    
    @api.depends('attachment_ids')
    def _compute_attachment_count(self):
        for record in self:
            record.attachment_count = len(record.attachment_ids)
```

---

## 🔧 Métodos de Workflow Requeridos

La aplicación llama a estos métodos para gestionar las transiciones de estado:

```python
    # ═══════════════════════════════════════════════════════════════
    # MÉTODOS DE TRANSICIÓN DE ESTADO
    # ═══════════════════════════════════════════════════════════════
    
    def action_sign_residente(self):
        """
        Firma del residente - Transición: draft → signed_residente
        Llamado desde: /api/cuaderno/sync
        """
        for record in self:
            if record.state != 'draft':
                raise UserError('Solo se pueden firmar asientos en borrador')
            record.state = 'signed_residente'
        return True
    
    def action_approve_supervisor(self, observacion=''):
        """
        Aprobación del supervisor - Transición: signed_residente → approved
        Llamado desde: /api/cuaderno/approve
        
        Args:
            observacion (str): Comentarios opcionales del supervisor
        """
        for record in self:
            if record.state != 'signed_residente':
                raise UserError('Solo se pueden aprobar asientos firmados por el residente')
            record.write({
                'state': 'approved',
                'observacion': observacion or '',
                'supervisor_id': self.env.user.employee_id.id if self.env.user.employee_id else False
            })
        return True
    
    def action_reject(self, observacion=''):
        """
        Rechazo/Observación del supervisor - Transición: signed_residente → rejected
        Llamado desde: /api/cuaderno/reject
        
        Args:
            observacion (str): Motivo del rechazo (obligatorio en UI)
        """
        for record in self:
            if record.state != 'signed_residente':
                raise UserError('Solo se pueden observar asientos firmados por el residente')
            record.write({
                'state': 'rejected',
                'observacion': observacion or '',
                'supervisor_id': self.env.user.employee_id.id if self.env.user.employee_id else False
            })
        return True
    
    def action_resolve(self, observacion=''):
        """
        Subsanación del residente - Transición: rejected → signed_residente
        Llamado desde: /api/cuaderno/resolve
        
        Args:
            observacion (str): Explicación de la subsanación realizada
        """
        for record in self:
            if record.state != 'rejected':
                raise UserError('Solo se pueden subsanar asientos observados')
            # Concatenar la observación anterior con la nueva
            nueva_obs = f"{record.observacion or ''}\n\n--- SUBSANACIÓN ---\n{observacion}"
            record.write({
                'state': 'signed_residente',  # Vuelve a revisión
                'observacion': nueva_obs
            })
        return True
```

---

## 📊 Resumen de Campos por Categoría

### ✅ Campos Obligatorios (Sin estos no funciona)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `cuaderno_id` | Many2one | Relación con obra.cuaderno |
| `date` | Date | Fecha del registro |
| `clima` | Selection | Condición climática |
| `ocurrencias` | Text | Descripción del día |
| `state` | Selection | Estado del workflow |

### 🔧 Campos Personalizados (Prefijo x_)

| Campo | Tipo | Origen |
|-------|------|--------|
| `x_personal` | Char | Resumen de personal en obra |
| `x_equipos` | Char | Resumen de equipos/maquinaria |
| `x_hash_seguridad` | Char | Hash SHA-256 de integridad |

**⚠️ IMPORTANTE:** Estos campos deben crearse en Odoo con el prefijo `x_` porque son campos custom. Se pueden crear:
- Desde la UI de Odoo (Studio)
- Desde el modelo Python
- Mediante SQL directo

### 📍 Campos GPS (Opcionales)

| Campo | Tipo | Valor por Defecto |
|-------|------|-------------------|
| `latitude` | Float | 0 si no disponible |
| `longitude` | Float | 0 si no disponible |
| `gps_accuracy` | Float | 0 si no disponible |

### 👥 Campos de Control

| Campo | Tipo | Uso |
|-------|------|-----|
| `residente_id` | Many2one(hr.employee) | Quien registra |
| `supervisor_id` | Many2one(hr.employee) | Quien aprueba |
| `observacion` | Text | Comentarios/observaciones |

### 📸 Campos de Adjuntos

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `attachment_ids` | One2many | Relación con ir.attachment |
| `attachment_count` | Integer | Contador de fotos |

---

## 🔍 Validación de Campos en Odoo

Para verificar que todos los campos existen en tu instancia de Odoo:

```python
# Script de verificación (ejecutar en Odoo shell)

model = env['obra.cuaderno.asiento']
required_fields = [
    'cuaderno_id', 'date', 'clima', 'ocurrencias', 
    'x_personal', 'x_equipos', 'x_hash_seguridad',
    'latitude', 'longitude', 'gps_accuracy',
    'state', 'residente_id', 'supervisor_id', 'observacion'
]

fields_info = model.fields_get(required_fields)

for field in required_fields:
    if field in fields_info:
        print(f"✅ {field}: {fields_info[field]['type']}")
    else:
        print(f"❌ {field}: FALTA")
```

---

## 🛠️ Script SQL para Crear Campos Personalizados

Si necesitas crear los campos `x_personal`, `x_equipos` y `x_hash_seguridad` manualmente:

```sql
-- Crear campo x_personal
INSERT INTO ir_model_fields (
    name, model, model_id, field_description, ttype, state
) VALUES (
    'x_personal',
    'obra.cuaderno.asiento',
    (SELECT id FROM ir_model WHERE model = 'obra.cuaderno.asiento'),
    'Resumen de Personal',
    'char',
    'manual'
);

-- Crear campo x_equipos
INSERT INTO ir_model_fields (
    name, model, model_id, field_description, ttype, state
) VALUES (
    'x_equipos',
    'obra.cuaderno.asiento',
    (SELECT id FROM ir_model WHERE model = 'obra.cuaderno.asiento'),
    'Resumen de Equipos',
    'char',
    'manual'
);

-- Crear campo x_hash_seguridad
INSERT INTO ir_model_fields (
    name, model, model_id, field_description, ttype, state
) VALUES (
    'x_hash_seguridad',
    'obra.cuaderno.asiento',
    (SELECT id FROM ir_model WHERE model = 'obra.cuaderno.asiento'),
    'Hash de Seguridad',
    'char',
    'manual'
);

-- Crear las columnas en la tabla
ALTER TABLE obra_cuaderno_asiento ADD COLUMN x_personal VARCHAR;
ALTER TABLE obra_cuaderno_asiento ADD COLUMN x_equipos VARCHAR;
ALTER TABLE obra_cuaderno_asiento ADD COLUMN x_hash_seguridad VARCHAR;
```

---

## 📤 Ejemplo de Datos Enviados desde la App

Este es un ejemplo real de lo que la app envía a Odoo:

```json
{
  "asientos": [
    {
      "offline_uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "cuaderno_id": "5",
      "date": "2026-05-08",
      "clima": "soleado",
      "personal": "1 Ing. Residente, 5 Peones, 2 Oficiales, 1 Operador",
      "equipos": "1 Excavadora operativa, 2 Volquetes en ruta",
      "ocurrencias": "Se realizó el vaciado de columnas del eje A...",
      "latitude": -12.046374,
      "longitude": -77.042793,
      "gps_accuracy": 15.5,
      "state": "signed_residente",
      "residente_id": "42",
      "security_hash": "a3c4f5e6d7b8c9a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8",
      "created_at": 1715190000000
    }
  ]
}
```

---

## ✅ Checklist de Implementación en Odoo

- [ ] Modelo `obra.cuaderno` existe con campo `name`
- [ ] Modelo `obra.cuaderno.asiento` existe
- [ ] Campos obligatorios: `cuaderno_id`, `date`, `clima`, `ocurrencias`, `state`
- [ ] Campos personalizados creados: `x_personal`, `x_equipos`, `x_hash_seguridad`
- [ ] Campos GPS creados: `latitude`, `longitude`, `gps_accuracy`
- [ ] Campos de control: `residente_id`, `supervisor_id`, `observacion`
- [ ] Métodos de workflow implementados:
  - [ ] `action_sign_residente()`
  - [ ] `action_approve_supervisor(observacion)`
  - [ ] `action_reject(observacion)`
  - [ ] `action_resolve(observacion)`
- [ ] Permisos configurados para residentes y supervisores
- [ ] Estados del campo `state` definidos correctamente

---

## 🎯 Notas Importantes

1. **Campos con prefijo x_**: Son campos custom que Odoo crea dinámicamente. Se pueden crear desde Studio o código.

2. **GPS Opcional**: Los campos GPS aceptan 0 como valor válido cuando no hay coordenadas disponibles.

3. **Workflow Protegido**: El campo `state` debe ser readonly y solo modificarse mediante los métodos del workflow.

4. **Hash de Seguridad**: Se calcula en el cliente con formato: `{date}|{lat},{lon}|{ocurrencias}`

5. **Fotografías**: Se gestionan mediante `ir.attachment` con relación al asiento usando `res_model` y `res_id`.

---

**Referencia de Código:**
- Sincronización: [`app/api/cuaderno/sync/route.ts`](app/api/cuaderno/sync/route.ts:50)
- Estructura de datos: [`lib/cuaderno/offline-storage.ts`](lib/cuaderno/offline-storage.ts:6)
