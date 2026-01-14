// api/handlers/properties.ts
// Handler para propiedades - lista y detalle individual
// Adaptado al schema real de Neon

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

  // Parsear filtros desde tags y query params
  const filters = parseFiltersFromTags(tags, searchParams);

  console.log('[Properties Handler] Filters parsed:', filters);

  // Obtener propiedades usando db.getProperties
  const { properties: rawProperties, pagination } = await db.getProperties({
    tenantId: tenant.id,
    filters,
    page,
    limit,
    language
  });

  // Convertir a PropertyCard
  const properties: PropertyCard[] = rawProperties.map(prop =>
    toPropertyCard(prop, language, trackingString)
  );

  // Calcular estadísticas agregadas
  const aggregatedStats = await db.getQuickStats(tenant.id);

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
  const [faqs, testimonials] = await Promise.all([
    db.getFAQs({ tenantId: tenant.id, limit: 5 }),
    db.getTestimonials(tenant.id, 3)
  ]);

  // Obtener propiedades destacadas para carousel
  const featuredProperties = await db.getFeaturedProperties(tenant.id, 12);
  const carousels = featuredProperties.length > 0 ? [{
    id: 'featured',
    title: language === 'en' ? 'Featured Properties' : language === 'fr' ? 'Propriétés en Vedette' : 'Propiedades Destacadas',
    properties: featuredProperties.map(p => toPropertyCard(p, language, trackingString))
  }] : [];

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
    aggregatedStats: {
      totalCount: aggregatedStats.total_properties,
      forSale: aggregatedStats.for_sale,
      forRent: aggregatedStats.for_rent,
      newThisMonth: aggregatedStats.new_this_month
    },
    carousels,
    relatedContent: {
      faqs: faqs.map(f => ({
        question: f.question,
        answer: f.answer,
        category: f.category
      })),
      testimonials: testimonials.map(t => ({
        id: t.id,
        content: t.content,
        rating: t.rating,
        client_name: t.client_name,
        client_photo: t.client_photo
      }))
    }
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

  // Construir objeto Property completo
  const property = buildFullProperty(rawProperty, language, trackingString);

  // Obtener datos relacionados en paralelo
  const [similarProperties, faqs, testimonials] = await Promise.all([
    getSimilarProperties(tenant.id, rawProperty, language, trackingString),
    db.getFAQs({ tenantId: tenant.id, limit: 5 }),
    db.getTestimonials(tenant.id, 3)
  ]);

  // Construir agente desde los datos de la propiedad
  const mainAgent = rawProperty.agente_id ? {
    id: rawProperty.agente_id,
    slug: rawProperty.agente_slug || '',
    full_name: `${rawProperty.agente_nombre || ''} ${rawProperty.agente_apellido || ''}`.trim(),
    photo_url: rawProperty.agente_avatar || '',
    phone: rawProperty.agente_telefono || '',
    whatsapp: rawProperty.agente_telefono || '',
    email: rawProperty.agente_email || '',
    is_main: true
  } : undefined;

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
      main: mainAgent,
      cocaptors: [],
      properties_count: 0,
      should_show_properties: false
    },
    relatedContent: {
      similar_properties: similarProperties,
      articles: [],
      videos: [],
      faqs: faqs.map(f => ({
        question: f.question,
        answer: f.answer
      })),
      testimonials: testimonials.map(t => ({
        id: t.id,
        content: t.content,
        rating: t.rating,
        client_name: t.client_name
      })),
      agent_properties: []
    }
  };
}

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

function parseFiltersFromTags(
  tags: string[],
  searchParams: URLSearchParams
): Record<string, any> {
  const filters: Record<string, any> = {};

  // Mapeo de slugs de operación
  const operationSlugs: Record<string, string> = {
    'comprar': 'venta', 'buy': 'venta', 'acheter': 'venta',
    'alquilar': 'alquiler', 'rent': 'alquiler', 'louer': 'alquiler',
    'venta': 'venta', 'alquiler': 'alquiler'
  };

  // Mapeo de tipos de propiedad
  const propertyTypes: Record<string, string> = {
    'casa': 'casa', 'casas': 'casa', 'house': 'casa', 'houses': 'casa',
    'apartamento': 'apartamento', 'apartamentos': 'apartamento', 'apartment': 'apartamento',
    'local': 'local', 'locales': 'local', 'commercial': 'local',
    'terreno': 'terreno', 'terrenos': 'terreno', 'land': 'terreno',
    'oficina': 'oficina', 'oficinas': 'oficina', 'office': 'oficina',
    'penthouse': 'penthouse', 'villa': 'villa'
  };

  for (const tag of tags) {
    const tagLower = tag.toLowerCase();

    // Verificar si es operación
    if (operationSlugs[tagLower]) {
      filters.operacion = operationSlugs[tagLower];
      continue;
    }

    // Verificar si es tipo de propiedad
    if (propertyTypes[tagLower]) {
      filters.tipo = propertyTypes[tagLower];
      continue;
    }

    // Parsear patrones de habitaciones/baños
    const bedroomMatch = tag.match(/^(\d+)-(?:habitaciones?|bedrooms?|chambres?)$/i);
    if (bedroomMatch) {
      filters.habitaciones = parseInt(bedroomMatch[1], 10);
      continue;
    }

    const bathroomMatch = tag.match(/^(\d+)-(?:banos?|bathrooms?|salles?-de-bains?)$/i);
    if (bathroomMatch) {
      filters.banos = parseInt(bathroomMatch[1], 10);
      continue;
    }

    // Asumir que otros tags son ubicaciones (ciudad o sector)
    if (tag && !filters.ciudad) {
      // Convertir slug a nombre (reemplazar guiones por espacios)
      filters.ciudad = tag.replace(/-/g, ' ');
    } else if (tag && !filters.sector) {
      filters.sector = tag.replace(/-/g, ' ');
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
    filters.habitaciones = parseInt(searchParams.get('bedrooms')!, 10);
  }
  if (searchParams.get('bathrooms')) {
    filters.banos = parseInt(searchParams.get('bathrooms')!, 10);
  }
  if (searchParams.get('tipo')) {
    filters.tipo = searchParams.get('tipo');
  }
  if (searchParams.get('operacion')) {
    filters.operacion = searchParams.get('operacion');
  }

  return filters;
}

function toPropertyCard(prop: any, language: string, trackingString: string): PropertyCard {
  const price = prop.precio_venta || prop.precio_alquiler || prop.precio || 0;
  const currency = prop.moneda || 'USD';
  const operationType = prop.operacion || (prop.precio_venta ? 'venta' : 'alquiler');

  return {
    id: prop.id,
    slug: prop.slug,
    code: prop.codigo,
    title: prop.titulo,
    location: {
      city: prop.ciudad,
      sector: prop.sector,
      address: prop.direccion
    },
    price: {
      amount: price,
      currency: currency,
      display: utils.formatPrice(price, currency, operationType, language)
    },
    operation_type: operationType,
    features: {
      bedrooms: prop.habitaciones || 0,
      bathrooms: prop.banos || 0,
      half_bathrooms: prop.medios_banos || 0,
      parking_spaces: prop.estacionamientos || 0,
      area_construction: prop.m2_construccion || 0,
      area_total: prop.m2_terreno || 0
    },
    main_image: prop.imagen_principal || '',
    is_featured: prop.destacada || false,
    is_new: prop.created_at ? new Date(prop.created_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) : false,
    url: utils.buildPropertyUrl(prop, language, trackingString),
    amenity_badges: parseAmenityBadges(prop.amenidades)
  };
}

function parseAmenityBadges(amenidades: any): Array<{ text: string; icon?: string }> {
  if (!amenidades) return [];

  try {
    const parsed = typeof amenidades === 'string' ? JSON.parse(amenidades) : amenidades;
    if (Array.isArray(parsed)) {
      return parsed.slice(0, 2).map(a => ({
        text: typeof a === 'string' ? a : a.nombre || a.name || '',
        icon: typeof a === 'object' ? a.icono || a.icon : undefined
      }));
    }
  } catch {
    // Ignorar errores de parsing
  }

  return [];
}

function buildFullProperty(
  raw: Record<string, any>,
  language: string,
  trackingString: string
): Property {
  const images = parseImages(raw.imagenes, raw.imagen_principal);
  const price = raw.precio_venta || raw.precio_alquiler || raw.precio || 0;
  const currency = raw.moneda || 'USD';
  const operationType = raw.operacion || (raw.precio_venta ? 'venta' : 'alquiler');

  // Construir todos los precios disponibles
  const prices = [];
  if (raw.precio_venta) {
    prices.push({
      type: 'sale' as const,
      amount: raw.precio_venta,
      currency: currency,
      display: utils.formatPrice(raw.precio_venta, currency, 'venta', language)
    });
  }
  if (raw.precio_alquiler) {
    prices.push({
      type: 'rental' as const,
      amount: raw.precio_alquiler,
      currency: currency,
      display: utils.formatPrice(raw.precio_alquiler, currency, 'alquiler', language)
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
      en: raw.titulo,
      fr: raw.titulo
    },

    description: {
      es: raw.descripcion || raw.short_description || '',
      en: raw.descripcion || raw.short_description || '',
      fr: raw.descripcion || raw.short_description || ''
    },

    location: {
      country: raw.pais,
      province: raw.provincia,
      city: raw.ciudad,
      sector: raw.sector
    },
    address: raw.direccion,
    coordinates: raw.latitud && raw.longitud ? {
      lat: parseFloat(raw.latitud),
      lng: parseFloat(raw.longitud)
    } : undefined,

    category: {
      id: 0,
      slug: raw.tipo,
      name: raw.tipo
    },

    operation_type: operationType,

    prices,
    primary_price: {
      amount: price,
      currency: currency,
      type: operationType,
      display: utils.formatPrice(price, currency, operationType, language)
    },

    features: {
      bedrooms: raw.habitaciones || 0,
      bathrooms: raw.banos || 0,
      half_bathrooms: raw.medios_banos || 0,
      parking_spaces: raw.estacionamientos || 0,
      area_construction: raw.m2_construccion || 0,
      area_total: raw.m2_terreno || 0
    },

    images,
    main_image: raw.imagen_principal || images[0] || '',

    amenities: parseAmenities(raw.amenidades),
    amenity_badges: parseAmenityBadges(raw.amenidades),

    agents: [],
    main_agent: undefined,

    status: raw.estado_propiedad,
    is_featured: raw.destacada || false,
    is_project: raw.is_project || false,
    is_new: raw.created_at ? new Date(raw.created_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) : false,
    is_furnished: raw.is_furnished || false,
    is_exclusive: raw.exclusiva || false,

    url: utils.buildPropertyUrl(raw, language, trackingString)
  };
}

function parseImages(imagenes: any, imagenPrincipal?: string): string[] {
  const result: string[] = [];

  if (imagenPrincipal) {
    result.push(imagenPrincipal);
  }

  if (imagenes) {
    try {
      const parsed = typeof imagenes === 'string' ? JSON.parse(imagenes) : imagenes;
      if (Array.isArray(parsed)) {
        parsed.forEach(img => {
          const url = typeof img === 'string' ? img : img.url || img.src;
          if (url && !result.includes(url)) {
            result.push(url);
          }
        });
      }
    } catch {
      // Ignorar errores de parsing
    }
  }

  return result;
}

function parseAmenities(amenidades: any): Array<{ id: number; name: string; icon?: string; category?: string }> {
  if (!amenidades) return [];

  try {
    const parsed = typeof amenidades === 'string' ? JSON.parse(amenidades) : amenidades;
    if (Array.isArray(parsed)) {
      return parsed.map((a, index) => ({
        id: index,
        name: typeof a === 'string' ? a : a.nombre || a.name || '',
        icon: typeof a === 'object' ? a.icono || a.icon : undefined,
        category: typeof a === 'object' ? a.categoria || a.category : undefined
      }));
    }
  } catch {
    // Ignorar errores de parsing
  }

  return [];
}

async function getSimilarProperties(
  tenantId: string,
  property: Record<string, any>,
  language: string,
  trackingString: string
): Promise<PropertyCard[]> {
  const sql = db.getSQL();

  // Buscar propiedades similares por tipo, ciudad o sector
  const similar = await sql`
    SELECT
      p.id,
      p.slug,
      p.codigo,
      p.titulo,
      p.tipo,
      p.operacion,
      p.precio,
      p.precio_venta,
      p.precio_alquiler,
      p.moneda,
      p.ciudad,
      p.sector,
      p.direccion,
      p.habitaciones,
      p.banos,
      p.estacionamientos,
      p.m2_construccion,
      p.m2_terreno,
      p.imagen_principal,
      p.destacada,
      p.created_at
    FROM propiedades p
    WHERE p.tenant_id = ${tenantId}
      AND p.activo = true
      AND p.estado_propiedad = 'disponible'
      AND p.id != ${property.id}
      AND (
        p.tipo = ${property.tipo}
        OR LOWER(p.ciudad) = LOWER(${property.ciudad || ''})
        OR LOWER(p.sector) = LOWER(${property.sector || ''})
      )
    ORDER BY
      CASE WHEN LOWER(p.sector) = LOWER(${property.sector || ''}) THEN 0 ELSE 1 END,
      CASE WHEN p.tipo = ${property.tipo} THEN 0 ELSE 1 END,
      p.destacada DESC
    LIMIT 6
  `;

  return similar.map(p => toPropertyCard(p, language, trackingString));
}

async function getAvailableFilters(tenantId: string, language: string) {
  const { cities, sectors } = await db.getPopularLocations(tenantId);

  return {
    categories: [], // El schema no tiene categorías separadas, usa el campo tipo
    propertyTypes: [
      { slug: 'casa', name: language === 'en' ? 'House' : 'Casa' },
      { slug: 'apartamento', name: language === 'en' ? 'Apartment' : 'Apartamento' },
      { slug: 'local', name: language === 'en' ? 'Commercial' : 'Local' },
      { slug: 'terreno', name: language === 'en' ? 'Land' : 'Terreno' },
      { slug: 'oficina', name: language === 'en' ? 'Office' : 'Oficina' },
      { slug: 'penthouse', name: 'Penthouse' },
      { slug: 'villa', name: 'Villa' }
    ],
    locations: [
      ...cities.map((c: any) => ({ slug: c.slug, name: c.name, type: 'ciudad', count: parseInt(c.count, 10) })),
      ...sectors.map((s: any) => ({ slug: s.slug, name: s.name, type: 'sector', count: parseInt(s.count, 10) }))
    ],
    operations: [
      { slug: language === 'es' ? 'comprar' : language === 'en' ? 'buy' : 'acheter', value: 'venta' },
      { slug: language === 'es' ? 'alquilar' : language === 'en' ? 'rent' : 'louer', value: 'alquiler' }
    ]
  };
}

function buildListTitle(filters: Record<string, any>, language: string, total: number): string {
  const parts: string[] = [];

  const texts = {
    es: {
      properties: 'Propiedades',
      forSale: 'en Venta',
      forRent: 'en Alquiler'
    },
    en: {
      properties: 'Properties',
      forSale: 'for Sale',
      forRent: 'for Rent'
    },
    fr: {
      properties: 'Propriétés',
      forSale: 'à Vendre',
      forRent: 'à Louer'
    }
  };

  const t = texts[language as keyof typeof texts] || texts.es;

  parts.push(t.properties);

  if (filters.operacion === 'venta') {
    parts.push(t.forSale);
  } else if (filters.operacion === 'alquiler') {
    parts.push(t.forRent);
  }

  if (filters.ciudad) {
    parts.push(`en ${filters.ciudad}`);
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

function generatePropertySEO(property: Property, language: string, tenant: TenantConfig): SEOData {
  const title = property.title.es || property.title.en || '';
  const location = [property.location.sector, property.location.city].filter(Boolean).join(', ');

  const seoTitle = `${title} | ${property.primary_price.display} | ${tenant.name}`;

  const description = property.description.es || property.description.en || '';
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
