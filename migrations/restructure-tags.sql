-- =====================================================
-- REESTRUCTURACIÓN DE TABLAS DE TAGS
-- =====================================================

-- 1. Eliminar tabla tags_global actual (está vacía)
DROP TABLE IF EXISTS tags_global;

-- 2. Eliminar tabla content_tags actual (está vacía)
DROP TABLE IF EXISTS content_tags;

-- 3. Renombrar tags_propiedades a tags_global
ALTER TABLE tags_propiedades RENAME TO tags_global;

-- 4. Agregar campo pais a tags_global para segmentación
ALTER TABLE tags_global ADD COLUMN IF NOT EXISTS pais VARCHAR(2) DEFAULT 'DO';

-- 5. Crear índice para búsquedas por pais
CREATE INDEX IF NOT EXISTS idx_tags_global_pais ON tags_global(pais);

-- 6. Crear índice para búsquedas por tenant + pais
CREATE INDEX IF NOT EXISTS idx_tags_global_tenant_pais ON tags_global(tenant_id, pais);

-- 7. Crear índice para búsquedas por slug + tenant
CREATE INDEX IF NOT EXISTS idx_tags_global_slug_tenant ON tags_global(slug, tenant_id);

-- 8. Crear tabla de relación tags (relaciona propiedades Y contenidos con tags)
CREATE TABLE IF NOT EXISTS relacion_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,

    -- Tipo de entidad relacionada (propiedad, articulo, video, testimonio, faq, seo_stat)
    tipo_entidad VARCHAR(50) NOT NULL,

    -- ID de la entidad relacionada
    entidad_id UUID NOT NULL,

    -- ID del tag
    tag_id UUID NOT NULL REFERENCES tags_global(id) ON DELETE CASCADE,

    -- Orden de importancia del tag para esta entidad
    orden INTEGER DEFAULT 0,

    -- Peso/relevancia del tag (para scoring en búsquedas)
    peso DECIMAL(3,2) DEFAULT 1.00,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraint para evitar duplicados
    UNIQUE(tenant_id, tipo_entidad, entidad_id, tag_id)
);

-- 9. Índices para relacion_tags
CREATE INDEX IF NOT EXISTS idx_relacion_tags_entidad ON relacion_tags(tipo_entidad, entidad_id);
CREATE INDEX IF NOT EXISTS idx_relacion_tags_tag ON relacion_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_relacion_tags_tenant ON relacion_tags(tenant_id);
CREATE INDEX IF NOT EXISTS idx_relacion_tags_tenant_tipo ON relacion_tags(tenant_id, tipo_entidad);

-- 10. Índice compuesto para búsquedas de "propiedades con estos tags"
CREATE INDEX IF NOT EXISTS idx_relacion_tags_busqueda ON relacion_tags(tenant_id, tipo_entidad, tag_id);

-- =====================================================
-- VERIFICACIÓN
-- =====================================================
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE '%tag%';
