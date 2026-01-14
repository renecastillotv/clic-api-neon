// api/lib/db.ts
// Módulo de conexión a Neon PostgreSQL para Vercel Edge Functions
// Adaptado al schema real de la base de datos

import { neon, neonConfig } from '@neondatabase/serverless';

// Configuración para Edge Runtime
neonConfig.fetchConnectionCache = true;

// Obtener la URL de conexión desde variables de entorno
const getDatabaseUrl = (): string => {
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  return url;
};

// Cliente SQL singleton
let sqlClient: ReturnType<typeof neon> | null = null;

export const getSQL = () => {
  if (!sqlClient) {
    sqlClient = neon(getDatabaseUrl());
  }
  return sqlClient;
};

// Helper para ejecutar queries con logging en desarrollo
export async function query<T = any>(
  sqlQuery: TemplateStringsArray | string,
  ...params: any[]
): Promise<T[]> {
  const sql = getSQL();
  const startTime = Date.now();

  try {
    let result: T[];

    if (typeof sqlQuery === 'string') {
      result = await sql(sqlQuery, params) as T[];
    } else {
      result = await sql(sqlQuery, ...params) as T[];
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`[DB] Query completed in ${Date.now() - startTime}ms`);
    }

    return result;
  } catch (error) {
    console.error('[DB] Query error:', error);
    throw error;
  }
}

// Helper para obtener un solo resultado
export async function queryOne<T = any>(
  sqlQuery: TemplateStringsArray | string,
  ...params: any[]
): Promise<T | null> {
  const results = await query<T>(sqlQuery, ...params);
  return results[0] || null;
}

// ============================================================================
// QUERIES COMUNES PREPARADAS - Adaptadas al schema real
// ============================================================================

// Obtener configuración del tenant por dominio
export async function getTenantByDomain(domain: string) {
  const sql = getSQL();
  // Limpiar el dominio (quitar puerto si existe)
  const cleanDomain = domain.split(':')[0];

  const result = await sql`
    SELECT
      t.*,
      COALESCE(t.configuracion, '{}'::jsonb) as config,
      COALESCE(t.info_negocio, '{}'::jsonb) as info_negocio
    FROM tenants t
    WHERE t.dominio_personalizado = ${cleanDomain}
       OR t.dominio_personalizado LIKE ${'%' + cleanDomain}
       OR t.slug = ${cleanDomain}
    LIMIT 1
  `;
  return result[0] || null;
}

// Obtener tenant por defecto (para desarrollo local o cuando no hay match de dominio)
export async function getDefaultTenant() {
  const sql = getSQL();
  const result = await sql`
    SELECT
      t.*,
      COALESCE(t.configuracion, '{}'::jsonb) as config,
      COALESCE(t.info_negocio, '{}'::jsonb) as info_negocio
    FROM tenants t
    WHERE t.activo = true
    ORDER BY t.created_at ASC
    LIMIT 1
  `;
  return result[0] || null;
}

// Obtener ubicación por slug (tabla ubicaciones global, sin tenant_id)
export async function getLocationBySlug(slug: string) {
  const sql = getSQL();
  const result = await sql`
    WITH RECURSIVE location_tree AS (
      SELECT
        u.id,
        u.slug,
        u.nombre as name,
        u.tipo,
        u.parent_id,
        u.latitud,
        u.longitud,
        1 as level,
        ARRAY[u.id] as path
      FROM ubicaciones u
      WHERE u.slug = ${slug}
        AND u.activo = true

      UNION ALL

      SELECT
        u.id,
        u.slug,
        u.nombre as name,
        u.tipo,
        u.parent_id,
        u.latitud,
        u.longitud,
        lt.level + 1,
        lt.path || u.id
      FROM ubicaciones u
      JOIN location_tree lt ON u.id = lt.parent_id
      WHERE u.activo = true
    )
    SELECT * FROM location_tree
    ORDER BY level DESC
  `;
  return result;
}

// Obtener propiedades con filtros - Adaptado al schema real
export async function getProperties(options: {
  tenantId: string; // UUID
  filters?: Record<string, any>;
  page?: number;
  limit?: number;
  language?: string;
}) {
  const sql = getSQL();
  const { tenantId, filters = {}, page = 1, limit = 32 } = options;
  const offset = (page - 1) * limit;

  // Query base - el schema usa campos directos, no JOINs con ubicaciones
  const properties = await sql`
    SELECT
      p.id,
      p.slug,
      p.codigo,
      p.titulo,
      p.descripcion,
      p.short_description,
      p.tipo,
      p.operacion,
      p.precio,
      p.precio_venta,
      p.precio_alquiler,
      p.moneda,
      p.pais,
      p.provincia,
      p.ciudad,
      p.sector,
      p.direccion,
      p.latitud,
      p.longitud,
      p.habitaciones,
      p.banos,
      p.medios_banos,
      p.estacionamientos,
      p.m2_construccion,
      p.m2_terreno,
      p.imagen_principal,
      p.imagenes,
      p.amenidades,
      p.destacada,
      p.exclusiva,
      p.estado_propiedad,
      p.is_project,
      p.is_furnished,
      p.created_at,
      p.updated_at,
      p.agente_id
    FROM propiedades p
    WHERE p.tenant_id = ${tenantId}
      AND p.activo = true
      AND p.estado_propiedad = 'disponible'
      ${filters.operacion ? sql`AND p.operacion = ${filters.operacion}` : sql``}
      ${filters.tipo ? sql`AND p.tipo = ${filters.tipo}` : sql``}
      ${filters.ciudad ? sql`AND LOWER(p.ciudad) = LOWER(${filters.ciudad})` : sql``}
      ${filters.sector ? sql`AND LOWER(p.sector) = LOWER(${filters.sector})` : sql``}
      ${filters.minPrice ? sql`AND COALESCE(p.precio_venta, p.precio_alquiler, p.precio) >= ${filters.minPrice}` : sql``}
      ${filters.maxPrice ? sql`AND COALESCE(p.precio_venta, p.precio_alquiler, p.precio) <= ${filters.maxPrice}` : sql``}
      ${filters.habitaciones ? sql`AND p.habitaciones >= ${filters.habitaciones}` : sql``}
      ${filters.banos ? sql`AND p.banos >= ${filters.banos}` : sql``}
    ORDER BY p.destacada DESC, p.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  // Query de conteo
  const countResult = await sql`
    SELECT COUNT(*) as total
    FROM propiedades p
    WHERE p.tenant_id = ${tenantId}
      AND p.activo = true
      AND p.estado_propiedad = 'disponible'
      ${filters.operacion ? sql`AND p.operacion = ${filters.operacion}` : sql``}
      ${filters.tipo ? sql`AND p.tipo = ${filters.tipo}` : sql``}
      ${filters.ciudad ? sql`AND LOWER(p.ciudad) = LOWER(${filters.ciudad})` : sql``}
      ${filters.sector ? sql`AND LOWER(p.sector) = LOWER(${filters.sector})` : sql``}
      ${filters.minPrice ? sql`AND COALESCE(p.precio_venta, p.precio_alquiler, p.precio) >= ${filters.minPrice}` : sql``}
      ${filters.maxPrice ? sql`AND COALESCE(p.precio_venta, p.precio_alquiler, p.precio) <= ${filters.maxPrice}` : sql``}
      ${filters.habitaciones ? sql`AND p.habitaciones >= ${filters.habitaciones}` : sql``}
      ${filters.banos ? sql`AND p.banos >= ${filters.banos}` : sql``}
  `;

  const total = parseInt(countResult[0]?.total || '0', 10);

  return {
    properties,
    pagination: {
      page,
      limit,
      total_items: total,
      total_pages: Math.ceil(total / limit),
      has_next: page * limit < total,
      has_prev: page > 1
    }
  };
}

// Obtener propiedad individual por slug
export async function getPropertyBySlug(slug: string, tenantId: string) {
  const sql = getSQL();
  const result = await sql`
    SELECT
      p.*,
      u.nombre as agente_nombre,
      u.apellido as agente_apellido,
      u.email as agente_email,
      u.telefono as agente_telefono,
      u.avatar as agente_avatar,
      u.slug as agente_slug
    FROM propiedades p
    LEFT JOIN usuarios u ON p.agente_id = u.id
    WHERE p.slug = ${slug}
      AND p.tenant_id = ${tenantId}
      AND p.estado_propiedad IN ('disponible', 'reservado')
    LIMIT 1
  `;
  return result[0] || null;
}

// Obtener agente/usuario por slug
export async function getAdvisorBySlug(slug: string, tenantId: string) {
  const sql = getSQL();
  const result = await sql`
    SELECT
      u.*,
      ut.es_owner,
      (
        SELECT COUNT(*)
        FROM propiedades p
        WHERE p.agente_id = u.id
          AND p.activo = true
          AND p.estado_propiedad = 'disponible'
      ) as propiedades_count
    FROM usuarios u
    JOIN usuarios_tenants ut ON u.id = ut.usuario_id AND ut.tenant_id = ${tenantId}
    WHERE u.slug = ${slug}
      AND u.activo = true
    LIMIT 1
  `;
  return result[0] || null;
}

// Obtener lista de asesores del tenant
export async function getAdvisors(tenantId: string, limit: number = 50) {
  const sql = getSQL();
  return sql`
    SELECT
      u.id,
      u.slug,
      u.nombre,
      u.apellido,
      u.email,
      u.telefono,
      u.avatar,
      u.bio,
      ut.es_owner,
      (
        SELECT COUNT(*)
        FROM propiedades p
        WHERE p.agente_id = u.id
          AND p.activo = true
          AND p.estado_propiedad = 'disponible'
      ) as propiedades_count
    FROM usuarios u
    JOIN usuarios_tenants ut ON u.id = ut.usuario_id AND ut.tenant_id = ${tenantId}
    WHERE u.activo = true
      AND ut.activo = true
    ORDER BY ut.es_owner DESC, u.nombre ASC
    LIMIT ${limit}
  `;
}

// Obtener testimonios (usando mock_testimonios que tiene tenant_id)
export async function getTestimonials(tenantId: string, limit: number = 10) {
  const sql = getSQL();
  return sql`
    SELECT
      t.id,
      t.nombre_cliente as client_name,
      t.ubicacion as client_location,
      t.testimonio as content,
      t.calificacion as rating,
      t.foto_url as client_photo,
      t.tipo_propiedad as property_type,
      t.destacado as is_featured,
      t.fecha as created_at
    FROM mock_testimonios t
    WHERE t.tenant_id = ${tenantId}
      AND t.activo = true
    ORDER BY t.destacado DESC, t.fecha DESC
    LIMIT ${limit}
  `;
}

// Obtener FAQs (usando mock_faqs que tiene tenant_id)
export async function getFAQs(options: {
  tenantId: string;
  limit?: number;
}) {
  const sql = getSQL();
  const { tenantId, limit = 10 } = options;

  return sql`
    SELECT
      id,
      pregunta as question,
      respuesta as answer,
      categoria as category,
      orden as "order",
      traducciones as translations
    FROM mock_faqs
    WHERE tenant_id = ${tenantId}
      AND activo = true
    ORDER BY orden ASC
    LIMIT ${limit}
  `;
}

// Obtener categorías de propiedades
export async function getPropertyCategories(tenantId: string) {
  const sql = getSQL();
  return sql`
    SELECT
      id,
      slug,
      nombre as name,
      icono as icon,
      descripcion as description,
      traducciones as translations
    FROM categorias_propiedades
    WHERE (tenant_id = ${tenantId} OR tenant_id IS NULL)
      AND activo = true
    ORDER BY orden ASC, nombre ASC
  `;
}

// Obtener ubicaciones globales (sin filtro por tenant)
export async function getLocations(tipo?: string) {
  const sql = getSQL();
  return sql`
    SELECT
      id,
      slug,
      nombre as name,
      tipo,
      nivel as level,
      parent_id,
      latitud,
      longitud,
      destacado as is_featured,
      traducciones as translations
    FROM ubicaciones
    WHERE activo = true
      ${tipo ? sql`AND tipo = ${tipo}` : sql``}
    ORDER BY destacado DESC, orden ASC, nombre ASC
  `;
}

// Obtener estadísticas rápidas del tenant
export async function getQuickStats(tenantId: string) {
  const sql = getSQL();
  const result = await sql`
    SELECT
      COUNT(*) FILTER (WHERE estado_propiedad = 'disponible') as total_properties,
      COUNT(*) FILTER (WHERE estado_propiedad = 'disponible' AND operacion = 'venta') as for_sale,
      COUNT(*) FILTER (WHERE estado_propiedad = 'disponible' AND operacion = 'alquiler') as for_rent,
      COUNT(*) FILTER (WHERE estado_propiedad = 'disponible' AND created_at > NOW() - INTERVAL '30 days') as new_this_month
    FROM propiedades
    WHERE tenant_id = ${tenantId}
      AND activo = true
  `;

  const s = result[0] || {};
  return {
    total_properties: parseInt(s.total_properties || '0', 10),
    for_sale: parseInt(s.for_sale || '0', 10),
    for_rent: parseInt(s.for_rent || '0', 10),
    new_this_month: parseInt(s.new_this_month || '0', 10)
  };
}

// Obtener propiedades destacadas
export async function getFeaturedProperties(tenantId: string, limit: number = 12) {
  const sql = getSQL();
  return sql`
    SELECT
      p.id,
      p.slug,
      p.titulo,
      p.tipo,
      p.operacion,
      p.precio,
      p.precio_venta,
      p.precio_alquiler,
      p.moneda,
      p.ciudad,
      p.sector,
      p.habitaciones,
      p.banos,
      p.m2_construccion,
      p.imagen_principal,
      p.destacada,
      p.created_at
    FROM propiedades p
    WHERE p.tenant_id = ${tenantId}
      AND p.activo = true
      AND p.estado_propiedad = 'disponible'
      AND p.destacada = true
    ORDER BY p.created_at DESC
    LIMIT ${limit}
  `;
}

// Obtener ciudades/sectores populares
export async function getPopularLocations(tenantId: string) {
  const sql = getSQL();

  const cities = await sql`
    SELECT
      ciudad as name,
      LOWER(REPLACE(ciudad, ' ', '-')) as slug,
      COUNT(*) as count
    FROM propiedades
    WHERE tenant_id = ${tenantId}
      AND activo = true
      AND estado_propiedad = 'disponible'
      AND ciudad IS NOT NULL
      AND ciudad != ''
    GROUP BY ciudad
    HAVING COUNT(*) >= 1
    ORDER BY count DESC
    LIMIT 8
  `;

  const sectors = await sql`
    SELECT
      sector as name,
      LOWER(REPLACE(sector, ' ', '-')) as slug,
      ciudad as city,
      COUNT(*) as count
    FROM propiedades
    WHERE tenant_id = ${tenantId}
      AND activo = true
      AND estado_propiedad = 'disponible'
      AND sector IS NOT NULL
      AND sector != ''
    GROUP BY sector, ciudad
    HAVING COUNT(*) >= 1
    ORDER BY count DESC
    LIMIT 8
  `;

  return { cities, sectors };
}

export default {
  getSQL,
  query,
  queryOne,
  getTenantByDomain,
  getDefaultTenant,
  getLocationBySlug,
  getProperties,
  getPropertyBySlug,
  getAdvisorBySlug,
  getAdvisors,
  getTestimonials,
  getFAQs,
  getPropertyCategories,
  getLocations,
  getQuickStats,
  getFeaturedProperties,
  getPopularLocations
};
