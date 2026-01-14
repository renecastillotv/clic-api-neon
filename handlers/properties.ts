// api/handlers/properties.ts
// Handler para propiedades - lista y detalle individual

import db from '../lib/db';
import utils from '../lib/utils';
import type {
  PropertyListResponse,
  SinglePropertyResponse,
  PropertyCard,
  Property,
  TenantConfig,
  SEOData
} from '../types';

// ============================================================================
// HANDLER: Lista de Propiedades
// ============================================================================

export async function handlePropertyList(options: {
  tenant: TenantConfig;
  tags: string[];
  language: string;
  trackingString: string;
  page: number;
  limit: number;
  searchParams: URLSearchParams;
}): Promise<PropertyListResponse> {
  const { tenant, tags, language, trackingString, page, limit, searchParams } = options;
  const sql = db.getSQL();

  // Parsear filtros desde tags y query params
  const filters = await parseFiltersFromTags(tenant.id, tags, language, searchParams);

  console.log('[Properties Handler] Filters parsed:', filters);

  // Obtener propiedades
  const { properties: rawProperties, pagination } = await db.getProperties({
    tenantId: tenant.id,
    filters,
    page,
    limit,
    language
  });

  // Convertir a PropertyCard
  const properties: PropertyCard[] = rawProperties.map(prop =>
    utils.toPropertyCard(prop, language, trackingString)
  );

  // Agregar amenity badges si hay propiedades
  if (properties.length > 0) {
    const propertyIds = rawProperties.map(p => p.id);
    const amenitiesMap = await getAmenitiesForProperties(propertyIds);

    properties.forEach((card, index) => {
      const propAmenities = amenitiesMap.get(rawProperties[index].id) || [];
      card.amenity_badges = propAmenities.slice(0, 2).map(a => ({
        text: utils.getTranslatedField(a, 'name', language),
        icon: a.icon
      }));
    });
  }

  // Calcular estadísticas agregadas
  const aggregatedStats = await calculateAggregatedStats(tenant.id, filters);

  // Generar SEO
  const seoTitle = buildListTitle(filters, language, pagination.total_items);
  const seoDescription = buildListDescription(filters, language, pagination.total_items);

  const seo: SEOData = utils.generateSEO({
    title: seoTitle,
    description: seoDescription,
    keywords: buildListKeywords(filters, language),
    canonicalUrl: buildCanonicalUrl(tags, language),
    ogImage: properties[0]?.main_image,
    language,
    siteName: tenant.name
  });

  // Obtener contenido relacionado
  const relatedContent = await getRelatedContent(tenant.id, filters, language);

  // Obtener carouseles
  const carousels = await getCarousels(tenant.id, filters, language, trackingString);

  return {
    pageType: 'property-list',
    language,
    tenant,
    seo,
    trackingString,
    properties,
    totalProperties: pagination.total_items,
    pagination,
    filters: {
      active: filters,
      available: await getAvailableFilters(tenant.id, language)
    },
    aggregatedStats,
    carousels,
    relatedContent
  };
}

// ============================================================================
// HANDLER: Propiedad Individual
// ============================================================================

export async function handleSingleProperty(options: {
  tenant: TenantConfig;
  propertySlug: string;
  language: string;
  trackingString: string;
}): Promise<SinglePropertyResponse | null> {
  const { tenant, propertySlug, language, trackingString } = options;

  // Obtener propiedad
  const rawProperty = await db.getPropertyBySlug(propertySlug, tenant.id);

  if (!rawProperty) {
    return null;
  }

  // Procesar traducciones
  const processedProperty = utils.processTranslations(rawProperty, language);

  // Obtener datos relacionados en paralelo
  const [amenities, agents, similarProperties, relatedContent] = await Promise.all([
    db.getPropertyAmenities(rawProperty.id),
    db.getPropertyAgents(rawProperty.id),
    getSimilarProperties(tenant.id, rawProperty, language, trackingString),
    getPropertyRelatedContent(tenant.id, rawProperty, language)
  ]);

  // Construir objeto Property completo
  const property = buildFullProperty(processedProperty, amenities, agents, language, trackingString);

  // Encontrar agente principal
  const mainAgent = agents.find(a => a.is_main) || agents[0];
  const cocaptors = agents.filter(a => !a.is_main);

  // Obtener propiedades del agente si corresponde
  let agentProperties: PropertyCard[] = [];
  if (mainAgent && agents.length === 1) {
    agentProperties = await getAgentProperties(tenant.id, mainAgent.id, rawProperty.id, language, trackingString);
  }

  // Generar SEO
  const seo = generatePropertySEO(property, language, tenant);

  return {
    pageType: 'single-property',
    language,
    tenant,
    seo,
    trackingString,
    property,
    agent: {
      main: mainAgent ? {
        id: mainAgent.id,
        slug: mainAgent.slug,
        full_name: mainAgent.full_name,
        photo_url: mainAgent.photo_url,
        phone: mainAgent.phone,
        whatsapp: mainAgent.whatsapp,
        email: mainAgent.email,
        is_main: true
      } : undefined,
      cocaptors: cocaptors.map(c => ({
        id: c.id,
        slug: c.slug,
        full_name: c.full_name,
        photo_url: c.photo_url,
        phone: c.phone,
        whatsapp: c.whatsapp,
        email: c.email,
        is_main: false
      })),
      properties_count: agentProperties.length,
      should_show_properties: agentProperties.length > 0
    },
    relatedContent: {
      similar_properties: similarProperties,
      articles: relatedContent.articles,
      videos: relatedContent.videos,
      faqs: relatedContent.faqs,
      testimonials: relatedContent.testimonials,
      agent_properties: agentProperties
    }
  };
}

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

async function parseFiltersFromTags(
  tenantId: number,
  tags: string[],
  language: string,
  searchParams: URLSearchParams
): Promise<Record<string, any>> {
  const sql = db.getSQL();
  const filters: Record<string, any> = {};

  // Mapeo de slugs de operación
  const operationSlugs: Record<string, string> = {
    'comprar': 'venta', 'buy': 'venta', 'acheter': 'venta',
    'alquilar': 'alquiler', 'rent': 'alquiler', 'louer': 'alquiler',
    'venta': 'venta', 'alquiler': 'alquiler'
  };

  for (const tag of tags) {
    // Verificar si es operación
    if (operationSlugs[tag.toLowerCase()]) {
      filters.operation = operationSlugs[tag.toLowerCase()];
      continue;
    }

    // Buscar en categorías
    const category = await sql`
      SELECT id, slug FROM categorias_propiedades
      WHERE (slug = ${tag} OR slug_en = ${tag} OR slug_fr = ${tag})
        AND tenant_id = ${tenantId}
      LIMIT 1
    `;

    if (category[0]) {
      filters.categoryId = category[0].id;
      continue;
    }

    // Buscar en ubicaciones
    const location = await sql`
      SELECT id, slug, tipo FROM ubicaciones
      WHERE (slug = ${tag} OR slug_en = ${tag} OR slug_fr = ${tag})
        AND tenant_id = ${tenantId}
        AND activo = true
      LIMIT 1
    `;

    if (location[0]) {
      filters.locationId = location[0].id;
      filters.locationType = location[0].tipo;
      continue;
    }

    // Parsear patrones de habitaciones/baños
    const bedroomMatch = tag.match(/^(\d+)-(?:habitaciones?|bedrooms?|chambres?)$/i);
    if (bedroomMatch) {
      filters.bedrooms = parseInt(bedroomMatch[1], 10);
      continue;
    }

    const bathroomMatch = tag.match(/^(\d+)-(?:banos?|bathrooms?|salles?-de-bains?)$/i);
    if (bathroomMatch) {
      filters.bathrooms = parseInt(bathroomMatch[1], 10);
      continue;
    }
  }

  // Agregar filtros de query params
  if (searchParams.get('min_price')) {
    filters.minPrice = parseInt(searchParams.get('min_price')!, 10);
  }
  if (searchParams.get('max_price')) {
    filters.maxPrice = parseInt(searchParams.get('max_price')!, 10);
  }
  if (searchParams.get('bedrooms')) {
    filters.bedrooms = parseInt(searchParams.get('bedrooms')!, 10);
  }
  if (searchParams.get('bathrooms')) {
    filters.bathrooms = parseInt(searchParams.get('bathrooms')!, 10);
  }

  return filters;
}

async function getAmenitiesForProperties(propertyIds: number[]): Promise<Map<number, any[]>> {
  const sql = db.getSQL();
  const map = new Map<number, any[]>();

  if (propertyIds.length === 0) return map;

  const amenities = await sql`
    SELECT
      pa.propiedad_id,
      a.nombre as name,
      a.nombre_en as name_en,
      a.nombre_fr as name_fr,
      a.icono as icon,
      a.categoria as category
    FROM propiedad_amenidades pa
    JOIN amenidades a ON pa.amenidad_id = a.id
    WHERE pa.propiedad_id = ANY(${propertyIds})
    ORDER BY a.categoria, a.nombre
  `;

  amenities.forEach(amenity => {
    const existing = map.get(amenity.propiedad_id) || [];
    existing.push(amenity);
    map.set(amenity.propiedad_id, existing);
  });

  return map;
}

async function calculateAggregatedStats(tenantId: number, filters: Record<string, any>) {
  const sql = db.getSQL();

  // Query simplificada para estadísticas
  const result = await sql`
    SELECT
      COUNT(*) as total_count,
      AVG(COALESCE(precio_venta, precio_alquiler)) as avg_price,
      MIN(COALESCE(precio_venta, precio_alquiler)) as min_price,
      MAX(COALESCE(precio_venta, precio_alquiler)) as max_price,
      COALESCE(moneda_venta, moneda_alquiler, 'USD') as currency
    FROM propiedades
    WHERE tenant_id = ${tenantId}
      AND estado = 'disponible'
      ${filters.operation === 'venta' ? sql`AND precio_venta IS NOT NULL` : sql``}
      ${filters.operation === 'alquiler' ? sql`AND precio_alquiler IS NOT NULL` : sql``}
      ${filters.categoryId ? sql`AND categoria_id = ${filters.categoryId}` : sql``}
      ${filters.locationId ? sql`AND (sector_id = ${filters.locationId} OR ciudad_id = ${filters.locationId})` : sql``}
  `;

  const stats = result[0];

  return {
    totalCount: parseInt(stats?.total_count || '0', 10),
    avgPrice: parseFloat(stats?.avg_price || '0'),
    minPrice: parseFloat(stats?.min_price || '0'),
    maxPrice: parseFloat(stats?.max_price || '0'),
    currency: stats?.currency || 'USD'
  };
}

function buildListTitle(filters: Record<string, any>, language: string, total: number): string {
  const parts: string[] = [];

  // Textos por idioma
  const texts = {
    es: {
      properties: 'Propiedades',
      forSale: 'en Venta',
      forRent: 'en Alquiler',
      in: 'en',
      found: `${total} propiedades encontradas`
    },
    en: {
      properties: 'Properties',
      forSale: 'for Sale',
      forRent: 'for Rent',
      in: 'in',
      found: `${total} properties found`
    },
    fr: {
      properties: 'Propriétés',
      forSale: 'à Vendre',
      forRent: 'à Louer',
      in: 'à',
      found: `${total} propriétés trouvées`
    }
  };

  const t = texts[language as keyof typeof texts] || texts.es;

  parts.push(t.properties);

  if (filters.operation === 'venta') {
    parts.push(t.forSale);
  } else if (filters.operation === 'alquiler') {
    parts.push(t.forRent);
  }

  return parts.join(' ');
}

function buildListDescription(filters: Record<string, any>, language: string, total: number): string {
  const texts = {
    es: `Encuentra ${total} propiedades disponibles. Amplia selección de inmuebles con fotos, precios y características detalladas.`,
    en: `Find ${total} available properties. Wide selection of real estate with photos, prices and detailed features.`,
    fr: `Trouvez ${total} propriétés disponibles. Large sélection de biens immobiliers avec photos, prix et caractéristiques détaillées.`
  };

  return texts[language as keyof typeof texts] || texts.es;
}

function buildListKeywords(filters: Record<string, any>, language: string): string {
  const baseKeywords = {
    es: 'propiedades, inmuebles, bienes raíces, casas, apartamentos',
    en: 'properties, real estate, homes, apartments, houses',
    fr: 'propriétés, immobilier, maisons, appartements'
  };

  return baseKeywords[language as keyof typeof baseKeywords] || baseKeywords.es;
}

function buildCanonicalUrl(tags: string[], language: string): string {
  const path = '/' + tags.filter(Boolean).join('/');
  return utils.buildUrl(path, language);
}

async function getAvailableFilters(tenantId: number, language: string) {
  const sql = db.getSQL();

  const [categories, locations] = await Promise.all([
    sql`
      SELECT id, slug, nombre as name, nombre_en, nombre_fr
      FROM categorias_propiedades
      WHERE tenant_id = ${tenantId} AND activo = true
      ORDER BY nombre
    `,
    sql`
      SELECT id, slug, nombre as name, tipo as type
      FROM ubicaciones
      WHERE tenant_id = ${tenantId} AND activo = true
      ORDER BY tipo, nombre
    `
  ]);

  return {
    categories: categories.map(c => ({
      id: c.id,
      slug: c.slug,
      name: utils.getTranslatedField(c, 'name', language)
    })),
    locations: locations.map(l => ({
      id: l.id,
      slug: l.slug,
      name: l.name,
      type: l.type
    })),
    operations: [
      { slug: language === 'es' ? 'comprar' : language === 'en' ? 'buy' : 'acheter', value: 'venta' },
      { slug: language === 'es' ? 'alquilar' : language === 'en' ? 'rent' : 'louer', value: 'alquiler' }
    ]
  };
}

async function getRelatedContent(tenantId: number, filters: Record<string, any>, language: string) {
  const sql = db.getSQL();

  const [articles, videos, faqs, testimonials] = await Promise.all([
    sql`
      SELECT id, slug, titulo as title, titulo_en, titulo_fr, extracto as excerpt, imagen_destacada as image
      FROM articulos
      WHERE tenant_id = ${tenantId} AND estado = 'publicado'
      ORDER BY fecha_publicacion DESC
      LIMIT 3
    `,
    sql`
      SELECT id, slug, titulo as title, titulo_en, titulo_fr, thumbnail, video_url
      FROM videos
      WHERE tenant_id = ${tenantId} AND estado = 'publicado'
      ORDER BY fecha_publicacion DESC
      LIMIT 3
    `,
    db.getFAQs({ tenantId, context: 'general', limit: 5 }),
    sql`
      SELECT id, contenido as content, calificacion as rating, nombre_cliente as client_name, foto_cliente as client_photo
      FROM testimonios
      WHERE tenant_id = ${tenantId} AND estado = 'aprobado' AND destacado = true
      ORDER BY created_at DESC
      LIMIT 3
    `
  ]);

  return {
    articles: articles.map(a => ({
      ...a,
      title: utils.getTranslatedField(a, 'title', language)
    })),
    videos: videos.map(v => ({
      ...v,
      title: utils.getTranslatedField(v, 'title', language)
    })),
    faqs: faqs.map(f => ({
      ...f,
      question: utils.getTranslatedField(f, 'question', language),
      answer: utils.getTranslatedField(f, 'answer', language)
    })),
    testimonials
  };
}

async function getCarousels(
  tenantId: number,
  filters: Record<string, any>,
  language: string,
  trackingString: string
) {
  const sql = db.getSQL();

  // Obtener propiedades destacadas para carouseles
  const featured = await sql`
    SELECT p.*, cp.nombre as categoria_nombre, cp.slug as categoria_slug,
           s.nombre as sector_nombre, s.slug as sector_slug,
           c.nombre as ciudad_nombre, c.slug as ciudad_slug
    FROM propiedades p
    LEFT JOIN categorias_propiedades cp ON p.categoria_id = cp.id
    LEFT JOIN ubicaciones s ON p.sector_id = s.id
    LEFT JOIN ubicaciones c ON p.ciudad_id = c.id
    WHERE p.tenant_id = ${tenantId}
      AND p.estado = 'disponible'
      AND p.destacada = true
    ORDER BY p.created_at DESC
    LIMIT 12
  `;

  if (featured.length === 0) return [];

  const titles = {
    es: 'Propiedades Destacadas',
    en: 'Featured Properties',
    fr: 'Propriétés en Vedette'
  };

  return [{
    id: 'featured',
    title: titles[language as keyof typeof titles] || titles.es,
    properties: featured.map(p => utils.toPropertyCard(p, language, trackingString))
  }];
}

function buildFullProperty(
  raw: Record<string, any>,
  amenities: any[],
  agents: any[],
  language: string,
  trackingString: string
): Property {
  const { main_image, images } = utils.processImages(raw.imagen_principal, raw.galeria_imagenes);
  const locationHierarchy = utils.buildLocationHierarchy(raw);
  const priceDisplay = utils.buildPriceDisplay(raw, language);

  // Construir todos los precios disponibles
  const prices = [];
  if (raw.precio_venta) {
    prices.push({
      type: 'sale' as const,
      amount: raw.precio_venta,
      currency: raw.moneda_venta || 'USD',
      display: utils.formatPrice(raw.precio_venta, raw.moneda_venta || 'USD', 'sale', language)
    });
  }
  if (raw.precio_alquiler) {
    prices.push({
      type: 'rental' as const,
      amount: raw.precio_alquiler,
      currency: raw.moneda_alquiler || 'USD',
      display: utils.formatPrice(raw.precio_alquiler, raw.moneda_alquiler || 'USD', 'rental', language)
    });
  }

  return {
    id: raw.id,
    slug: raw.slug,
    code: raw.codigo,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    tenant_id: raw.tenant_id,

    title: {
      es: raw.titulo,
      en: raw.titulo_en || raw.traducciones?.en?.titulo,
      fr: raw.titulo_fr || raw.traducciones?.fr?.titulo
    },

    description: {
      es: raw.descripcion || '',
      en: raw.descripcion_en || raw.traducciones?.en?.descripcion,
      fr: raw.descripcion_fr || raw.traducciones?.fr?.descripcion
    },

    location: locationHierarchy,
    address: raw.direccion,
    coordinates: utils.parseCoordinates(raw.coordenadas_exactas || raw.ciudad_coordenadas),

    category: {
      id: raw.categoria_id,
      slug: raw.categoria_slug,
      name: raw.categoria_nombre,
      name_en: raw.categoria_nombre_en,
      name_fr: raw.categoria_nombre_fr
    },

    operation_type: raw.precio_venta && raw.precio_alquiler ? 'ambos' :
                    raw.precio_venta ? 'venta' : 'alquiler',

    prices,
    primary_price: priceDisplay,

    features: {
      bedrooms: raw.habitaciones || 0,
      bathrooms: raw.banos || 0,
      half_bathrooms: raw.medios_banos || 0,
      parking_spaces: raw.parqueos || 0,
      area_construction: raw.area_construida || 0,
      area_total: raw.area_total || 0,
      floor: raw.piso,
      year_built: raw.ano_construccion
    },

    images,
    main_image,

    amenities: amenities.map(a => ({
      id: a.id,
      name: a.name,
      name_en: a.name_en,
      name_fr: a.name_fr,
      icon: a.icon,
      category: a.category
    })),

    amenity_badges: amenities.slice(0, 2).map(a => ({
      text: utils.getTranslatedField(a, 'name', language),
      icon: a.icon,
      category: a.category
    })),

    agents: agents.map(a => ({
      id: a.id,
      slug: a.slug,
      full_name: a.full_name,
      photo_url: a.photo_url,
      phone: a.phone,
      whatsapp: a.whatsapp,
      email: a.email,
      is_main: a.is_main
    })),

    main_agent: agents.find(a => a.is_main) || agents[0],

    project: raw.proyecto_id ? {
      id: raw.proyecto_id,
      slug: raw.proyecto_slug,
      name: raw.proyecto_nombre,
      image: raw.proyecto_imagen
    } : undefined,

    status: raw.estado,
    is_featured: raw.destacada || false,
    is_project: raw.es_proyecto || false,
    is_new: new Date(raw.created_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),

    url: utils.buildPropertyUrl(raw, language, trackingString)
  };
}

async function getSimilarProperties(
  tenantId: number,
  property: Record<string, any>,
  language: string,
  trackingString: string
): Promise<PropertyCard[]> {
  const sql = db.getSQL();

  const similar = await sql`
    SELECT p.*, cp.nombre as categoria_nombre, cp.slug as categoria_slug,
           s.nombre as sector_nombre, s.slug as sector_slug,
           c.nombre as ciudad_nombre, c.slug as ciudad_slug
    FROM propiedades p
    LEFT JOIN categorias_propiedades cp ON p.categoria_id = cp.id
    LEFT JOIN ubicaciones s ON p.sector_id = s.id
    LEFT JOIN ubicaciones c ON p.ciudad_id = c.id
    WHERE p.tenant_id = ${tenantId}
      AND p.estado = 'disponible'
      AND p.id != ${property.id}
      AND (
        p.categoria_id = ${property.categoria_id}
        OR p.ciudad_id = ${property.ciudad_id}
        OR p.sector_id = ${property.sector_id}
      )
    ORDER BY
      CASE WHEN p.sector_id = ${property.sector_id} THEN 0 ELSE 1 END,
      CASE WHEN p.categoria_id = ${property.categoria_id} THEN 0 ELSE 1 END,
      p.destacada DESC
    LIMIT 6
  `;

  return similar.map(p => utils.toPropertyCard(p, language, trackingString));
}

async function getPropertyRelatedContent(tenantId: number, property: Record<string, any>, language: string) {
  return getRelatedContent(tenantId, {
    categoryId: property.categoria_id,
    locationId: property.ciudad_id
  }, language);
}

async function getAgentProperties(
  tenantId: number,
  agentId: number,
  excludePropertyId: number,
  language: string,
  trackingString: string
): Promise<PropertyCard[]> {
  const sql = db.getSQL();

  const properties = await sql`
    SELECT p.*, cp.nombre as categoria_nombre, cp.slug as categoria_slug,
           s.nombre as sector_nombre, s.slug as sector_slug,
           c.nombre as ciudad_nombre, c.slug as ciudad_slug
    FROM propiedades p
    JOIN propiedad_asesores pa ON p.id = pa.propiedad_id
    LEFT JOIN categorias_propiedades cp ON p.categoria_id = cp.id
    LEFT JOIN ubicaciones s ON p.sector_id = s.id
    LEFT JOIN ubicaciones c ON p.ciudad_id = c.id
    WHERE pa.asesor_id = ${agentId}
      AND p.tenant_id = ${tenantId}
      AND p.estado = 'disponible'
      AND p.id != ${excludePropertyId}
    ORDER BY p.destacada DESC, p.created_at DESC
    LIMIT 8
  `;

  return properties.map(p => utils.toPropertyCard(p, language, trackingString));
}

function generatePropertySEO(property: Property, language: string, tenant: TenantConfig): SEOData {
  const title = utils.getLocalizedText(property.title, language);
  const location = utils.buildLocationDisplay(property.location);

  const seoTitle = `${title} | ${property.primary_price.display} | ${tenant.name}`;

  const description = utils.getLocalizedText(property.description, language);
  const seoDescription = description
    ? description.substring(0, 150)
    : `${title} en ${location}. ${property.features.bedrooms} hab, ${property.features.bathrooms} baños. ${property.primary_price.display}`;

  return utils.generateSEO({
    title: seoTitle,
    description: seoDescription,
    keywords: `${title}, ${location}, ${property.category.name}, inmuebles`,
    canonicalUrl: property.url,
    ogImage: property.main_image,
    language,
    type: 'property',
    siteName: tenant.name
  });
}

export default {
  handlePropertyList,
  handleSingleProperty
};
