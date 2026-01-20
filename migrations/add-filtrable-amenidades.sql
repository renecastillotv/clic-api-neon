-- ============================================================================
-- MIGRATION: Add filtrable column to amenidades table
-- Purpose: Mark which amenities should appear in filter dropdowns
-- ============================================================================

-- 1. Add filtrable column if it doesn't exist
ALTER TABLE amenidades
ADD COLUMN IF NOT EXISTS filtrable BOOLEAN DEFAULT false;

-- 2. Add orden column if it doesn't exist (for sorting)
ALTER TABLE amenidades
ADD COLUMN IF NOT EXISTS orden INTEGER DEFAULT 999;

-- 3. Mark important amenities as filtrable
-- These are the most commonly searched amenities
UPDATE amenidades SET filtrable = true, orden = 1 WHERE LOWER(nombre) IN ('piscina', 'pool', 'swimming pool');
UPDATE amenidades SET filtrable = true, orden = 2 WHERE LOWER(nombre) IN ('gimnasio', 'gym', 'fitness center');
UPDATE amenidades SET filtrable = true, orden = 3 WHERE LOWER(nombre) IN ('terraza', 'balcon', 'terrace', 'balcony');
UPDATE amenidades SET filtrable = true, orden = 4 WHERE LOWER(nombre) IN ('jacuzzi', 'hot tub', 'spa');
UPDATE amenidades SET filtrable = true, orden = 5 WHERE LOWER(nombre) IN ('seguridad 24/7', 'seguridad', 'security', '24h security');
UPDATE amenidades SET filtrable = true, orden = 6 WHERE LOWER(nombre) IN ('area social', 'area de eventos', 'social area', 'party room');
UPDATE amenidades SET filtrable = true, orden = 7 WHERE LOWER(nombre) IN ('lobby', 'recepcion');
UPDATE amenidades SET filtrable = true, orden = 8 WHERE LOWER(nombre) IN ('ascensor', 'elevator');
UPDATE amenidades SET filtrable = true, orden = 9 WHERE LOWER(nombre) IN ('planta electrica', 'generador', 'generator', 'power plant');
UPDATE amenidades SET filtrable = true, orden = 10 WHERE LOWER(nombre) IN ('cisterna', 'tanque de agua', 'water tank');
UPDATE amenidades SET filtrable = true, orden = 11 WHERE LOWER(nombre) IN ('amueblado', 'furnished');
UPDATE amenidades SET filtrable = true, orden = 12 WHERE LOWER(nombre) IN ('aire acondicionado', 'ac', 'air conditioning');
UPDATE amenidades SET filtrable = true, orden = 13 WHERE LOWER(nombre) IN ('cocina', 'kitchen');
UPDATE amenidades SET filtrable = true, orden = 14 WHERE LOWER(nombre) IN ('area de bbq', 'bbq', 'parrillero', 'grill area');
UPDATE amenidades SET filtrable = true, orden = 15 WHERE LOWER(nombre) IN ('jardin', 'garden');

-- Also update by codigo if it exists
UPDATE amenidades SET filtrable = true, orden = 1 WHERE LOWER(codigo) = 'piscina';
UPDATE amenidades SET filtrable = true, orden = 2 WHERE LOWER(codigo) = 'gimnasio';
UPDATE amenidades SET filtrable = true, orden = 3 WHERE LOWER(codigo) IN ('terraza', 'balcon');
UPDATE amenidades SET filtrable = true, orden = 4 WHERE LOWER(codigo) = 'jacuzzi';
UPDATE amenidades SET filtrable = true, orden = 5 WHERE LOWER(codigo) = 'seguridad';
UPDATE amenidades SET filtrable = true, orden = 6 WHERE LOWER(codigo) = 'area-social';
UPDATE amenidades SET filtrable = true, orden = 7 WHERE LOWER(codigo) = 'lobby';
UPDATE amenidades SET filtrable = true, orden = 8 WHERE LOWER(codigo) = 'ascensor';
UPDATE amenidades SET filtrable = true, orden = 9 WHERE LOWER(codigo) IN ('planta-electrica', 'generador');
UPDATE amenidades SET filtrable = true, orden = 10 WHERE LOWER(codigo) = 'cisterna';
UPDATE amenidades SET filtrable = true, orden = 11 WHERE LOWER(codigo) = 'amueblado';
UPDATE amenidades SET filtrable = true, orden = 12 WHERE LOWER(codigo) = 'aire-acondicionado';

-- 4. Create index for faster filter queries
CREATE INDEX IF NOT EXISTS idx_amenidades_filtrable ON amenidades(filtrable) WHERE filtrable = true;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- SELECT nombre, codigo, filtrable, orden FROM amenidades WHERE filtrable = true ORDER BY orden;
