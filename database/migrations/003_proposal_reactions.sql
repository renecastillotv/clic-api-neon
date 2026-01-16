-- ================================================================
-- MIGRACIÓN: Tabla de reacciones de clientes a propuestas
-- Ejecutar en Neon PostgreSQL
-- ================================================================

-- Tabla para guardar las reacciones del cliente a propiedades en propuestas
CREATE TABLE IF NOT EXISTS propuesta_reacciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  propuesta_id UUID NOT NULL REFERENCES propuestas(id) ON DELETE CASCADE,
  propiedad_id UUID NOT NULL REFERENCES propiedades(id) ON DELETE CASCADE,
  tipo_reaccion VARCHAR(20) NOT NULL, -- 'like', 'dislike', 'maybe', 'comment'
  comentario TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Un cliente solo puede tener una reacción por propiedad en una propuesta (excepto comentarios)
  CONSTRAINT propuesta_reacciones_unique_reaction
    UNIQUE (propuesta_id, propiedad_id, tipo_reaccion)
    WHERE tipo_reaccion != 'comment'
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_propuesta_reacciones_propuesta ON propuesta_reacciones(propuesta_id);
CREATE INDEX IF NOT EXISTS idx_propuesta_reacciones_propiedad ON propuesta_reacciones(propiedad_id);
CREATE INDEX IF NOT EXISTS idx_propuesta_reacciones_tipo ON propuesta_reacciones(tipo_reaccion);

-- Comentarios
COMMENT ON TABLE propuesta_reacciones IS 'Reacciones del cliente a propiedades dentro de una propuesta';
COMMENT ON COLUMN propuesta_reacciones.tipo_reaccion IS 'Tipo: like (me gusta), dislike (no me gusta), maybe (tal vez), comment (comentario)';
