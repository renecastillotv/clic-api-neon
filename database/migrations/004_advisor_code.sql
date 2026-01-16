-- ================================================================
-- MIGRACIÓN: Agregar código público a perfiles_asesor
-- Ejecutar en Neon PostgreSQL
-- ================================================================

-- Agregar columna codigo si no existe
ALTER TABLE perfiles_asesor ADD COLUMN IF NOT EXISTS codigo VARCHAR(20) UNIQUE;

-- Crear índice para búsqueda rápida por código
CREATE INDEX IF NOT EXISTS idx_perfiles_asesor_codigo ON perfiles_asesor(codigo);

-- Generar códigos para asesores existentes que no tengan
-- Formato: Primeras 3 letras del nombre + 3 dígitos aleatorios (ej: JUA-123)
UPDATE perfiles_asesor
SET codigo = UPPER(LEFT(REGEXP_REPLACE(nombre, '[^a-zA-Z]', '', 'g'), 3)) || '-' || LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0')
WHERE codigo IS NULL AND nombre IS NOT NULL;

-- Para los que no tienen nombre, usar ID parcial
UPDATE perfiles_asesor
SET codigo = 'ASE-' || LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0')
WHERE codigo IS NULL;

-- Comentario
COMMENT ON COLUMN perfiles_asesor.codigo IS 'Código público único del asesor para tracking (ej: JUA-123)';
