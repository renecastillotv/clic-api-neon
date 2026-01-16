-- ================================================================
-- MIGRACIÓN: Agregar email y código público a device_favorites
-- Ejecutar en Neon PostgreSQL
-- ================================================================

-- Agregar columnas si no existen
ALTER TABLE device_favorites ADD COLUMN IF NOT EXISTS public_code TEXT UNIQUE;
ALTER TABLE device_favorites ADD COLUMN IF NOT EXISTS owner_email TEXT;

-- Crear índices
CREATE INDEX IF NOT EXISTS idx_device_favorites_email ON device_favorites(owner_email);
CREATE INDEX IF NOT EXISTS idx_device_favorites_public_code ON device_favorites(public_code);

-- Generar códigos públicos para registros existentes que no tengan
-- Formato: CLIC-XXXX (4 dígitos aleatorios)
UPDATE device_favorites
SET public_code = 'CLIC-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0')
WHERE public_code IS NULL;

-- Comentarios
COMMENT ON COLUMN device_favorites.public_code IS 'Código público amigable para compartir (ej: CLIC-1234)';
COMMENT ON COLUMN device_favorites.owner_email IS 'Email del dueño para recuperar la lista en otros dispositivos';
