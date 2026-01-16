-- ================================================================
-- SISTEMA DE FAVORITOS CON COMPARTIR Y REACCIONES
-- Ejecutar en Neon PostgreSQL
-- ================================================================

-- 1. Tabla principal: Listas de favoritos por dispositivo
CREATE TABLE IF NOT EXISTS device_favorites (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT NOT NULL UNIQUE,  -- ID único del dispositivo/navegador (interno)
  public_code TEXT UNIQUE,  -- Código público amigable (ej: CLIC-1234)
  owner_name TEXT,  -- Nombre del dueño de la lista (opcional)
  owner_email TEXT,  -- Email del dueño para recuperar la lista
  property_ids TEXT[] DEFAULT '{}',  -- Array de IDs de propiedades
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para buscar por email
CREATE INDEX IF NOT EXISTS idx_device_favorites_email ON device_favorites(owner_email);
-- Índice para buscar por código público
CREATE INDEX IF NOT EXISTS idx_device_favorites_public_code ON device_favorites(public_code);

-- 2. Tabla de visitantes de listas compartidas
CREATE TABLE IF NOT EXISTS favorite_visitors (
  id BIGSERIAL PRIMARY KEY,
  list_id TEXT NOT NULL,  -- El device_id de device_favorites
  visitor_device_id TEXT NOT NULL,
  visitor_alias TEXT NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_visitor_per_list UNIQUE (list_id, visitor_device_id)
);

-- 3. Tabla de reacciones (likes, dislikes, comentarios)
CREATE TABLE IF NOT EXISTS favorite_reactions (
  id BIGSERIAL PRIMARY KEY,
  list_id TEXT NOT NULL,  -- El device_id de device_favorites
  property_id TEXT NOT NULL,  -- ID de la propiedad (como TEXT para flexibilidad)
  visitor_device_id TEXT NOT NULL,
  visitor_alias TEXT NOT NULL,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('like', 'dislike', 'comment')),
  comment_text TEXT,  -- Solo para reaction_type = 'comment'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_like_dislike_per_visitor
    UNIQUE (list_id, property_id, visitor_device_id, reaction_type)
);

-- ================================================================
-- ÍNDICES
-- ================================================================

CREATE INDEX IF NOT EXISTS idx_device_favorites_device_id ON device_favorites(device_id);
CREATE INDEX IF NOT EXISTS idx_device_favorites_updated ON device_favorites(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_favorite_visitors_list_id ON favorite_visitors(list_id);
CREATE INDEX IF NOT EXISTS idx_favorite_visitors_device_id ON favorite_visitors(visitor_device_id);

CREATE INDEX IF NOT EXISTS idx_favorite_reactions_list_id ON favorite_reactions(list_id);
CREATE INDEX IF NOT EXISTS idx_favorite_reactions_property_id ON favorite_reactions(property_id);
CREATE INDEX IF NOT EXISTS idx_favorite_reactions_visitor ON favorite_reactions(visitor_device_id);
CREATE INDEX IF NOT EXISTS idx_favorite_reactions_type ON favorite_reactions(reaction_type);

-- ================================================================
-- FUNCIÓN PARA ACTUALIZAR updated_at
-- ================================================================

CREATE OR REPLACE FUNCTION update_favorites_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para device_favorites
DROP TRIGGER IF EXISTS trigger_update_favorites_timestamp ON device_favorites;
CREATE TRIGGER trigger_update_favorites_timestamp
  BEFORE UPDATE ON device_favorites
  FOR EACH ROW
  EXECUTE FUNCTION update_favorites_timestamp();

-- ================================================================
-- COMENTARIOS
-- ================================================================

COMMENT ON TABLE device_favorites IS 'Lista de favoritos por dispositivo/navegador';
COMMENT ON TABLE favorite_visitors IS 'Visitantes que acceden a listas compartidas';
COMMENT ON TABLE favorite_reactions IS 'Likes, dislikes y comentarios en propiedades de listas compartidas';

COMMENT ON COLUMN device_favorites.device_id IS 'ID único generado en el navegador (UUID o fingerprint)';
COMMENT ON COLUMN device_favorites.property_ids IS 'Array de IDs de propiedades favoritas';
COMMENT ON COLUMN favorite_visitors.list_id IS 'Referencia al device_id del dueño de la lista';
COMMENT ON COLUMN favorite_reactions.reaction_type IS 'Tipo: like, dislike o comment';
