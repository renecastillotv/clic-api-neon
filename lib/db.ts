// api/lib/db.ts
// Módulo de conexión a Neon PostgreSQL para Vercel Edge Functions

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
      // Query como string normal
      result = await sql(sqlQuery, params) as T[];
    } else {
      // Tagged template literal
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

// Helper para ejecutar transacciones (no disponible en serverless, usar con cuidado)
export async function transaction<T>(
  callback: (sql: ReturnType<typeof neon>) => Promise<T>
): Promise<T> {
  const sql = getSQL();
  // Nota: Neon serverless no soporta transacciones tradicionales
  // Esta es una aproximación que ejecuta queries secuencialmente
  return callback(sql);
}

// ============================================================================
// QUERIES COMUNES PREPARADAS
// ============================================================================

// Obtener configuración del tenant por dominio
export async function getTenantByDomain(domain: string) {
  const sql = getSQL();
  const result = await sql`
    SELECT
      t.*,
      COALESCE(t.configuracion, '{}'::jsonb) as config
    FROM tenants t
    WHERE t.dominio_principal = ${domain}
       OR ${domain} = ANY(t.dominios_alternativos)
       OR t.dominio_principal LIKE ${'%' + domain}
    LIMIT 1
  `;
  return result[0] || null;
}

// Obtener tenant por defecto (para desarrollo local)
export async function getDefaultTenant() {
  const sql = getSQL();
  const result = await sql`
    SELECT
      t.*,
      COALESCE(t.configuracion, '{}'::jsonb) as config
    FROM tenants t
    WHERE t.es_principal = true
    LIMIT 1
  `;
  return result[0] || null;
}

// Obtener ubicación por slug con jerarquía completa
export async function getLocationBySlug(slug: string, tenantId: number) {
  const sql = getSQL();
  const result = await sql`
    WITH RECURSIVE location_tree AS (
      SELECT
        u.id,
        u.slug,
        u.nombre as name,
        u.nombre_en as name_en,
        u.nombre_fr as name_fr,
        u.tipo,
        u.parent_id,
        u.coordenadas as coordinates,
        1 as level,
        ARRAY[u.id] as path
      FROM ubicaciones u
      WHERE u.slug = ${slug}
        AND u.tenant_id = ${tenantId}
        AND u.activo = true

      UNION ALL

      SELECT
        u.id,
        u.slug,
        u.nombre as name,
        u.nombre_en as name_en,
        u.nombre_fr as name_fr,
        u.tipo,
        u.parent_id,
        u.coordenadas as coordinates,
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

// Obtener propiedades con filtros
export async function getProperties(options: {
  tenantId: number;
  filters?: Record<string, any>;
  page?: number;
  limit?: number;
  language?: string;
}) {
  const sql = getSQL();
  const { tenantId, filters = {}, page = 1, limit = 32, language = 'es' } = options;
  const offset = (page - 1) * limit;

  // Construir condiciones dinámicamente
  const conditions: string[] = ['p.tenant_id = $1', 'p.estado = $2'];
  const params: any[] = [tenantId, 'disponible'];
  let paramIndex = 3;

  // Filtro por operación
  if (filters.operation) {
    if (filters.operation === 'venta') {
      conditions.push('p.precio_venta IS NOT NULL');
    } else if (filters.operation === 'alquiler') {
      conditions.push('p.precio_alquiler IS NOT NULL');
    }
  }

  // Filtro por categoría
  if (filters.categoryId) {
    conditions.push(`p.categoria_id = $${paramIndex++}`);
    params.push(filters.categoryId);
  }

  // Filtro por ubicación
  if (filters.locationId) {
    conditions.push(`(p.sector_id = $${paramIndex} OR p.ciudad_id = $${paramIndex} OR p.provincia_id = $${paramIndex})`);
    params.push(filters.locationId);
    paramIndex++;
  }

  // Filtro por precio
  if (filters.minPrice) {
    conditions.push(`COALESCE(p.precio_venta, p.precio_alquiler) >= $${paramIndex++}`);
    params.push(filters.minPrice);
  }
  if (filters.maxPrice) {
    conditions.push(`COALESCE(p.precio_venta, p.precio_alquiler) <= $${paramIndex++}`);
    params.push(filters.maxPrice);
  }

  // Filtro por habitaciones
  if (filters.bedrooms) {
    conditions.push(`p.habitaciones >= $${paramIndex++}`);
    params.push(filters.bedrooms);
  }

  // Filtro por baños
  if (filters.bathrooms) {
    conditions.push(`p.banos >= $${paramIndex++}`);
    params.push(filters.bathrooms);
  }

  const whereClause = conditions.join(' AND ');

  // Query principal
  const propertiesQuery = `
    SELECT
      p.id,
      p.slug,
      p.codigo,
      p.titulo,
      p.traducciones,
      p.precio_venta,
      p.moneda_venta,
      p.precio_alquiler,
      p.moneda_alquiler,
      p.habitaciones,
      p.banos,
      p.medios_banos,
      p.parqueos,
      p.area_construida,
      p.area_total,
      p.imagen_principal,
      p.galeria_imagenes,
      p.destacada,
      p.es_proyecto,
      p.created_at,
      cp.nombre as categoria_nombre,
      cp.slug as categoria_slug,
      s.nombre as sector_nombre,
      s.slug as sector_slug,
      c.nombre as ciudad_nombre,
      c.slug as ciudad_slug
    FROM propiedades p
    LEFT JOIN categorias_propiedades cp ON p.categoria_id = cp.id
    LEFT JOIN ubicaciones s ON p.sector_id = s.id
    LEFT JOIN ubicaciones c ON p.ciudad_id = c.id
    WHERE ${whereClause}
    ORDER BY p.destacada DESC, p.created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex}
  `;

  params.push(limit, offset);

  // Query de conteo
  const countQuery = `
    SELECT COUNT(*) as total
    FROM propiedades p
    WHERE ${whereClause}
  `;

  const [properties, countResult] = await Promise.all([
    sql(propertiesQuery, params),
    sql(countQuery, params.slice(0, -2)) // Sin limit y offset
  ]);

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
export async function getPropertyBySlug(slug: string, tenantId: number) {
  const sql = getSQL();
  const result = await sql`
    SELECT
      p.*,
      cp.nombre as categoria_nombre,
      cp.slug as categoria_slug,
      cp.nombre_en as categoria_nombre_en,
      cp.nombre_fr as categoria_nombre_fr,
      s.nombre as sector_nombre,
      s.slug as sector_slug,
      s.coordenadas as sector_coordenadas,
      c.nombre as ciudad_nombre,
      c.slug as ciudad_slug,
      c.coordenadas as ciudad_coordenadas,
      pr.nombre as provincia_nombre,
      pr.slug as provincia_slug,
      proj.id as proyecto_id,
      proj.nombre as proyecto_nombre,
      proj.slug as proyecto_slug,
      proj.imagen_principal as proyecto_imagen
    FROM propiedades p
    LEFT JOIN categorias_propiedades cp ON p.categoria_id = cp.id
    LEFT JOIN ubicaciones s ON p.sector_id = s.id
    LEFT JOIN ubicaciones c ON p.ciudad_id = c.id
    LEFT JOIN ubicaciones pr ON c.parent_id = pr.id
    LEFT JOIN proyectos proj ON p.proyecto_id = proj.id
    WHERE p.slug = ${slug}
      AND p.tenant_id = ${tenantId}
      AND p.estado IN ('disponible', 'reservado')
    LIMIT 1
  `;
  return result[0] || null;
}

// Obtener amenidades de una propiedad
export async function getPropertyAmenities(propertyId: number) {
  const sql = getSQL();
  return sql`
    SELECT
      a.id,
      a.nombre as name,
      a.nombre_en as name_en,
      a.nombre_fr as name_fr,
      a.icono as icon,
      a.categoria as category
    FROM propiedad_amenidades pa
    JOIN amenidades a ON pa.amenidad_id = a.id
    WHERE pa.propiedad_id = ${propertyId}
    ORDER BY a.categoria, a.nombre
  `;
}

// Obtener agentes de una propiedad
export async function getPropertyAgents(propertyId: number) {
  const sql = getSQL();
  return sql`
    SELECT
      pa.es_principal as is_main,
      u.id,
      u.slug,
      CONCAT(u.nombre, ' ', u.apellido) as full_name,
      u.nombre as first_name,
      u.apellido as last_name,
      u.avatar as photo_url,
      u.telefono as phone,
      u.whatsapp,
      u.email
    FROM propiedad_asesores pa
    JOIN usuarios u ON pa.asesor_id = u.id
    WHERE pa.propiedad_id = ${propertyId}
      AND u.activo = true
    ORDER BY pa.es_principal DESC
  `;
}

// Obtener asesor por slug
export async function getAdvisorBySlug(slug: string, tenantId: number) {
  const sql = getSQL();
  const result = await sql`
    SELECT
      u.*,
      pa.bio,
      pa.especialidades as specialties,
      pa.idiomas as languages,
      pa.certificaciones as certifications,
      pa.redes_sociales as social,
      pa.estadisticas as stats
    FROM usuarios u
    LEFT JOIN perfiles_asesor pa ON u.id = pa.usuario_id
    WHERE u.slug = ${slug}
      AND u.tenant_id = ${tenantId}
      AND u.activo = true
      AND u.rol IN ('asesor', 'admin', 'gerente')
    LIMIT 1
  `;
  return result[0] || null;
}

// Obtener contenido (artículos, videos, testimonios)
export async function getContent(options: {
  tenantId: number;
  type: 'articulos' | 'videos' | 'testimonios';
  slug?: string;
  categorySlug?: string;
  page?: number;
  limit?: number;
  language?: string;
}) {
  const sql = getSQL();
  const { tenantId, type, slug, categorySlug, page = 1, limit = 12, language = 'es' } = options;
  const offset = (page - 1) * limit;

  const table = type;

  if (slug) {
    // Obtener item individual
    const result = await sql`
      SELECT *
      FROM ${sql(table)}
      WHERE slug = ${slug}
        AND tenant_id = ${tenantId}
        AND estado = 'publicado'
      LIMIT 1
    `;
    return { item: result[0] || null };
  }

  // Obtener lista
  let categoryCondition = '';
  const params: any[] = [tenantId, 'publicado', limit, offset];

  if (categorySlug) {
    categoryCondition = 'AND categoria_slug = $5';
    params.push(categorySlug);
  }

  const items = await sql`
    SELECT *
    FROM ${sql(table)}
    WHERE tenant_id = ${tenantId}
      AND estado = 'publicado'
      ${categorySlug ? sql`AND categoria_slug = ${categorySlug}` : sql``}
    ORDER BY fecha_publicacion DESC, created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const countResult = await sql`
    SELECT COUNT(*) as total
    FROM ${sql(table)}
    WHERE tenant_id = ${tenantId}
      AND estado = 'publicado'
      ${categorySlug ? sql`AND categoria_slug = ${categorySlug}` : sql``}
  `;

  const total = parseInt(countResult[0]?.total || '0', 10);

  return {
    items,
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

// Obtener FAQs
export async function getFAQs(options: {
  tenantId: number;
  context?: 'general' | 'property' | 'advisor' | 'location';
  contextId?: number;
  limit?: number;
}) {
  const sql = getSQL();
  const { tenantId, context, contextId, limit = 10 } = options;

  return sql`
    SELECT
      id,
      pregunta as question,
      pregunta_en as question_en,
      pregunta_fr as question_fr,
      respuesta as answer,
      respuesta_en as answer_en,
      respuesta_fr as answer_fr,
      categoria as category,
      orden as order
    FROM faqs
    WHERE tenant_id = ${tenantId}
      AND activo = true
      ${context ? sql`AND contexto = ${context}` : sql``}
      ${contextId ? sql`AND contexto_id = ${contextId}` : sql``}
    ORDER BY orden ASC
    LIMIT ${limit}
  `;
}

export default {
  getSQL,
  query,
  queryOne,
  transaction,
  getTenantByDomain,
  getDefaultTenant,
  getLocationBySlug,
  getProperties,
  getPropertyBySlug,
  getPropertyAmenities,
  getPropertyAgents,
  getAdvisorBySlug,
  getContent,
  getFAQs
};
