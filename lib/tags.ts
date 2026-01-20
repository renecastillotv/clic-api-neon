/**
 * Tags Helper Library
 *
 * Funciones utilitarias para el sistema de tags semánticos.
 * Permite búsqueda por URL semántica, propiedades similares y contenido relacionado.
 */

import { getSQL } from './db.js';

// Tipos
export interface Tag {
  id: string;
  slug: string;
  tipo: string;
  valor: string | null;
  campo_query: string | null;
  operador: string | null;
  nombre_idiomas: { es: string; en: string; fr: string };
  alias_idiomas: { es: string; en: string; fr: string };
  peso?: number;
}

export interface TagMatch {
  tag: Tag;
  source: 'url' | 'property' | 'manual';
}

export interface PropertyByTags {
  id: string;
  titulo: string;
  slug: string;
  precio_venta: number | null;
  precio_alquiler: number | null;
  moneda: string;
  operacion: string;
  tipo: string;
  habitaciones: number;
  banos: number;
  m2_construccion: number;
  imagen_principal: string;
  sector: string;
  ciudad: string;
  is_project: boolean;
  matching_tags: number;
  total_score: number;
}

export interface ContentByTags {
  id: string;
  tipo_contenido: string;
  titulo: string;
  slug: string;
  descripcion: string | null;
  imagen: string | null;
  matching_tags: number;
  total_score: number;
}

// Pesos por tipo de tag para scoring
const PESOS_POR_TIPO: Record<string, number> = {
  'ubicacion': 1.50,
  'tipo_propiedad': 1.30,
  'operacion': 1.20,
  'filtro': 1.00,
  'amenidad': 0.80,
  'caracteristica': 0.70,
  'lista': 0.50,
  'contenido': 0.30,
  'servicio': 0.30,
  'pais': 0.20,
  'area': 1.00,
  'backend': 0.10
};

/**
 * Parsea segmentos de URL y retorna los tags válidos encontrados
 *
 * @param segments - Array de segmentos de URL (ej: ['comprar', 'apartamento', 'piantini'])
 * @param tenantId - ID del tenant
 * @param language - Idioma para buscar alias (es, en, fr)
 * @returns Array de tags válidos con su información completa
 *
 * @example
 * const tags = await parseUrlToTags(['comprar', 'apartamento', 'piantini'], tenantId, 'es');
 */
export async function parseUrlToTags(
  segments: string[],
  tenantId: string,
  language: string = 'es'
): Promise<Tag[]> {
  if (!segments || segments.length === 0) {
    return [];
  }

  const sql = getSQL();

  // Normalizar segmentos (lowercase, sin acentos extra)
  const normalizedSegments = segments.map(s => s.toLowerCase().trim()).filter(s => s);

  if (normalizedSegments.length === 0) {
    return [];
  }

  // Buscar tags que coincidan con los slugs o alias en el idioma
  const tags = await sql`
    SELECT
      id, slug, tipo, valor, campo_query, operador,
      nombre_idiomas, alias_idiomas, activo
    FROM tags_global
    WHERE tenant_id = ${tenantId}::uuid
      AND activo = true
      AND (
        slug = ANY(${normalizedSegments}::text[])
        OR alias_idiomas->>${language} = ANY(${normalizedSegments}::text[])
        OR alias_idiomas->>'es' = ANY(${normalizedSegments}::text[])
      )
  `;

  return (tags as any[]).map(t => ({
    id: t.id,
    slug: t.slug,
    tipo: t.tipo,
    valor: t.valor,
    campo_query: t.campo_query,
    operador: t.operador,
    nombre_idiomas: t.nombre_idiomas || { es: t.slug, en: t.slug, fr: t.slug },
    alias_idiomas: t.alias_idiomas || { es: t.slug, en: t.slug, fr: t.slug },
    peso: PESOS_POR_TIPO[t.tipo] || 1.0
  }));
}

/**
 * Obtiene todos los tags asociados a una propiedad desde relacion_tags
 *
 * @param propertyId - ID de la propiedad
 * @param tenantId - ID del tenant
 * @returns Array de tags de la propiedad
 *
 * @example
 * const tags = await getPropertyTags(propertyId, tenantId);
 */
export async function getPropertyTags(
  propertyId: string,
  tenantId: string
): Promise<Tag[]> {
  const sql = getSQL();

  const tags = await sql`
    SELECT
      tg.id, tg.slug, tg.tipo, tg.valor, tg.campo_query, tg.operador,
      tg.nombre_idiomas, tg.alias_idiomas,
      rt.peso
    FROM relacion_tags rt
    INNER JOIN tags_global tg ON tg.id = rt.tag_id
    WHERE rt.tenant_id = ${tenantId}::uuid
      AND rt.tipo_entidad = 'propiedad'
      AND rt.entidad_id = ${propertyId}::uuid
      AND tg.activo = true
    ORDER BY rt.peso DESC, rt.orden ASC
  `;

  return (tags as any[]).map(t => ({
    id: t.id,
    slug: t.slug,
    tipo: t.tipo,
    valor: t.valor,
    campo_query: t.campo_query,
    operador: t.operador,
    nombre_idiomas: t.nombre_idiomas || { es: t.slug, en: t.slug, fr: t.slug },
    alias_idiomas: t.alias_idiomas || { es: t.slug, en: t.slug, fr: t.slug },
    peso: parseFloat(t.peso) || PESOS_POR_TIPO[t.tipo] || 1.0
  }));
}

/**
 * Busca propiedades que coincidan con los tags dados, ordenadas por coincidencia
 *
 * @param tags - Array de tags (de parseUrlToTags o getPropertyTags)
 * @param tenantId - ID del tenant
 * @param options - Opciones de búsqueda (limit, offset, excludeId)
 * @returns Propiedades ordenadas por cantidad de coincidencias y score
 *
 * @example
 * const properties = await getPropertiesByTags(tags, tenantId, { limit: 20 });
 */
export async function getPropertiesByTags(
  tags: Tag[],
  tenantId: string,
  options: {
    limit?: number;
    offset?: number;
    excludeId?: string;
  } = {}
): Promise<PropertyByTags[]> {
  const { limit = 20, offset = 0, excludeId } = options;

  if (!tags || tags.length === 0) {
    return [];
  }

  const sql = getSQL();
  const tagIds = tags.map(t => t.id);

  // Buscar propiedades que tengan estos tags, ordenadas por coincidencia
  const properties = await sql`
    SELECT
      p.id, p.titulo, p.slug, p.precio_venta, p.precio_alquiler,
      p.moneda, p.operacion, p.tipo, p.habitaciones, p.banos,
      p.m2_construccion, p.imagen_principal, p.sector, p.ciudad, p.is_project,
      COUNT(rt.tag_id) as matching_tags,
      COALESCE(SUM(rt.peso), 0) as total_score
    FROM propiedades p
    INNER JOIN relacion_tags rt ON rt.entidad_id = p.id
      AND rt.tipo_entidad = 'propiedad'
      AND rt.tenant_id = ${tenantId}::uuid
    WHERE p.tenant_id = ${tenantId}::uuid
      AND p.activo = true
      AND p.estado_propiedad = 'disponible'
      AND rt.tag_id = ANY(${tagIds}::uuid[])
      ${excludeId ? sql`AND p.id != ${excludeId}::uuid` : sql``}
    GROUP BY p.id
    ORDER BY matching_tags DESC, total_score DESC, p.created_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  return (properties as any[]).map(p => ({
    id: p.id,
    titulo: p.titulo,
    slug: p.slug,
    precio_venta: p.precio_venta ? parseFloat(p.precio_venta) : null,
    precio_alquiler: p.precio_alquiler ? parseFloat(p.precio_alquiler) : null,
    moneda: p.moneda || 'USD',
    operacion: p.operacion || 'venta',
    tipo: p.tipo || 'propiedad',
    habitaciones: parseInt(p.habitaciones) || 0,
    banos: parseInt(p.banos) || 0,
    m2_construccion: parseInt(p.m2_construccion) || 0,
    imagen_principal: p.imagen_principal || '',
    sector: p.sector || '',
    ciudad: p.ciudad || '',
    is_project: p.is_project || false,
    matching_tags: parseInt(p.matching_tags) || 0,
    total_score: parseFloat(p.total_score) || 0
  }));
}

/**
 * Obtiene propiedades similares basándose en los tags de una propiedad
 *
 * @param propertyId - ID de la propiedad de referencia
 * @param tenantId - ID del tenant
 * @param limit - Cantidad máxima de resultados
 * @returns Propiedades similares ordenadas por coincidencia de tags
 *
 * @example
 * const similar = await getSimilarPropertiesByTags(propertyId, tenantId, 4);
 */
export async function getSimilarPropertiesByTags(
  propertyId: string,
  tenantId: string,
  limit: number = 4
): Promise<PropertyByTags[]> {
  // Obtener tags de la propiedad
  const propertyTags = await getPropertyTags(propertyId, tenantId);

  if (propertyTags.length === 0) {
    // Si no tiene tags, retornar array vacío (el handler puede usar fallback)
    return [];
  }

  // Buscar propiedades con tags similares, excluyendo la actual
  return getPropertiesByTags(propertyTags, tenantId, {
    limit,
    excludeId: propertyId
  });
}

/**
 * Obtiene contenidos (artículos, videos, testimonios, faqs) que coincidan con los tags
 * Funciona tanto para tags de una propiedad como para tags de URL de búsqueda
 *
 * @param tags - Array de tags (de cualquier origen)
 * @param tenantId - ID del tenant
 * @param options - Opciones de búsqueda
 * @returns Contenidos ordenados por coincidencia
 *
 * @example
 * // Desde una propiedad
 * const propertyTags = await getPropertyTags(propertyId, tenantId);
 * const articles = await getContentByTags(propertyTags, tenantId, { tipoContenido: 'articulo' });
 *
 * // Desde URL de búsqueda
 * const urlTags = await parseUrlToTags(['comprar', 'apartamento'], tenantId);
 * const articles = await getContentByTags(urlTags, tenantId, { tipoContenido: 'articulo' });
 */
export async function getContentByTags(
  tags: Tag[],
  tenantId: string,
  options: {
    tipoContenido?: 'articulo' | 'video' | 'testimonio' | 'faq' | null;
    limit?: number;
    offset?: number;
  } = {}
): Promise<ContentByTags[]> {
  const { tipoContenido = null, limit = 10, offset = 0 } = options;

  if (!tags || tags.length === 0) {
    return [];
  }

  const sql = getSQL();
  const tagIds = tags.map(t => t.id);

  // Buscar contenidos que tengan estos tags
  const contents = await sql`
    SELECT
      rt.entidad_id as id,
      rt.tipo_entidad as tipo_contenido,
      COUNT(rt.tag_id) as matching_tags,
      COALESCE(SUM(rt.peso), 0) as total_score
    FROM relacion_tags rt
    WHERE rt.tenant_id = ${tenantId}::uuid
      AND rt.tag_id = ANY(${tagIds}::uuid[])
      AND rt.tipo_entidad != 'propiedad'
      ${tipoContenido ? sql`AND rt.tipo_entidad = ${tipoContenido}` : sql``}
    GROUP BY rt.entidad_id, rt.tipo_entidad
    ORDER BY matching_tags DESC, total_score DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  if ((contents as any[]).length === 0) {
    return [];
  }

  // Obtener detalles de cada contenido según su tipo
  const results: ContentByTags[] = [];

  for (const content of contents as any[]) {
    const details = await getContentDetails(content.id, content.tipo_contenido, tenantId);
    if (details) {
      results.push({
        id: content.id,
        tipo_contenido: content.tipo_contenido,
        titulo: details.titulo,
        slug: details.slug,
        descripcion: details.descripcion,
        imagen: details.imagen,
        matching_tags: parseInt(content.matching_tags) || 0,
        total_score: parseFloat(content.total_score) || 0
      });
    }
  }

  return results;
}

/**
 * Helper interno para obtener detalles de un contenido según su tipo
 */
async function getContentDetails(
  contentId: string,
  tipoContenido: string,
  tenantId: string
): Promise<{ titulo: string; slug: string; descripcion: string | null; imagen: string | null } | null> {
  const sql = getSQL();

  switch (tipoContenido) {
    case 'articulo': {
      const result = await sql`
        SELECT titulo, slug, descripcion, imagen
        FROM articulos
        WHERE id = ${contentId}::uuid AND tenant_id = ${tenantId}::uuid AND activo = true
      `;
      return (result as any[])[0] || null;
    }
    case 'video': {
      const result = await sql`
        SELECT titulo, slug, descripcion, thumbnail as imagen
        FROM videos
        WHERE id = ${contentId}::uuid AND tenant_id = ${tenantId}::uuid AND activo = true
      `;
      return (result as any[])[0] || null;
    }
    case 'testimonio': {
      const result = await sql`
        SELECT nombre_cliente as titulo, id::text as slug, comentario as descripcion, foto_cliente as imagen
        FROM testimonios
        WHERE id = ${contentId}::uuid AND tenant_id = ${tenantId}::uuid AND activo = true
      `;
      return (result as any[])[0] || null;
    }
    case 'faq': {
      const result = await sql`
        SELECT pregunta as titulo, id::text as slug, respuesta as descripcion, NULL as imagen
        FROM faqs
        WHERE id = ${contentId}::uuid AND tenant_id = ${tenantId}::uuid AND activo = true
      `;
      return (result as any[])[0] || null;
    }
    default:
      return null;
  }
}

/**
 * Obtiene los IDs de tags desde un array de slugs
 * Útil cuando ya tienes los slugs y solo necesitas los IDs
 *
 * @param slugs - Array de slugs de tags
 * @param tenantId - ID del tenant
 * @returns Array de IDs de tags
 */
export async function getTagIdsBySlugs(
  slugs: string[],
  tenantId: string
): Promise<string[]> {
  if (!slugs || slugs.length === 0) {
    return [];
  }

  const sql = getSQL();
  const normalizedSlugs = slugs.map(s => s.toLowerCase().trim());

  const tags = await sql`
    SELECT id
    FROM tags_global
    WHERE tenant_id = ${tenantId}::uuid
      AND activo = true
      AND slug = ANY(${normalizedSlugs}::text[])
  `;

  return (tags as any[]).map(t => t.id);
}

/**
 * Cuenta propiedades que coinciden con los tags dados
 * Útil para paginación
 *
 * @param tags - Array de tags
 * @param tenantId - ID del tenant
 * @param excludeId - ID de propiedad a excluir (opcional)
 * @returns Cantidad total de propiedades
 */
export async function countPropertiesByTags(
  tags: Tag[],
  tenantId: string,
  excludeId?: string
): Promise<number> {
  if (!tags || tags.length === 0) {
    return 0;
  }

  const sql = getSQL();
  const tagIds = tags.map(t => t.id);

  const result = await sql`
    SELECT COUNT(DISTINCT p.id) as total
    FROM propiedades p
    INNER JOIN relacion_tags rt ON rt.entidad_id = p.id
      AND rt.tipo_entidad = 'propiedad'
      AND rt.tenant_id = ${tenantId}::uuid
    WHERE p.tenant_id = ${tenantId}::uuid
      AND p.activo = true
      AND p.estado_propiedad = 'disponible'
      AND rt.tag_id = ANY(${tagIds}::uuid[])
      ${excludeId ? sql`AND p.id != ${excludeId}::uuid` : sql``}
  `;

  return parseInt((result as any[])[0]?.total) || 0;
}

/**
 * Obtiene todos los tags disponibles agrupados por tipo
 * Útil para mostrar filtros en el frontend
 *
 * @param tenantId - ID del tenant
 * @param tipos - Tipos de tags a incluir (opcional, todos si no se especifica)
 * @returns Tags agrupados por tipo
 */
export async function getAvailableTags(
  tenantId: string,
  tipos?: string[]
): Promise<Record<string, Tag[]>> {
  const sql = getSQL();

  const tags = await sql`
    SELECT
      id, slug, tipo, valor, campo_query, operador,
      nombre_idiomas, alias_idiomas
    FROM tags_global
    WHERE tenant_id = ${tenantId}::uuid
      AND activo = true
      ${tipos && tipos.length > 0 ? sql`AND tipo = ANY(${tipos}::text[])` : sql``}
    ORDER BY tipo, orden, slug
  `;

  // Agrupar por tipo
  const grouped: Record<string, Tag[]> = {};

  for (const t of tags as any[]) {
    const tipo = t.tipo || 'otros';
    if (!grouped[tipo]) {
      grouped[tipo] = [];
    }
    grouped[tipo].push({
      id: t.id,
      slug: t.slug,
      tipo: t.tipo,
      valor: t.valor,
      campo_query: t.campo_query,
      operador: t.operador,
      nombre_idiomas: t.nombre_idiomas || { es: t.slug, en: t.slug, fr: t.slug },
      alias_idiomas: t.alias_idiomas || { es: t.slug, en: t.slug, fr: t.slug },
      peso: PESOS_POR_TIPO[t.tipo] || 1.0
    });
  }

  return grouped;
}

// Exportar todo
export default {
  parseUrlToTags,
  getPropertyTags,
  getPropertiesByTags,
  getSimilarPropertiesByTags,
  getContentByTags,
  getTagIdsBySlugs,
  countPropertiesByTags,
  getAvailableTags,
  PESOS_POR_TIPO
};
