-- ============================================================================
-- MIGRATION: Create stats_cache table and triggers
-- Purpose: Store pre-calculated counts for property types and locations
-- ============================================================================

-- 1. Create the stats_cache table
-- ============================================================================
CREATE TABLE IF NOT EXISTS stats_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL,  -- 'tipo', 'provincia', 'ciudad', 'sector', 'operacion'
    slug VARCHAR(255) NOT NULL,     -- 'apartamento', 'santo-domingo', etc.
    display_name VARCHAR(255),       -- 'Apartamento', 'Santo Domingo', etc.
    count INTEGER DEFAULT 0,
    count_venta INTEGER DEFAULT 0,   -- Count for sale only
    count_alquiler INTEGER DEFAULT 0, -- Count for rent only
    parent_slug VARCHAR(255),        -- For hierarchy (sector -> ciudad, ciudad -> provincia)
    metadata JSONB DEFAULT '{}',     -- Extra info (images, descriptions, etc.)
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Unique constraint per tenant + category + slug
    UNIQUE(tenant_id, category, slug)
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_stats_cache_tenant ON stats_cache(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stats_cache_category ON stats_cache(tenant_id, category);
CREATE INDEX IF NOT EXISTS idx_stats_cache_count ON stats_cache(tenant_id, category, count DESC);

-- 2. Function to recalculate ALL stats for a tenant
-- ============================================================================
CREATE OR REPLACE FUNCTION recalculate_all_stats(p_tenant_id UUID)
RETURNS void AS $$
BEGIN
    -- Clear existing stats for this tenant
    DELETE FROM stats_cache WHERE tenant_id = p_tenant_id;

    -- Insert stats for property types (tipo)
    INSERT INTO stats_cache (tenant_id, category, slug, display_name, count, count_venta, count_alquiler, updated_at)
    SELECT
        p_tenant_id,
        'tipo',
        LOWER(REPLACE(TRIM(tipo), ' ', '-')),
        TRIM(tipo),
        COUNT(*),
        COUNT(*) FILTER (WHERE operacion = 'venta'),
        COUNT(*) FILTER (WHERE operacion = 'alquiler'),
        NOW()
    FROM propiedades
    WHERE tenant_id = p_tenant_id
      AND activo = true
      AND estado_propiedad = 'disponible'
      AND tipo IS NOT NULL
      AND TRIM(tipo) != ''
    GROUP BY TRIM(tipo);

    -- Insert stats for operations (operacion)
    INSERT INTO stats_cache (tenant_id, category, slug, display_name, count, updated_at)
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
        NOW()
    FROM propiedades
    WHERE tenant_id = p_tenant_id
      AND activo = true
      AND estado_propiedad = 'disponible'
      AND operacion IS NOT NULL
    GROUP BY LOWER(operacion), operacion;

    -- Insert stats for provinces (provincia)
    INSERT INTO stats_cache (tenant_id, category, slug, display_name, count, count_venta, count_alquiler, updated_at)
    SELECT
        p_tenant_id,
        'provincia',
        LOWER(REPLACE(TRIM(provincia), ' ', '-')),
        TRIM(provincia),
        COUNT(*),
        COUNT(*) FILTER (WHERE operacion = 'venta'),
        COUNT(*) FILTER (WHERE operacion = 'alquiler'),
        NOW()
    FROM propiedades
    WHERE tenant_id = p_tenant_id
      AND activo = true
      AND estado_propiedad = 'disponible'
      AND provincia IS NOT NULL
      AND TRIM(provincia) != ''
    GROUP BY TRIM(provincia);

    -- Insert stats for cities (ciudad)
    INSERT INTO stats_cache (tenant_id, category, slug, display_name, count, count_venta, count_alquiler, parent_slug, updated_at)
    SELECT
        p_tenant_id,
        'ciudad',
        LOWER(REPLACE(TRIM(ciudad), ' ', '-')),
        TRIM(ciudad),
        COUNT(*),
        COUNT(*) FILTER (WHERE operacion = 'venta'),
        COUNT(*) FILTER (WHERE operacion = 'alquiler'),
        LOWER(REPLACE(TRIM(MIN(provincia)), ' ', '-')),  -- parent province
        NOW()
    FROM propiedades
    WHERE tenant_id = p_tenant_id
      AND activo = true
      AND estado_propiedad = 'disponible'
      AND ciudad IS NOT NULL
      AND TRIM(ciudad) != ''
    GROUP BY TRIM(ciudad);

    -- Insert stats for sectors (sector)
    INSERT INTO stats_cache (tenant_id, category, slug, display_name, count, count_venta, count_alquiler, parent_slug, updated_at)
    SELECT
        p_tenant_id,
        'sector',
        LOWER(REPLACE(TRIM(sector), ' ', '-')),
        TRIM(sector),
        COUNT(*),
        COUNT(*) FILTER (WHERE operacion = 'venta'),
        COUNT(*) FILTER (WHERE operacion = 'alquiler'),
        LOWER(REPLACE(TRIM(MIN(ciudad)), ' ', '-')),  -- parent city
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

-- 3. Function to update stats incrementally (called by trigger)
-- ============================================================================
CREATE OR REPLACE FUNCTION update_stats_on_property_change()
RETURNS TRIGGER AS $$
DECLARE
    v_tenant_id UUID;
    v_old_active BOOLEAN;
    v_new_active BOOLEAN;
    v_old_estado VARCHAR;
    v_new_estado VARCHAR;
BEGIN
    -- Determine tenant_id and states based on operation
    IF TG_OP = 'DELETE' THEN
        v_tenant_id := OLD.tenant_id;
        v_old_active := OLD.activo;
        v_new_active := FALSE;
        v_old_estado := OLD.estado_propiedad;
        v_new_estado := 'deleted';
    ELSIF TG_OP = 'INSERT' THEN
        v_tenant_id := NEW.tenant_id;
        v_old_active := FALSE;
        v_new_active := NEW.activo;
        v_old_estado := 'new';
        v_new_estado := NEW.estado_propiedad;
    ELSE -- UPDATE
        v_tenant_id := COALESCE(NEW.tenant_id, OLD.tenant_id);
        v_old_active := OLD.activo;
        v_new_active := NEW.activo;
        v_old_estado := OLD.estado_propiedad;
        v_new_estado := NEW.estado_propiedad;
    END IF;

    -- Check if the property visibility changed (affects counts)
    -- A property counts if: activo = true AND estado_propiedad = 'disponible'

    DECLARE
        v_was_visible BOOLEAN := (v_old_active = true AND v_old_estado = 'disponible');
        v_is_visible BOOLEAN := (v_new_active = true AND v_new_estado = 'disponible');
        v_delta INTEGER;
        v_delta_venta INTEGER := 0;
        v_delta_alquiler INTEGER := 0;
    BEGIN
        -- If visibility didn't change, no need to update stats
        IF v_was_visible = v_is_visible AND TG_OP = 'UPDATE' THEN
            -- But we still need to check if location/type changed
            IF OLD.tipo = NEW.tipo AND OLD.provincia = NEW.provincia
               AND OLD.ciudad = NEW.ciudad AND OLD.sector = NEW.sector
               AND OLD.operacion = NEW.operacion THEN
                RETURN COALESCE(NEW, OLD);
            END IF;
        END IF;

        -- Calculate delta
        IF v_was_visible AND NOT v_is_visible THEN
            v_delta := -1;
        ELSIF NOT v_was_visible AND v_is_visible THEN
            v_delta := 1;
        ELSIF v_was_visible AND v_is_visible AND TG_OP = 'UPDATE' THEN
            -- Property moved categories - handle old and new separately
            -- Decrement old values
            PERFORM update_single_stat(v_tenant_id, 'tipo', OLD.tipo, -1, OLD.operacion);
            PERFORM update_single_stat(v_tenant_id, 'provincia', OLD.provincia, -1, OLD.operacion);
            PERFORM update_single_stat(v_tenant_id, 'ciudad', OLD.ciudad, -1, OLD.operacion);
            PERFORM update_single_stat(v_tenant_id, 'sector', OLD.sector, -1, OLD.operacion);
            PERFORM update_single_stat(v_tenant_id, 'operacion', OLD.operacion, -1, NULL);

            -- Increment new values
            PERFORM update_single_stat(v_tenant_id, 'tipo', NEW.tipo, 1, NEW.operacion);
            PERFORM update_single_stat(v_tenant_id, 'provincia', NEW.provincia, 1, NEW.operacion);
            PERFORM update_single_stat(v_tenant_id, 'ciudad', NEW.ciudad, 1, NEW.operacion);
            PERFORM update_single_stat(v_tenant_id, 'sector', NEW.sector, 1, NEW.operacion);
            PERFORM update_single_stat(v_tenant_id, 'operacion', NEW.operacion, 1, NULL);

            RETURN NEW;
        ELSE
            v_delta := 0;
        END IF;

        -- Apply delta to relevant stats
        IF v_delta != 0 THEN
            IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NOT v_is_visible) THEN
                -- Use OLD values
                PERFORM update_single_stat(v_tenant_id, 'tipo', OLD.tipo, v_delta, OLD.operacion);
                PERFORM update_single_stat(v_tenant_id, 'provincia', OLD.provincia, v_delta, OLD.operacion);
                PERFORM update_single_stat(v_tenant_id, 'ciudad', OLD.ciudad, v_delta, OLD.operacion);
                PERFORM update_single_stat(v_tenant_id, 'sector', OLD.sector, v_delta, OLD.operacion);
                PERFORM update_single_stat(v_tenant_id, 'operacion', OLD.operacion, v_delta, NULL);
            ELSE
                -- Use NEW values
                PERFORM update_single_stat(v_tenant_id, 'tipo', NEW.tipo, v_delta, NEW.operacion);
                PERFORM update_single_stat(v_tenant_id, 'provincia', NEW.provincia, v_delta, NEW.operacion);
                PERFORM update_single_stat(v_tenant_id, 'ciudad', NEW.ciudad, v_delta, NEW.operacion);
                PERFORM update_single_stat(v_tenant_id, 'sector', NEW.sector, v_delta, NEW.operacion);
                PERFORM update_single_stat(v_tenant_id, 'operacion', NEW.operacion, v_delta, NULL);
            END IF;
        END IF;
    END;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 4. Helper function to update a single stat
-- ============================================================================
CREATE OR REPLACE FUNCTION update_single_stat(
    p_tenant_id UUID,
    p_category VARCHAR,
    p_value VARCHAR,
    p_delta INTEGER,
    p_operacion VARCHAR
)
RETURNS void AS $$
DECLARE
    v_slug VARCHAR;
    v_delta_venta INTEGER := 0;
    v_delta_alquiler INTEGER := 0;
BEGIN
    -- Skip if value is null or empty
    IF p_value IS NULL OR TRIM(p_value) = '' THEN
        RETURN;
    END IF;

    v_slug := LOWER(REPLACE(TRIM(p_value), ' ', '-'));

    -- Calculate operation-specific deltas
    IF p_operacion = 'venta' THEN
        v_delta_venta := p_delta;
    ELSIF p_operacion = 'alquiler' THEN
        v_delta_alquiler := p_delta;
    END IF;

    -- Upsert the stat
    INSERT INTO stats_cache (tenant_id, category, slug, display_name, count, count_venta, count_alquiler, updated_at)
    VALUES (p_tenant_id, p_category, v_slug, TRIM(p_value), GREATEST(0, p_delta), GREATEST(0, v_delta_venta), GREATEST(0, v_delta_alquiler), NOW())
    ON CONFLICT (tenant_id, category, slug)
    DO UPDATE SET
        count = GREATEST(0, stats_cache.count + p_delta),
        count_venta = GREATEST(0, stats_cache.count_venta + v_delta_venta),
        count_alquiler = GREATEST(0, stats_cache.count_alquiler + v_delta_alquiler),
        updated_at = NOW();

    -- Clean up zero-count entries (optional, keeps table clean)
    DELETE FROM stats_cache
    WHERE tenant_id = p_tenant_id
      AND category = p_category
      AND slug = v_slug
      AND count <= 0;
END;
$$ LANGUAGE plpgsql;

-- 5. Create the trigger on propiedades table
-- ============================================================================
DROP TRIGGER IF EXISTS trg_update_stats_cache ON propiedades;

CREATE TRIGGER trg_update_stats_cache
    AFTER INSERT OR UPDATE OR DELETE ON propiedades
    FOR EACH ROW
    EXECUTE FUNCTION update_stats_on_property_change();

-- 6. Function to get stats (convenience function for API)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_stats(
    p_tenant_id UUID,
    p_category VARCHAR DEFAULT NULL,
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    category VARCHAR,
    slug VARCHAR,
    display_name VARCHAR,
    count INTEGER,
    count_venta INTEGER,
    count_alquiler INTEGER,
    parent_slug VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sc.category,
        sc.slug,
        sc.display_name,
        sc.count,
        sc.count_venta,
        sc.count_alquiler,
        sc.parent_slug
    FROM stats_cache sc
    WHERE sc.tenant_id = p_tenant_id
      AND (p_category IS NULL OR sc.category = p_category)
      AND sc.count > 0
    ORDER BY sc.count DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- 7. Initial population: Recalculate stats for all tenants
-- ============================================================================
DO $$
DECLARE
    t_record RECORD;
BEGIN
    FOR t_record IN SELECT id FROM tenants LOOP
        PERFORM recalculate_all_stats(t_record.id);
        RAISE NOTICE 'Populated stats for tenant: %', t_record.id;
    END LOOP;
END $$;

-- ============================================================================
-- USAGE EXAMPLES:
-- ============================================================================
-- Get all stats for a tenant:
--   SELECT * FROM get_stats('tenant-uuid-here');
--
-- Get only property types:
--   SELECT * FROM get_stats('tenant-uuid-here', 'tipo');
--
-- Get cities with most properties:
--   SELECT * FROM get_stats('tenant-uuid-here', 'ciudad', 10);
--
-- Force recalculation:
--   SELECT recalculate_all_stats('tenant-uuid-here');
-- ============================================================================
