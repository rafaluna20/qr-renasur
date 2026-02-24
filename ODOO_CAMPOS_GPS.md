# 📍 Campos GPS para Odoo - Guía Paso a Paso

## 🎯 Resumen Rápido

**Modelo:** `hr.attendance` (Asistencias de Empleados)  
**Cantidad de campos:** 6 campos personalizados  
**Ubicación en Odoo:** Ajustes > Técnico > Estructura de Base de Datos > Modelos

---

## 📋 Lista de Campos a Crear

### Campos de ENTRADA (Check-in)

| Nombre Técnico | Etiqueta | Tipo | Precisión | Descripción |
|----------------|----------|------|-----------|-------------|
| `x_latitude` | Latitud Entrada | Float | (10, 7) | Coordenada GPS latitud al marcar entrada |
| `x_longitude` | Longitud Entrada | Float | (10, 7) | Coordenada GPS longitud al marcar entrada |
| `x_accuracy` | Precisión Entrada | Float | (10, 2) | Precisión GPS en metros al marcar entrada |

### Campos de SALIDA (Check-out)

| Nombre Técnico | Etiqueta | Tipo | Precisión | Descripción |
|----------------|----------|------|-----------|-------------|
| `x_latitude_out` | Latitud Salida | Float | (10, 7) | Coordenada GPS latitud al marcar salida |
| `x_longitude_out` | Longitud Salida | Float | (10, 7) | Coordenada GPS longitud al marcar salida |
| `x_accuracy_out` | Precisión Salida | Float | (10, 2) | Precisión GPS en metros al marcar salida |

---

## 🔧 Método 1: Crear Campos desde la Interfaz de Odoo

### Paso 1: Activar Modo Desarrollador

1. **Ir a Ajustes** (⚙️ arriba a la derecha)
2. Hacer scroll hasta el final
3. Clic en **"Activar modo de desarrollador"**

### Paso 2: Navegar a Modelos

1. **Ajustes** > **Técnico** > **Estructura de Base de Datos** > **Modelos**
2. Buscar el modelo: `hr.attendance`
3. Hacer clic en el modelo `hr.attendance`

### Paso 3: Crear los Campos de ENTRADA

#### Campo 1: Latitud Entrada

1. Clic en la pestaña **"Campos"**
2. Clic en **"Crear"** o **"Añadir una línea"**
3. Completar:
   ```
   Nombre del campo: x_latitude
   Descripción del campo: Latitud Entrada
   Tipo de campo: Float
   Dígitos: 10, 7
   Ayuda: Coordenada GPS latitud al marcar entrada
   ```
4. **Guardar**

#### Campo 2: Longitud Entrada

1. Clic en **"Crear"** o **"Añadir una línea"**
2. Completar:
   ```
   Nombre del campo: x_longitude
   Descripción del campo: Longitud Entrada
   Tipo de campo: Float
   Dígitos: 10, 7
   Ayuda: Coordenada GPS longitud al marcar entrada
   ```
3. **Guardar**

#### Campo 3: Precisión Entrada

1. Clic en **"Crear"** o **"Añadir una línea"**
2. Completar:
   ```
   Nombre del campo: x_accuracy
   Descripción del campo: Precisión Entrada (metros)
   Tipo de campo: Float
   Dígitos: 10, 2
   Ayuda: Precisión GPS en metros al marcar entrada
   ```
3. **Guardar**

### Paso 4: Crear los Campos de SALIDA

Repetir el proceso para los campos de salida:

#### Campo 4: Latitud Salida
```
Nombre: x_latitude_out
Descripción: Latitud Salida
Tipo: Float
Dígitos: 10, 7
```

#### Campo 5: Longitud Salida
```
Nombre: x_longitude_out
Descripción: Longitud Salida
Tipo: Float
Dígitos: 10, 7
```

#### Campo 6: Precisión Salida
```
Nombre: x_accuracy_out
Descripción: Precisión Salida (metros)
Tipo: Float
Dígitos: 10, 2
```

### Paso 5: Verificar

1. Ir a **Asistencias** (Employees > Attendances)
2. Ver la lista de asistencias
3. Los nuevos campos deberían aparecer (aunque vacíos por ahora)

---

## 💻 Método 2: Script SQL Directo (Más Rápido)

Si tienes acceso a PostgreSQL, puedes ejecutar este script:

### Script Completo

```sql
-- ============================================
-- CREAR CAMPOS GPS EN hr.attendance
-- ============================================

-- Paso 1: Agregar columnas a la tabla
ALTER TABLE hr_attendance 
ADD COLUMN IF NOT EXISTS x_latitude NUMERIC(10,7),
ADD COLUMN IF NOT EXISTS x_longitude NUMERIC(10,7),
ADD COLUMN IF NOT EXISTS x_accuracy NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS x_latitude_out NUMERIC(10,7),
ADD COLUMN IF NOT EXISTS x_longitude_out NUMERIC(10,7),
ADD COLUMN IF NOT EXISTS x_accuracy_out NUMERIC(10,2);

-- Paso 2: Registrar los campos en Odoo (metadatos)
-- Esto asegura que Odoo reconozca los campos

-- Obtener el ID del modelo hr.attendance
DO $$
DECLARE
    model_id INTEGER;
BEGIN
    SELECT id INTO model_id FROM ir_model WHERE model = 'hr.attendance';
    
    -- Campo: x_latitude
    INSERT INTO ir_model_fields (
        name, model_id, model, field_description, ttype, state, store
    ) VALUES (
        'x_latitude', model_id, 'hr.attendance', 'Latitud Entrada', 'float', 'manual', true
    ) ON CONFLICT (name, model_id) DO NOTHING;
    
    -- Campo: x_longitude
    INSERT INTO ir_model_fields (
        name, model_id, model, field_description, ttype, state, store
    ) VALUES (
        'x_longitude', model_id, 'hr.attendance', 'Longitud Entrada', 'float', 'manual', true
    ) ON CONFLICT (name, model_id) DO NOTHING;
    
    -- Campo: x_accuracy
    INSERT INTO ir_model_fields (
        name, model_id, model, field_description, ttype, state, store
    ) VALUES (
        'x_accuracy', model_id, 'hr.attendance', 'Precisión Entrada (m)', 'float', 'manual', true
    ) ON CONFLICT (name, model_id) DO NOTHING;
    
    -- Campo: x_latitude_out
    INSERT INTO ir_model_fields (
        name, model_id, model, field_description, ttype, state, store
    ) VALUES (
        'x_latitude_out', model_id, 'hr.attendance', 'Latitud Salida', 'float', 'manual', true
    ) ON CONFLICT (name, model_id) DO NOTHING;
    
    -- Campo: x_longitude_out
    INSERT INTO ir_model_fields (
        name, model_id, model, field_description, ttype, state, store
    ) VALUES (
        'x_longitude_out', model_id, 'hr.attendance', 'Longitud Salida', 'float', 'manual', true
    ) ON CONFLICT (name, model_id) DO NOTHING;
    
    -- Campo: x_accuracy_out
    INSERT INTO ir_model_fields (
        name, model_id, model, field_description, ttype, state, store
    ) VALUES (
        'x_accuracy_out', model_id, 'hr.attendance', 'Precisión Salida (m)', 'float', 'manual', true
    ) ON CONFLICT (name, model_id) DO NOTHING;
END $$;

-- Paso 3: Limpiar caché de Odoo
-- IMPORTANTE: Reinicia el servicio de Odoo después de ejecutar este script
-- sudo systemctl restart odoo
```

### Cómo Ejecutar el Script SQL

**Opción A: pgAdmin o DBeaver**
1. Conectar a la base de datos PostgreSQL
2. Abrir un editor SQL
3. Pegar el script completo
4. Ejecutar

**Opción B: Línea de comandos**
```bash
# Conectar a PostgreSQL
psql -U odoo -d db_akallpa_nueva

# Ejecutar el script (si lo guardaste en un archivo)
\i /path/to/script.sql

# O pegar directamente el contenido
```

**Opción C: Desde Odoo Shell (si tienes acceso)**
```bash
# Conectar al shell de Odoo
odoo-bin shell -d db_akallpa_nueva

# Ejecutar en Python
env.cr.execute("""
    ALTER TABLE hr_attendance 
    ADD COLUMN IF NOT EXISTS x_latitude NUMERIC(10,7),
    ADD COLUMN IF NOT EXISTS x_longitude NUMERIC(10,7),
    ADD COLUMN IF NOT EXISTS x_accuracy NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS x_latitude_out NUMERIC(10,7),
    ADD COLUMN IF NOT EXISTS x_longitude_out NUMERIC(10,7),
    ADD COLUMN IF NOT EXISTS x_accuracy_out NUMERIC(10,2);
""")
env.cr.commit()
```

---

## 🧪 Verificar que los Campos Existen

### Verificación SQL

```sql
-- Ver la estructura de la tabla
SELECT 
    column_name, 
    data_type, 
    numeric_precision, 
    numeric_scale
FROM information_schema.columns 
WHERE table_name = 'hr_attendance' 
  AND column_name LIKE 'x_%'
ORDER BY column_name;
```

**Resultado esperado:**
```
column_name      | data_type | numeric_precision | numeric_scale
-----------------+-----------+-------------------+--------------
x_accuracy       | numeric   | 10                | 2
x_accuracy_out   | numeric   | 10                | 2
x_latitude       | numeric   | 10                | 7
x_latitude_out   | numeric   | 10                | 7
x_longitude      | numeric   | 10                | 7
x_longitude_out  | numeric   | 10                | 7
```

### Verificación desde Odoo

```sql
-- Ver los campos en ir_model_fields
SELECT 
    name, 
    field_description, 
    ttype, 
    state
FROM ir_model_fields 
WHERE model = 'hr.attendance' 
  AND name LIKE 'x_%'
ORDER BY name;
```

---

## 🎨 Método 3: Módulo Personalizado (Profesional)

Si quieres una solución más robusta, crea un módulo:

### Estructura del Módulo

```
hr_attendance_gps/
├── __init__.py
├── __manifest__.py
└── models/
    ├── __init__.py
    └── hr_attendance.py
```

### Archivo: `__manifest__.py`

```python
{
    'name': 'HR Attendance GPS Tracking',
    'version': '1.0',
    'category': 'Human Resources',
    'summary': 'Add GPS coordinates to attendance records',
    'description': """
        Adds GPS location fields to employee attendance records
        - Check-in latitude/longitude
        - Check-out latitude/longitude
        - Location accuracy
    """,
    'depends': ['hr_attendance'],
    'data': [],
    'installable': True,
    'application': False,
    'auto_install': False,
}
```

### Archivo: `__init__.py` (raíz)

```python
from . import models
```

### Archivo: `models/__init__.py`

```python
from . import hr_attendance
```

### Archivo: `models/hr_attendance.py`

```python
from odoo import models, fields

class HrAttendance(models.Model):
    _inherit = 'hr.attendance'
    
    # Campos de entrada (check-in)
    x_latitude = fields.Float(
        string='Latitud Entrada',
        digits=(10, 7),
        help='Coordenada GPS latitud al marcar entrada'
    )
    
    x_longitude = fields.Float(
        string='Longitud Entrada',
        digits=(10, 7),
        help='Coordenada GPS longitud al marcar entrada'
    )
    
    x_accuracy = fields.Float(
        string='Precisión Entrada (metros)',
        digits=(10, 2),
        help='Precisión de la ubicación GPS en metros'
    )
    
    # Campos de salida (check-out)
    x_latitude_out = fields.Float(
        string='Latitud Salida',
        digits=(10, 7),
        help='Coordenada GPS latitud al marcar salida'
    )
    
    x_longitude_out = fields.Float(
        string='Longitud Salida',
        digits=(10, 7),
        help='Coordenada GPS longitud al marcar salida'
    )
    
    x_accuracy_out = fields.Float(
        string='Precisión Salida (metros)',
        digits=(10, 2),
        help='Precisión de la ubicación GPS al marcar salida'
    )
```

### Instalar el Módulo

1. Copiar la carpeta `hr_attendance_gps` a `/odoo/addons/`
2. Reiniciar Odoo: `sudo systemctl restart odoo`
3. Ir a **Aplicaciones** > Actualizar lista de aplicaciones
4. Buscar "HR Attendance GPS"
5. Instalar

---

## 📊 Vista de los Campos en Odoo

Para ver los campos en la interfaz, agrega una vista personalizada:

### Archivo: `views/hr_attendance_views.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo>
    <!-- Vista de formulario extendida -->
    <record id="view_attendance_form_gps" model="ir.ui.view">
        <field name="name">hr.attendance.form.gps</field>
        <field name="model">hr.attendance</field>
        <field name="inherit_id" ref="hr_attendance.hr_attendance_view_form"/>
        <field name="arch" type="xml">
            <xpath expr="//field[@name='check_out']" position="after">
                <group string="Ubicación GPS - Entrada">
                    <field name="x_latitude"/>
                    <field name="x_longitude"/>
                    <field name="x_accuracy"/>
                </group>
                <group string="Ubicación GPS - Salida">
                    <field name="x_latitude_out"/>
                    <field name="x_longitude_out"/>
                    <field name="x_accuracy_out"/>
                </group>
            </xpath>
        </field>
    </record>
    
    <!-- Vista de árbol con coordenadas -->
    <record id="view_attendance_tree_gps" model="ir.ui.view">
        <field name="name">hr.attendance.tree.gps</field>
        <field name="model">hr.attendance</field>
        <field name="inherit_id" ref="hr_attendance.view_attendance_tree"/>
        <field name="arch" type="xml">
            <xpath expr="//field[@name='worked_hours']" position="after">
                <field name="x_latitude" optional="hide"/>
                <field name="x_longitude" optional="hide"/>
            </xpath>
        </field>
    </record>
</odoo>
```

---

## ✅ Checklist Final

Después de crear los campos, verifica:

- [ ] 6 campos creados en el modelo `hr.attendance`
- [ ] Campos visibles en Ajustes > Técnico > Modelos > hr.attendance > Campos
- [ ] Reiniciar Odoo si usaste script SQL
- [ ] Probar marcar asistencia desde la app
- [ ] Verificar que las coordenadas se guardan:
  ```sql
  SELECT * FROM hr_attendance WHERE x_latitude IS NOT NULL LIMIT 1;
  ```
- [ ] Si hay coordenadas, ¡todo funciona! 🎉

---

## 🆘 Solución de Problemas

### Problema 1: "Campo no existe"
**Error:** `column hr_attendance.x_latitude does not exist`

**Solución:**
```sql
-- Verificar que la columna existe
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'hr_attendance' AND column_name = 'x_latitude';

-- Si no existe, crearla
ALTER TABLE hr_attendance ADD COLUMN x_latitude NUMERIC(10,7);
```

### Problema 2: "Odoo no reconoce el campo"
**Solución:**
1. Reiniciar Odoo: `sudo systemctl restart odoo`
2. Limpiar caché del navegador (Ctrl+F5)
3. Verificar en ir_model_fields:
   ```sql
   SELECT * FROM ir_model_fields 
   WHERE model = 'hr.attendance' AND name = 'x_latitude';
   ```

### Problema 3: "No puedo acceder a Ajustes > Técnico"
**Solución:**
- Tu usuario necesita permisos de "Settings" (Administrador)
- O activa el modo desarrollador: Ajustes > Activar modo de desarrollador

---

## 📞 Resumen para tu Caso

**Tu base de datos:** `db_akallpa_nueva`

**Comando rápido (PostgreSQL):**
```bash
psql -U odoo -d db_akallpa_nueva -c "
ALTER TABLE hr_attendance 
ADD COLUMN IF NOT EXISTS x_latitude NUMERIC(10,7),
ADD COLUMN IF NOT EXISTS x_longitude NUMERIC(10,7),
ADD COLUMN IF NOT EXISTS x_accuracy NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS x_latitude_out NUMERIC(10,7),
ADD COLUMN IF NOT EXISTS x_longitude_out NUMERIC(10,7),
ADD COLUMN IF NOT EXISTS x_accuracy_out NUMERIC(10,2);
"

# Luego reiniciar Odoo
sudo systemctl restart odoo
```

¡Eso es todo! Los 6 campos estarán listos para recibir coordenadas GPS. 🎯
