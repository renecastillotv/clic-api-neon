-- ============================================================================
-- MIGRATION: Add min_price columns to stats_cache
-- Purpose: Store minimum price per location/type for display in UI
-- ============================================================================

-- 1. Add new columns to stats_cache
-- ============================================================================
ALTER TABLE stats_cache
ADD COLUMN IF NOT EXISTS min_price DECIMAL(15,2),
ADD COLUMN IF NOT EXISTS min_price_currency VARCHAR(10) DEFAULT 'USD';

-- 2. Update recalculate_all_stats function to include min_price
-- ============================================================================
CREATE OR REPLACE FUNCTION recalculate_all_stats(p_tenant_id UUID)
RETURNS void AS $$
BEGIN
    -- Clear existing stats for this tenant
    DELETE FROM stats_cache WHERE tenant_id = p_tenant_id;

    -- Insert stats for property types (tipo) with min_price
    INSERT INTO stats_cache (tenant_id, category, slug, display_name, count, count_venta, count_alquiler, min_price, min_price_currency, updated_at)
    SELECT
        p_tenant_id,
        'tipo',
        LOWER(REPLACE(TRIM(tipo), ' ', '-')),
        TRIM(tipo),
        COUNT(*),
        COUNT(*) FILTER (WHERE operacion = 'venta'),
        COUNT(*) FILTER (WHERE operacion = 'alquiler'),
        MIN(COALESCE(precio_venta, precio_alquiler, precio)) FILTER (WHERE COALESCE(precio_venta, precio_alquiler, precio) > 0),
        COALESCE(MIN(moneda) FILTER (WHERE COALESCE(precio_venta, precio_alquiler, precio) > 0), 'USD'),
        NOW()
    FROM propiedades
    WHERE tenant_id = p_tenant_id
      AND activo = true
      AND estado_propiedad = 'disponible'
      AND tipo IS NOT NULL
      AND TRIM(tipo) != ''
    GROUP BY TRIM(tipo);

    -- Insert stats for operations (operacion) with min_price
    INSERT INTO stats_cache (tenant_id, category, slug, display_name, count, min_price, min_price_currency, updated_at)
    SELECT
        p_tenant_id,
        'operacion',
        LOWER(operacion),
        CASE
            WHEN LOWER(operacion) = 'venta' THEN 'Venta'
            WHEN LOWER(operacion) = 'alquiler' THEN 'Alquiler'
            ELSE operacion
        END,
        COUNT(*),
        MIN(COALESCE(precio_venta, precio_alquiler, precio)) FILTER (WHERE COALESCE(precio_venta, precio_alquiler, precio) > 0),
        COALESCE(MIN(moneda) FILTER (WHERE COALESCE(precio_venta, precio_alquiler, precio) > 0), 'USD'),
        NOW()
    FROM propiedades
    WHERE tenant_id = p_tenant_id
      AND activo = true
      AND estado_propiedad = 'disponible'
      AND operacion IS NOT NULL
    GROUP BY LOWER(operacion), operacion;

    -- Insert stats for provinces (provincia) with min_price
    INSERT INTO stats_cache (tenant_id, category, slug, display_name, count, count_venta, count_alquiler, min_price, min_price_currency, updated_at)
    SELECT
        p_tenant_id,
        'provincia',
        LOWER(REPLACE(TRIM(provincia), ' ', '-')),
        TRIM(provincia),
        COUNT(*),
        COUNT(*) FILTER (WHERE operacion = 'venta'),
        COUNT(*) FILTER (WHERE operacion = 'alquiler'),
        MIN(COALESCE(precio_venta, precio_alquiler, precio)) FILTER (WHERE COALESCE(precio_venta, precio_alquiler, precio) > 0),
        COALESCE(MIN(moneda) FILTER (WHERE COALESCE(precio_venta, precio_alquiler, precio) > 0), 'USD'),
        NOW()
    FROM propiedades
    WHERE tenant_id = p_tenant_id
      AND activo = true
      AND estado_propiedad = 'disponible'
      AND provincia IS NOT NULL
      AND TRIM(provincia) != ''
    GROUP BY TRIM(provincia);

    -- Insert stats for cities (ciudad) with min_price
    INSERT INTO stats_cache (tenant_id, category, slug, display_name, count, count_venta, count_alquiler, parent_slug, min_price, min_price_currency, updated_at)
    SELECT
        p_tenant_id,
        'ciudad',
        LOWER(REPLACE(TRIM(ciudad), ' ', '-')),
        TRIM(ciudad),
        COUNT(*),
        COUNT(*) FILTER (WHERE operacion = 'venta'),
        COUNT(*) FILTER (WHERE operacion = 'alquiler'),
        LOWER(REPLACE(TRIM(MIN(provincia)), ' ', '-')),
        MIN(COALESCE(precio_venta, precio_alquiler, precio)) FILTER (WHERE COALESCE(precio_venta, precio_alquiler, precio) > 0),
        COALESCE(MIN(moneda) FILTER (WHERE COALESCE(precio_venta, precio_alquiler, precio) > 0), 'USD'),
        NOW()
    FROM propiedades
    WHERE tenant_id = p_tenant_id
      AND activo = true
      AND estado_propiedad = 'disponible'
      AND ciudad IS NOT NULL
      AND TRIM(ciudad) != ''
    GROUP BY TRIM(ciudad);

    -- Insert stats for sectors (sector) with min_price
    INSERT INTO stats_cache (tenant_id, category, slug, display_name, count, count_venta, count_alquiler, parent_slug, min_price, min_price_currency, updated_at)
    SELECT
        p_tenant_id,
        'sector',
        LOWER(REPLACE(TRIM(sector), ' ', '-')),
        TRIM(sector),
        COUNT(*),
        COUNT(*) FILTER (WHERE operacion = 'venta'),
        COUNT(*) FILTER (WHERE operacion = 'alquiler'),
        LOWER(REPLACE(TRIM(MIN(ciudad)), ' ', '-')),
        MIN(COALESCE(precio_venta, precio_alquiler, precio)) FILTER (WHERE COALESCE(precio_venta, precio_alquiler, precio) > 0),
        COALESCE(MIN(moneda) FILTER (WHERE COALESCE(precio_venta, precio_alquiler, precio) > 0), 'USD'),
        NOW()
    FROM propiedades
    WHERE tenant_id = p_tenant_id
      AND activo = true
      AND estado_propiedad = 'disponible'
      AND sector IS NOT NULL
      AND TRIM(sector) != ''
    GROUP BY TRIM(sector);

    RAISE NOTICE 'Stats recalculated for tenant %', p_tenant_id;
END;
$$ LANGUAGE plpgsql;

-- 3. Recalculate stats for all tenants to populate min_price
-- ============================================================================
DO $$
DECLARE
    t_record RECORD;
BEGIN
    FOR t_record IN SELECT id FROM tenants LOOP
        PERFORM recalculate_all_stats(t_record.id);
        RAISE NOTICE 'Recalculated stats with min_price for tenant: %', t_record.id;
    END LOOP;
END $$;

-- ============================================================================
-- VERIFICATION:
-- ============================================================================
-- Check that min_price was populated:
--   SELECT category, slug, display_name, count, min_price, min_price_currency
--   FROM stats_cache
--   WHERE min_price IS NOT NULL
--   ORDER BY category, count DESC
--   LIMIT 20;
-- ============================================================================
