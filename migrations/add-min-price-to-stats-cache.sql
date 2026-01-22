-- ============================================================================
-- MIGRATION: Add min_price columns to stats_cache (v2 - separated by operation)
-- Purpose: Store minimum price per location/type for display in UI
-- Separates venta vs alquiler and normalizes to USD
-- ============================================================================

-- Tasa de conversión aproximada DOP a USD (actualizar según necesidad)
-- 1 USD = ~58 DOP (enero 2025)
-- Para obtener USD desde DOP: precio_dop / 58

-- 1. Add new columns to stats_cache
-- ============================================================================
ALTER TABLE stats_cache
ADD COLUMN IF NOT EXISTS min_price_venta DECIMAL(15,2),
ADD COLUMN IF NOT EXISTS min_price_venta_currency VARCHAR(10) DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS min_price_alquiler DECIMAL(15,2),
ADD COLUMN IF NOT EXISTS min_price_alquiler_currency VARCHAR(10) DEFAULT 'USD';

-- Drop old columns if they exist (from previous migration)
ALTER TABLE stats_cache
DROP COLUMN IF EXISTS min_price,
DROP COLUMN IF EXISTS min_price_currency;

-- 2. Update recalculate_all_stats function to include separated min_prices
-- ============================================================================
CREATE OR REPLACE FUNCTION recalculate_all_stats(p_tenant_id UUID)
RETURNS void AS $$
DECLARE
    v_exchange_rate DECIMAL := 58.0; -- DOP to USD rate
BEGIN
    -- Clear existing stats for this tenant
    DELETE FROM stats_cache WHERE tenant_id = p_tenant_id;

    -- Insert stats for property types (tipo) with min_price separated
    INSERT INTO stats_cache (tenant_id, category, slug, display_name, count, count_venta, count_alquiler,
                             min_price_venta, min_price_venta_currency, min_price_alquiler, min_price_alquiler_currency, updated_at)
    SELECT
        p_tenant_id,
        'tipo',
        LOWER(REPLACE(TRIM(tipo), ' ', '-')),
        TRIM(tipo),
        COUNT(*),
        COUNT(*) FILTER (WHERE operacion = 'venta'),
        COUNT(*) FILTER (WHERE operacion = 'alquiler'),
        -- Min price venta (normalizado a USD)
        MIN(
            CASE
                WHEN operacion = 'venta' AND COALESCE(precio_venta, precio) > 0 THEN
                    CASE
                        WHEN UPPER(moneda) = 'DOP' THEN COALESCE(precio_venta, precio) / v_exchange_rate
                        ELSE COALESCE(precio_venta, precio)
                    END
                ELSE NULL
            END
        ),
        'USD',
        -- Min price alquiler (normalizado a USD)
        MIN(
            CASE
                WHEN operacion = 'alquiler' AND COALESCE(precio_alquiler, precio) > 0 THEN
                    CASE
                        WHEN UPPER(moneda) = 'DOP' THEN COALESCE(precio_alquiler, precio) / v_exchange_rate
                        ELSE COALESCE(precio_alquiler, precio)
                    END
                ELSE NULL
            END
        ),
        'USD',
        NOW()
    FROM propiedades
    WHERE tenant_id = p_tenant_id
      AND activo = true
      AND estado_propiedad = 'disponible'
      AND tipo IS NOT NULL
      AND TRIM(tipo) != ''
    GROUP BY TRIM(tipo);

    -- Insert stats for operations (operacion) with appropriate min_price
    INSERT INTO stats_cache (tenant_id, category, slug, display_name, count,
                             min_price_venta, min_price_venta_currency, min_price_alquiler, min_price_alquiler_currency, updated_at)
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
        -- Para operación venta, solo calcular min_price_venta
        CASE WHEN LOWER(operacion) = 'venta' THEN
            MIN(
                CASE
                    WHEN COALESCE(precio_venta, precio) > 0 THEN
                        CASE
                            WHEN UPPER(moneda) = 'DOP' THEN COALESCE(precio_venta, precio) / v_exchange_rate
                            ELSE COALESCE(precio_venta, precio)
                        END
                    ELSE NULL
                END
            )
        ELSE NULL END,
        'USD',
        -- Para operación alquiler, solo calcular min_price_alquiler
        CASE WHEN LOWER(operacion) = 'alquiler' THEN
            MIN(
                CASE
                    WHEN COALESCE(precio_alquiler, precio) > 0 THEN
                        CASE
                            WHEN UPPER(moneda) = 'DOP' THEN COALESCE(precio_alquiler, precio) / v_exchange_rate
                            ELSE COALESCE(precio_alquiler, precio)
                        END
                    ELSE NULL
                END
            )
        ELSE NULL END,
        'USD',
        NOW()
    FROM propiedades
    WHERE tenant_id = p_tenant_id
      AND activo = true
      AND estado_propiedad = 'disponible'
      AND operacion IS NOT NULL
    GROUP BY LOWER(operacion), operacion;

    -- Insert stats for provinces (provincia) with min_price separated
    INSERT INTO stats_cache (tenant_id, category, slug, display_name, count, count_venta, count_alquiler,
                             min_price_venta, min_price_venta_currency, min_price_alquiler, min_price_alquiler_currency, updated_at)
    SELECT
        p_tenant_id,
        'provincia',
        LOWER(REPLACE(TRIM(provincia), ' ', '-')),
        TRIM(provincia),
        COUNT(*),
        COUNT(*) FILTER (WHERE operacion = 'venta'),
        COUNT(*) FILTER (WHERE operacion = 'alquiler'),
        -- Min price venta
        MIN(
            CASE
                WHEN operacion = 'venta' AND COALESCE(precio_venta, precio) > 0 THEN
                    CASE
                        WHEN UPPER(moneda) = 'DOP' THEN COALESCE(precio_venta, precio) / v_exchange_rate
                        ELSE COALESCE(precio_venta, precio)
                    END
                ELSE NULL
            END
        ),
        'USD',
        -- Min price alquiler
        MIN(
            CASE
                WHEN operacion = 'alquiler' AND COALESCE(precio_alquiler, precio) > 0 THEN
                    CASE
                        WHEN UPPER(moneda) = 'DOP' THEN COALESCE(precio_alquiler, precio) / v_exchange_rate
                        ELSE COALESCE(precio_alquiler, precio)
                    END
                ELSE NULL
            END
        ),
        'USD',
        NOW()
    FROM propiedades
    WHERE tenant_id = p_tenant_id
      AND activo = true
      AND estado_propiedad = 'disponible'
      AND provincia IS NOT NULL
      AND TRIM(provincia) != ''
    GROUP BY TRIM(provincia);

    -- Insert stats for cities (ciudad) with min_price separated
    INSERT INTO stats_cache (tenant_id, category, slug, display_name, count, count_venta, count_alquiler, parent_slug,
                             min_price_venta, min_price_venta_currency, min_price_alquiler, min_price_alquiler_currency, updated_at)
    SELECT
        p_tenant_id,
        'ciudad',
        LOWER(REPLACE(TRIM(ciudad), ' ', '-')),
        TRIM(ciudad),
        COUNT(*),
        COUNT(*) FILTER (WHERE operacion = 'venta'),
        COUNT(*) FILTER (WHERE operacion = 'alquiler'),
        LOWER(REPLACE(TRIM(MIN(provincia)), ' ', '-')),
        -- Min price venta
        MIN(
            CASE
                WHEN operacion = 'venta' AND COALESCE(precio_venta, precio) > 0 THEN
                    CASE
                        WHEN UPPER(moneda) = 'DOP' THEN COALESCE(precio_venta, precio) / v_exchange_rate
                        ELSE COALESCE(precio_venta, precio)
                    END
                ELSE NULL
            END
        ),
        'USD',
        -- Min price alquiler
        MIN(
            CASE
                WHEN operacion = 'alquiler' AND COALESCE(precio_alquiler, precio) > 0 THEN
                    CASE
                        WHEN UPPER(moneda) = 'DOP' THEN COALESCE(precio_alquiler, precio) / v_exchange_rate
                        ELSE COALESCE(precio_alquiler, precio)
                    END
                ELSE NULL
            END
        ),
        'USD',
        NOW()
    FROM propiedades
    WHERE tenant_id = p_tenant_id
      AND activo = true
      AND estado_propiedad = 'disponible'
      AND ciudad IS NOT NULL
      AND TRIM(ciudad) != ''
    GROUP BY TRIM(ciudad);

    -- Insert stats for sectors (sector) with min_price separated
    INSERT INTO stats_cache (tenant_id, category, slug, display_name, count, count_venta, count_alquiler, parent_slug,
                             min_price_venta, min_price_venta_currency, min_price_alquiler, min_price_alquiler_currency, updated_at)
    SELECT
        p_tenant_id,
        'sector',
        LOWER(REPLACE(TRIM(sector), ' ', '-')),
        TRIM(sector),
        COUNT(*),
        COUNT(*) FILTER (WHERE operacion = 'venta'),
        COUNT(*) FILTER (WHERE operacion = 'alquiler'),
        LOWER(REPLACE(TRIM(MIN(ciudad)), ' ', '-')),
        -- Min price venta
        MIN(
            CASE
                WHEN operacion = 'venta' AND COALESCE(precio_venta, precio) > 0 THEN
                    CASE
                        WHEN UPPER(moneda) = 'DOP' THEN COALESCE(precio_venta, precio) / v_exchange_rate
                        ELSE COALESCE(precio_venta, precio)
                    END
                ELSE NULL
            END
        ),
        'USD',
        -- Min price alquiler
        MIN(
            CASE
                WHEN operacion = 'alquiler' AND COALESCE(precio_alquiler, precio) > 0 THEN
                    CASE
                        WHEN UPPER(moneda) = 'DOP' THEN COALESCE(precio_alquiler, precio) / v_exchange_rate
                        ELSE COALESCE(precio_alquiler, precio)
                    END
                ELSE NULL
            END
        ),
        'USD',
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
        RAISE NOTICE 'Recalculated stats with separated min_price for tenant: %', t_record.id;
    END LOOP;
END $$;

-- ============================================================================
-- VERIFICATION:
-- ============================================================================
-- Check that min_price was populated:
--   SELECT category, slug, display_name, count, count_venta, count_alquiler,
--          min_price_venta, min_price_alquiler
--   FROM stats_cache
--   WHERE (min_price_venta IS NOT NULL OR min_price_alquiler IS NOT NULL)
--   ORDER BY category, count DESC
--   LIMIT 20;
-- ============================================================================
