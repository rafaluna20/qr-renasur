-- ============================================
-- SCRIPT: Crear Campos GPS en hr.attendance
-- ============================================
-- Base de datos: db_akallpa_nueva
-- Modelo: hr.attendance
-- Cantidad de campos: 6 (3 entrada + 3 salida)
-- 
-- USO:
--   psql -U odoo -d db_akallpa_nueva -f create_gps_fields.sql
--
-- IMPORTANTE: Reiniciar Odoo después de ejecutar:
--   sudo systemctl restart odoo
-- ============================================

-- Paso 1: Crear columnas en la tabla hr_attendance
ALTER TABLE hr_attendance 
ADD COLUMN IF NOT EXISTS x_latitude NUMERIC(10,7),
ADD COLUMN IF NOT EXISTS x_longitude NUMERIC(10,7),
ADD COLUMN IF NOT EXISTS x_accuracy NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS x_latitude_out NUMERIC(10,7),
ADD COLUMN IF NOT EXISTS x_longitude_out NUMERIC(10,7),
ADD COLUMN IF NOT EXISTS x_accuracy_out NUMERIC(10,2);

-- Paso 2: Registrar los campos en Odoo (metadatos)
DO $$
DECLARE
    model_id INTEGER;
BEGIN
    -- Obtener ID del modelo hr.attendance
    SELECT id INTO model_id FROM ir_model WHERE model = 'hr.attendance';
    
    IF model_id IS NULL THEN
        RAISE EXCEPTION 'Modelo hr.attendance no encontrado';
    END IF;
    
    -- Campo: x_latitude (Latitud Entrada)
    INSERT INTO ir_model_fields (
        name, model_id, model, field_description, ttype, state, store
    ) VALUES (
        'x_latitude', model_id, 'hr.attendance', 'Latitud Entrada', 'float', 'manual', true
    ) ON CONFLICT (name, model_id) DO NOTHING;
    
    -- Campo: x_longitude (Longitud Entrada)
    INSERT INTO ir_model_fields (
        name, model_id, model, field_description, ttype, state, store
    ) VALUES (
        'x_longitude', model_id, 'hr.attendance', 'Longitud Entrada', 'float', 'manual', true
    ) ON CONFLICT (name, model_id) DO NOTHING;
    
    -- Campo: x_accuracy (Precisión Entrada)
    INSERT INTO ir_model_fields (
        name, model_id, model, field_description, ttype, state, store
    ) VALUES (
        'x_accuracy', model_id, 'hr.attendance', 'Precisión Entrada (m)', 'float', 'manual', true
    ) ON CONFLICT (name, model_id) DO NOTHING;
    
    -- Campo: x_latitude_out (Latitud Salida)
    INSERT INTO ir_model_fields (
        name, model_id, model, field_description, ttype, state, store
    ) VALUES (
        'x_latitude_out', model_id, 'hr.attendance', 'Latitud Salida', 'float', 'manual', true
    ) ON CONFLICT (name, model_id) DO NOTHING;
    
    -- Campo: x_longitude_out (Longitud Salida)
    INSERT INTO ir_model_fields (
        name, model_id, model, field_description, ttype, state, store
    ) VALUES (
        'x_longitude_out', model_id, 'hr.attendance', 'Longitud Salida', 'float', 'manual', true
    ) ON CONFLICT (name, model_id) DO NOTHING;
    
    -- Campo: x_accuracy_out (Precisión Salida)
    INSERT INTO ir_model_fields (
        name, model_id, model, field_description, ttype, state, store
    ) VALUES (
        'x_accuracy_out', model_id, 'hr.attendance', 'Precisión Salida (m)', 'float', 'manual', true
    ) ON CONFLICT (name, model_id) DO NOTHING;
    
    RAISE NOTICE 'Campos GPS creados exitosamente';
END $$;

-- Paso 3: Verificar que se crearon correctamente
SELECT 
    column_name, 
    data_type, 
    numeric_precision, 
    numeric_scale
FROM information_schema.columns 
WHERE table_name = 'hr_attendance' 
  AND column_name LIKE 'x_%'
ORDER BY column_name;

-- Resultado esperado:
-- column_name      | data_type | numeric_precision | numeric_scale
-- -----------------+-----------+-------------------+--------------
-- x_accuracy       | numeric   | 10                | 2
-- x_accuracy_out   | numeric   | 10                | 2
-- x_latitude       | numeric   | 10                | 7
-- x_latitude_out   | numeric   | 10                | 7
-- x_longitude      | numeric   | 10                | 7
-- x_longitude_out  | numeric   | 10                | 7
