// api/handlers/homepage.ts
// Handler para la página de inicio
// Formato compatible con Supabase Edge Functions

import db from '../lib/db';
import utils from '../lib/utils';
import videosHandler from './videos';
import articlesHandler from './articles';
import type { TenantConfig } from '../types';

// ============================================================================
// HELPER: Limpiar HTML de texto
// ============================================================================

/**
 * Elimina tags HTML de un string y limpia espacios
 */
function stripHtml(html: string | null | undefined): string {
  if (!html) return '';

  return html
    // Reemplazar <br>, <br/>, <br /> con espacio
    .replace(/<br\s*\/?>/gi, ' ')
    // Reemplazar </p><p> con espacio (nuevo párrafo)
    .replace(/<\/p>\s*<p>/gi, ' ')
    // Eliminar todos los demás tags HTML
    .replace(/<[^>]*>/g, '')
    // Decodificar entidades HTML comunes
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Limpiar múltiples espacios
    .replace(/\s+/g, ' ')
    // Eliminar espacios al inicio y final
    .trim();
}

// ============================================================================
// HANDLER: Homepage (Formato Supabase)
// ============================================================================

export async function handleHomepage(options: {
  tenant: TenantConfig;
  language: string;
  trackingString: string;
}): Promise<any> {
  const { tenant, language, trackingString } = options;

  // Obtener datos en paralelo usando las funciones de db.ts
  const [
    featuredProperties,
    locationStats,
    propertyTypeStats,
    quickStats,
    testimonials,
    advisors,
    faqs,
    videosData,
    articlesData,
    filterOptions
  ] = await Promise.all([
    db.getFeaturedProperties(tenant.id, 12),
    db.getLocationStats(tenant.id),  // Usar getLocationStats para datos enriquecidos con imágenes
    db.getPropertyTypeStats(tenant.id),  // Estadísticas por tipo de propiedad
    db.getQuickStats(tenant.id),
    db.getTestimonials(tenant.id, 6),
    db.getAdvisors(tenant.id, 4),
    db.getFAQs({ tenantId: tenant.id, limit: 6 }),
    videosHandler.handleVideosMain({ tenant, language, trackingString, page: 1, limit: 6 }),
    articlesHandler.handleArticles({ tenant, language, trackingString, page: 1, limit: 4 }),
    db.getFilterOptions(tenant.id)
  ]);

  // Convertir propiedades al formato Supabase
  const properties = featuredProperties.map(p => toSupabasePropertyFormat(p, language, trackingString));

  // Usar filterOptions directamente como searchTags (incluye tipos, ubicaciones, amenidades)
  const searchTags = {
    tags: filterOptions,
    locationHierarchy: [],
    currencies: {
      available: ['USD', 'DOP'],
      default: 'USD'
    }
  };

  // Extraer videos y artículos reales de los handlers
  const realVideos = videosData?.recentVideos || videosData?.featuredVideos || [];
  const realArticles = (articlesData as any)?.recentArticles || (articlesData as any)?.featuredArticles || [];

  // Obtener propiedades destacadas por tipo (top 3 tipos)
  const topTypes = (propertyTypeStats as any[]).slice(0, 3);
  const featuredByTypePromises = topTypes.map(async (typeData: any) => {
    const typeProperties = await db.getFeaturedPropertiesByType(tenant.id, typeData.slug, 6);
    return {
      type: typeData.type,
      slug: typeData.slug,
      properties: (typeProperties as any[]).map(p => toSupabasePropertyFormat(p, language, trackingString))
    };
  });
  const featuredByTypeResults = await Promise.all(featuredByTypePromises);

  // Construir objeto featuredByType
  const featuredByType: Record<string, any> = {};
  featuredByTypeResults.forEach(({ type, slug, properties }) => {
    if (properties.length > 0) {
      featuredByType[type] = {
        properties,
        slug,
        title: language === 'es' ? `${type} Destacados` :
               language === 'en' ? `Featured ${type}` :
               `${type} en Vedette`,
        subtitle: language === 'es' ? `Explora las mejores opciones de ${type.toLowerCase()}` :
                  language === 'en' ? `Explore the best ${type.toLowerCase()} options` :
                  `Explorez les meilleures options de ${type.toLowerCase()}`
      };
    }
  });

  // Construir sections
  const sections = buildHomepageSections(tenant, featuredProperties, testimonials, advisors, faqs, language, trackingString, realVideos, realArticles);

  // Generar SEO
  const seo = generateHomepageSEO(tenant, language);

  // Generar breadcrumbs
  const breadcrumbs = [
    { name: 'Inicio', url: '/', is_active: true, is_current_page: true, position: 0 }
  ];

  // Respuesta en formato compatible con Supabase
  return {
    type: 'homepage',
    available: true,
    searchResults: {
      properties,
      tags: searchTags.tags,
      searchTerms: [],
      pagination: {
        currentPage: 1,
        totalCount: properties.length,
        itemsPerPage: 12,
        totalPages: 1,
        hasMore: false,
        hasNextPage: false,
        hasPreviousPage: false
      }
    },
    relatedContent: {
      // Formato compatible con RelatedArticles.astro
      articles: realArticles.slice(0, 6).map((a: any) => {
        const fallbackAvatar = tenant.branding?.isotipo_url || tenant.branding?.logo_url || '/images/team/clic-experts.jpg';
        return {
          id: a.id,
          slug: a.slug,
          url: a.url,
          title: a.title,
          excerpt: a.excerpt || '',
          featuredImage: a.featuredImage || a.image || null,
          author: {
            name: a.author?.name || 'Equipo CLIC',
            avatar: a.author?.avatar || fallbackAvatar
          },
          publishedAt: a.publishedAt || new Date().toISOString(),
          readTime: a.readTime || a.read_time || '5 min',
          category: a.category?.name || a.categoryName || 'General',
          views: a.views || 0,
          featured: a.featured || false,
          total_weight: a.total_weight || 0,
          content_priority: a.content_priority || 'default',
          sort_order: a.sort_order || 0
        };
      }),
      // Formato compatible con VideoGallery.astro
      videos: realVideos.slice(0, 6).map((v: any) => ({
        id: v.id,
        title: v.title,
        description: stripHtml(v.description),
        thumbnail: v.thumbnail,
        videoId: v.videoId,
        videoSlug: v.slug,
        duration: v.durationFormatted || v.duration || '0:00',
        views: v.views || 0,
        category: v.category?.name || v.categoryName || 'General',
        url: v.url,
        featured: v.featured || false,
        total_weight: v.total_weight || 0,
        content_priority: v.content_priority || 'default',
        sort_order: v.sort_order || 0
      })),
      testimonials: utils.formatTestimonials(testimonials, language, { trackingString }),
      // FAQs removidos de aquí - ya están en sections para evitar duplicación
      seo_content: [],
      content_source: 'neon_db',
      hierarchy_info: {
        specific_count: 0,
        tag_related_count: testimonials.length,
        default_count: 0
      },
      carousels: [{
        id: 'featured',
        title: language === 'en' ? 'Featured Properties' : language === 'fr' ? 'Propriétés en Vedette' : 'Propiedades Destacadas',
        properties: properties.slice(0, 6)
      }]
    },
    referralAgent: null,
    breadcrumbs,
    seo,
    countryInfo: {
      code: tenant.regional?.country_code || 'DO',
      name: 'República Dominicana',
      currency: tenant.regional?.currency_default || 'USD'
    },
    // Campos adicionales específicos del homepage
    sections,
    searchTags,
    hotItems: {
      // Usar locationStats con datos enriquecidos (imagen, count_venta, count_alquiler)
      // Campos compatibles con PopularLocations.astro: title, url, image, property_count
      // min_price separado por venta/alquiler, normalizado a USD
      cities: locationStats.cities.slice(0, 8).map((c: any) => ({
        slug: c.slug,
        title: c.name,          // PopularLocations usa title
        name: c.name,
        url: utils.buildUrl(`/comprar/${c.slug}`, language, trackingString),
        image: c.image || null, // PopularLocations usa image
        property_count: parseInt(c.count, 10),  // PopularLocations usa property_count
        count: parseInt(c.count, 10),
        count_venta: parseInt(c.count_venta || '0', 10),
        count_alquiler: parseInt(c.count_alquiler || '0', 10),
        parent_slug: c.parent_slug || null,
        min_price_venta: c.min_price_venta ? parseFloat(c.min_price_venta) : null,
        min_price_venta_currency: c.min_price_venta_currency || 'USD',
        min_price_alquiler: c.min_price_alquiler ? parseFloat(c.min_price_alquiler) : null,
        min_price_alquiler_currency: c.min_price_alquiler_currency || 'USD'
      })),
      sectors: locationStats.sectors.slice(0, 12).map((s: any) => ({
        slug: s.slug,
        title: s.name,          // PopularLocations usa title
        name: s.name,
        url: utils.buildUrl(`/comprar/${s.slug}`, language, trackingString),
        image: s.image || null, // PopularLocations usa image
        property_count: parseInt(s.count, 10),  // PopularLocations usa property_count
        count: parseInt(s.count, 10),
        count_venta: parseInt(s.count_venta || '0', 10),
        count_alquiler: parseInt(s.count_alquiler || '0', 10),
        parent_slug: s.parent_slug || null,
        min_price_venta: s.min_price_venta ? parseFloat(s.min_price_venta) : null,
        min_price_venta_currency: s.min_price_venta_currency || 'USD',
        min_price_alquiler: s.min_price_alquiler ? parseFloat(s.min_price_alquiler) : null,
        min_price_alquiler_currency: s.min_price_alquiler_currency || 'USD'
      })),
      properties: properties.slice(0, 6),
      agents: advisors.slice(0, 4).map((a: any) => ({
        slug: a.slug,
        name: `${a.nombre} ${a.apellido}`.trim(),
        photo_url: a.foto_url || a.avatar_url,
        url: utils.buildUrl(`/asesores/${a.slug}`, language, trackingString)
      })),
      projects: []
    },
    quickStats: {
      total_properties: quickStats.total_properties,
      for_sale: quickStats.for_sale,
      for_rent: quickStats.for_rent,
      new_this_month: quickStats.new_this_month
    },
    advisors: advisors.map((a: any) => ({
      id: a.perfil_id || a.usuario_id,
      slug: a.slug,
      name: `${a.nombre} ${a.apellido}`.trim(),
      photo_url: a.foto_url || a.avatar_url,
      titulo_profesional: a.titulo_profesional,
      biografia: a.biografia,
      properties_count: parseInt(a.propiedades_count || '0', 10),
      experiencia_anos: a.experiencia_anos,
      especialidades: a.especialidades,
      destacado: a.destacado,
      url: utils.buildUrl(`/asesores/${a.slug}`, language, trackingString)
    })),
    // Datos de ubicaciones enriquecidos (mismo formato que /ubicaciones)
    locations: {
      cities: locationStats.cities.slice(0, 8).map((c: any) => ({
        name: c.name,
        slug: c.slug,
        count: parseInt(c.count, 10),
        count_venta: parseInt(c.count_venta || '0', 10),
        count_alquiler: parseInt(c.count_alquiler || '0', 10),
        parent_slug: c.parent_slug || null,
        image: c.image || null
      })),
      sectors: locationStats.sectors.slice(0, 12).map((s: any) => ({
        name: s.name,
        slug: s.slug,
        count: parseInt(s.count, 10),
        count_venta: parseInt(s.count_venta || '0', 10),
        count_alquiler: parseInt(s.count_alquiler || '0', 10),
        parent_slug: s.parent_slug || null,
        image: s.image || null
      })),
      provinces: (locationStats.provinces || []).slice(0, 6).map((p: any) => ({
        name: p.name,
        slug: p.slug,
        count: parseInt(p.count, 10),
        count_venta: parseInt(p.count_venta || '0', 10),
        count_alquiler: parseInt(p.count_alquiler || '0', 10),
        image: p.image || null
      }))
    },
    // Estadísticas por tipo de propiedad (mismo formato que /propiedades)
    propertyTypes: (propertyTypeStats as any[]).map((t: any) => ({
      slug: t.slug,
      type: t.type,           // display_name del tipo
      name: t.type,           // alias para compatibilidad
      count: parseInt(t.count, 10),
      count_venta: parseInt(t.count_venta || '0', 10),
      count_alquiler: parseInt(t.count_alquiler || '0', 10),
      url: utils.buildUrl(`/comprar/${t.slug}`, language, trackingString)
    })),
    // Propiedades destacadas por tipo (top 3 tipos con sus propiedades)
    featuredByType,
    meta: {
      timestamp: new Date().toISOString(),
      source: 'neon_edge_function',
      tenant_id: tenant.id,
      language
    }
  };
}

// ============================================================================
// FUNCIONES DE CONVERSIÓN
// ============================================================================

function toSupabasePropertyFormat(prop: any, language: string, trackingString: string): any {
  const salePrice = prop.precio_venta ? parseFloat(prop.precio_venta) : null;
  const rentalPrice = prop.precio_alquiler ? parseFloat(prop.precio_alquiler) : null;
  // Usar moneda única del schema (no hay moneda_venta/moneda_alquiler separadas)
  // Normalizar para evitar errores con valores inválidos (0, null, undefined, etc.)
  const currency = utils.normalizeCurrency(prop.moneda);
  const operationType = salePrice ? 'venta' : 'alquiler';
  const displayPrice = salePrice || rentalPrice || 0;

  const pricingUnified = {
    display_price: {
      formatted: utils.formatPrice(displayPrice, currency, operationType, language),
      amount: displayPrice,
      currency
    },
    operation_type: operationType,
    ...(salePrice && {
      sale: {
        price: salePrice,
        currency: currency,
        formatted: utils.formatPrice(salePrice, currency, 'venta', language)
      }
    }),
    ...(rentalPrice && {
      rental: {
        price: rentalPrice,
        currency: currency,
        formatted: utils.formatPrice(rentalPrice, currency, 'alquiler', language)
      }
    })
  };

  const mainImage = prop.imagen_principal || '';
  const slugUrl = buildPropertySlugUrl(prop, language);
  const propertyType = formatPropertyType(prop.tipo, language);
  const sectorName = prop.sector || '';
  const cityName = prop.ciudad || '';
  const bedroomsCount = prop.habitaciones || 0;
  const bathroomsCount = prop.banos || 0;
  const builtArea = prop.m2_construccion || prop.area_construida || 0;
  // Código público de referencia (usar codigo_publico si existe, sino codigo, sino generar uno)
  const publicCode = prop.codigo_publico
    ? String(prop.codigo_publico)
    : (prop.codigo || `P-${String(prop.id).substring(0, 6).toUpperCase()}`);

  return {
    // Campos originales del formato Supabase
    id: prop.id,
    code: publicCode,
    name: prop.titulo || 'Propiedad sin nombre',
    description: prop.descripcion || prop.short_description || '',
    agent_id: prop.agente_id || prop.perfil_asesor_id,
    slug_url: slugUrl,
    sale_price: salePrice,
    sale_currency: currency,
    rental_price: rentalPrice,
    rental_currency: currency,
    temp_rental_price: null,
    temp_rental_currency: currency,
    furnished_rental_price: null,
    furnished_rental_currency: currency,
    bedrooms: bedroomsCount,
    bathrooms: bathroomsCount,
    parking_spots: prop.estacionamientos || prop.parking || 0,
    built_area: builtArea,
    land_area: prop.m2_terreno || prop.area_total || null,
    main_image_url: mainImage,
    gallery_images_url: '',
    property_status: prop.estado_propiedad || 'disponible',
    is_project: prop.is_project || false,
    delivery_date: null,
    project_detail_id: null,
    exact_coordinates: null,
    show_exact_location: false,
    property_categories: {
      name: propertyType,
      description: ''
    },
    cities: {
      name: cityName,
      coordinates: null,
      provinces: { name: prop.provincia || '', coordinates: null }
    },
    sectors: {
      name: sectorName,
      coordinates: null
    },
    property_images: mainImage ? [{ url: mainImage, title: 'Imagen Principal', is_main: true, sort_order: 0 }] : [],
    pricing_unified: pricingUnified,
    main_image_optimized: mainImage,
    images_unified: mainImage ? [{ url: mainImage, optimized_url: mainImage, is_main: true, sort_order: 0, position: 0 }] : [],
    images_count: mainImage ? 1 : 0,
    location: {
      address: prop.direccion || '',
      sector: sectorName,
      city: cityName,
      province: prop.provincia
    },

    // ============================================================
    // Campos que espera PropertyCarousel.astro (formato español)
    // ============================================================
    slug: slugUrl,
    titulo: prop.titulo || 'Propiedad sin nombre',
    precio: pricingUnified.display_price.formatted,
    imagen: mainImage,
    imagenes: mainImage ? [mainImage] : [],
    sector: sectorName || cityName || 'Ubicación no especificada',
    habitaciones: bedroomsCount,
    banos: bathroomsCount,
    metros: parseFloat(String(builtArea)) || 0,
    tipo: propertyType,
    destacado: prop.destacado || prop.is_featured || false,
    nuevo: prop.nuevo || false,
    parqueos: prop.estacionamientos || prop.parking || 0,
    url: slugUrl,
    isFormattedByProvider: true
  };
}

function buildPropertySlugUrl(prop: any, language: string): string {
  const operation = prop.precio_venta ? 'comprar' : 'alquilar';
  const category = utils.slugify(prop.tipo || 'propiedad');
  const city = utils.slugify(prop.ciudad || '');
  const sector = utils.slugify(prop.sector || '');
  const slug = prop.slug;

  let url = `/${operation}`;
  if (category) url += `/${category}`;
  if (city) url += `/${city}`;
  if (sector) url += `/${sector}`;
  url += `/${slug}`;

  return utils.buildUrl(url, language);
}

function formatPropertyType(tipo: string, language: string): string {
  const types: Record<string, Record<string, string>> = {
    casa: { es: 'Casa', en: 'House', fr: 'Maison' },
    apartamento: { es: 'Apartamento', en: 'Apartment', fr: 'Appartement' },
    penthouse: { es: 'Penthouse', en: 'Penthouse', fr: 'Penthouse' },
    villa: { es: 'Villa', en: 'Villa', fr: 'Villa' },
    local: { es: 'Local Comercial', en: 'Commercial Space', fr: 'Local Commercial' },
    oficina: { es: 'Oficina', en: 'Office', fr: 'Bureau' },
    terreno: { es: 'Terreno', en: 'Land', fr: 'Terrain' }
  };

  const tipoLower = (tipo || '').toLowerCase();
  return types[tipoLower]?.[language] || types[tipoLower]?.es || tipo || 'Propiedad';
}

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

function buildHomepageSections(
  tenant: TenantConfig,
  featuredProperties: any[],
  testimonials: any[],
  advisors: any[],
  faqs: any[],
  language: string,
  trackingString: string,
  realVideos: any[] = [],
  realArticles: any[] = []
): any[] {
  const sections = [];

  // Hero section - APLANADO (sin wrapper data)
  const heroData = getHeroSection(tenant, language);
  sections.push({
    type: 'hero',
    ...heroData
  });

  // Property carousel - APLANADO
  if (featuredProperties.length > 0) {
    const formattedProperties = featuredProperties.map(p => toSupabasePropertyFormat(p, language, trackingString));
    sections.push({
      type: 'property-carousel',
      title: getTranslatedText('Propiedades Destacadas', 'Featured Properties', 'Propriétés en Vedette', language),
      properties: formattedProperties,
      viewAllUrl: utils.buildUrl('/comprar', language, trackingString)
    });
  }

  // Testimonials - APLANADO (usando formato unificado)
  if (testimonials.length > 0) {
    sections.push({
      type: 'testimonials',
      title: getTranslatedText('Lo que dicen nuestros clientes', 'What our clients say', 'Ce que disent nos clients', language),
      testimonials: utils.formatTestimonials(testimonials, language, { trackingString }),
      countryContext: {
        averageRating: 4.9
      }
    });
  }

  // Advisors - APLANADO con campos adicionales que espera el frontend
  if (advisors.length > 0) {
    sections.push({
      type: 'advisors',
      title: getTranslatedText('Nuestro Equipo', 'Our Team', 'Notre Équipe', language),
      advisors: advisors.map((a: any) => {
        const yearsExp = parseInt(a.experiencia_anos || '0', 10);
        const totalSales = parseInt(a.ventas_totales || '0', 10);
        const satisfaction = parseFloat(a.satisfaccion_cliente || '4.8');
        const propsCount = parseInt(a.propiedades_count || '0', 10);

        return {
          id: a.id || a.perfil_id || a.usuario_id,
          slug: a.slug,
          name: `${a.nombre || ''} ${a.apellido || ''}`.trim() || 'Asesor',
          avatar: a.foto_url || a.avatar_url || null,
          bio: a.biografia || '',
          description: a.biografia || '',
          position: a.titulo_profesional || getTranslatedText('Asesor Inmobiliario', 'Real Estate Advisor', 'Conseiller Immobilier', language),
          // Stats como objeto (lo que usa HomepageLayout)
          stats: {
            yearsExperience: yearsExp,
            totalSales: totalSales,
            clientSatisfaction: satisfaction,
            propertiesCount: propsCount
          },
          // También como campos directos (por compatibilidad)
          yearsExperience: yearsExp,
          totalSales: totalSales,
          clientSatisfaction: satisfaction,
          properties_count: propsCount,
          languages: a.idiomas ? (Array.isArray(a.idiomas) ? a.idiomas : [a.idiomas]) : ['Español'],
          phone: a.telefono,
          whatsapp: a.whatsapp || a.telefono,
          url: utils.buildUrl(`/asesores/${a.slug}`, language, trackingString)
        };
      })
    });
  }

  // Content Mix - Videos y Artículos reales de la base de datos
  // Formato compatible con VideoGallery.astro
  const formattedVideos = realVideos.slice(0, 6).map((v: any) => ({
    id: v.id,
    title: v.title,
    description: stripHtml(v.description),  // Limpiar HTML de la descripción
    thumbnail: v.thumbnail,
    videoId: v.videoId,           // VideoGallery espera videoId
    videoSlug: v.slug,            // VideoGallery espera videoSlug
    duration: v.durationFormatted || v.duration || '0:00',
    views: v.views || 0,
    category: v.category?.name || v.categoryName || 'General',  // VideoGallery espera category
    url: v.url,
    featured: v.featured || false,
    total_weight: v.total_weight || 0,
    content_priority: v.content_priority || 'default',
    sort_order: v.sort_order || 0
  }));

  // Formato compatible con RelatedArticles.astro
  const fallbackAvatar = tenant.branding?.isotipo_url || tenant.branding?.logo_url || '/images/team/clic-experts.jpg';
  const formattedArticles = realArticles.slice(0, 6).map((a: any) => ({
    id: a.id,
    slug: a.slug,
    url: a.url,
    title: a.title,
    excerpt: a.excerpt || '',
    featuredImage: a.featuredImage || a.image || null,  // RelatedArticles espera featuredImage
    author: {                                            // RelatedArticles espera objeto author
      name: a.author?.name || 'Equipo CLIC',
      avatar: a.author?.avatar || fallbackAvatar
    },
    publishedAt: a.publishedAt || new Date().toISOString(),  // RelatedArticles espera publishedAt
    readTime: a.readTime || a.read_time || '5 min',          // RelatedArticles espera readTime
    category: a.category?.name || a.categoryName || 'General',
    views: a.views || 0,
    featured: a.featured || false,
    total_weight: a.total_weight || 0,
    content_priority: a.content_priority || 'default',
    sort_order: a.sort_order || 0
  }));

  sections.push({
    type: 'content-mix',
    videos: formattedVideos.length > 0 ? formattedVideos : getDefaultVideos(language),
    articles: formattedArticles.length > 0 ? formattedArticles : getDefaultArticles(language, tenant)
  });

  // Founder Story - Datos de René Castillo (hardcodeados)
  sections.push({
    type: 'founder-story',
    founder: {
      name: 'René Castillo',
      title: getTranslatedText('Fundador y Presentador de TV', 'Founder and TV Host', 'Fondateur et Présentateur TV', language),
      bio: getTranslatedText(
        'René Castillo se ha posicionado como el presentador inmobiliario más reconocido de República Dominicana, llevando a los televidentes dentro de las casas más exclusivas de celebridades y figuras públicas del país. Con 18 años de experiencia televisiva, 600K+ seguidores en redes sociales y un canal de YouTube con 200K+ suscriptores y millones de visualizaciones.',
        'René Castillo has positioned himself as the most recognized real estate host in the Dominican Republic, taking viewers inside the most exclusive homes of celebrities and public figures. With 18 years of television experience, 600K+ social media followers and a YouTube channel with 200K+ subscribers and millions of views.',
        'René Castillo s\'est positionné comme le présentateur immobilier le plus reconnu en République Dominicaine, emmenant les téléspectateurs dans les maisons les plus exclusives des célébrités et des personnalités publiques. Avec 18 ans d\'expérience télévisuelle, 600K+ abonnés sur les réseaux sociaux et une chaîne YouTube avec 200K+ abonnés et des millions de vues.',
        language
      ),
      image: 'https://pacewqgypevfgjmdsorz.supabase.co/storage/v1/object/public/public-assets/images/rene%20castillo%20-clic%20con%20placa.png',
      stats: {
        yearsTV: 18,
        followers: '600K+',
        youtubeSubscribers: '200K+'
      },
      social: {
        youtube: 'https://www.youtube.com/@ReneCastilloTV',
        instagram: 'https://www.instagram.com/renecastillotv/',
        tiktok: 'https://www.tiktok.com/@renecastillotv',
        facebook: 'https://www.facebook.com/renecastillotv'
      }
    },
    recentContent: {
      videos: formattedVideos.length > 0 ? formattedVideos : getDefaultVideos(language),
      articles: formattedArticles.length > 0 ? formattedArticles : getDefaultArticles(language, tenant)
    }
  });

  // FAQs - APLANADO
  if (faqs.length > 0) {
    sections.push({
      type: 'faq',
      title: getTranslatedText('Preguntas Frecuentes', 'Frequently Asked Questions', 'Questions Fréquentes', language),
      faqs: faqs.map(f => ({
        question: f.question,
        answer: f.answer,
        category: f.category
      }))
    });
  }

  return sections;
}

// Videos por defecto (hardcodeados)
function getDefaultVideos(language: string): any[] {
  return [
    {
      id: 'video-1',
      title: getTranslatedText('Tour por Casa de Lujo en Punta Cana', 'Luxury Home Tour in Punta Cana', 'Visite d\'une Maison de Luxe à Punta Cana', language),
      thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
      youtube_id: 'dQw4w9WgXcQ',
      duration: '12:45',
      views: 150000,
      published_at: '2024-01-15'
    },
    {
      id: 'video-2',
      title: getTranslatedText('Inversión en República Dominicana 2024', 'Investment in Dominican Republic 2024', 'Investissement en République Dominicaine 2024', language),
      thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
      youtube_id: 'dQw4w9WgXcQ',
      duration: '18:30',
      views: 98000,
      published_at: '2024-02-20'
    },
    {
      id: 'video-3',
      title: getTranslatedText('Casa de Celebridad en Santo Domingo', 'Celebrity Home in Santo Domingo', 'Maison de Célébrité à Saint-Domingue', language),
      thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
      youtube_id: 'dQw4w9WgXcQ',
      duration: '22:10',
      views: 250000,
      published_at: '2024-03-10'
    }
  ];
}

// Artículos por defecto (hardcodeados)
function getDefaultArticles(language: string, tenant?: TenantConfig): any[] {
  const fallbackAvatar = tenant?.branding?.isotipo_url || tenant?.branding?.logo_url || '/images/team/clic-experts.jpg';
  const teamName = getTranslatedText('Equipo CLIC', 'CLIC Team', 'Équipe CLIC', language);

  return [
    {
      id: 'article-1',
      title: getTranslatedText('Guía Completa para Invertir en Bienes Raíces en RD', 'Complete Guide to Real Estate Investment in DR', 'Guide Complet pour Investir dans l\'Immobilier en RD', language),
      excerpt: getTranslatedText(
        'Todo lo que necesitas saber sobre el mercado inmobiliario dominicano y las mejores oportunidades de inversión.',
        'Everything you need to know about the Dominican real estate market and the best investment opportunities.',
        'Tout ce que vous devez savoir sur le marché immobilier dominicain et les meilleures opportunités d\'investissement.',
        language
      ),
      image: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800&h=600&fit=crop',
      slug: 'guia-inversion-bienes-raices-rd',
      category: getTranslatedText('Inversión', 'Investment', 'Investissement', language),
      published_at: '2024-01-10',
      author: 'René Castillo',
      author_avatar: 'https://pacewqgypevfgjmdsorz.supabase.co/storage/v1/object/public/public-assets/images/rene%20castillo%20-clic%20con%20placa.png'
    },
    {
      id: 'article-2',
      title: getTranslatedText('Las Mejores Zonas para Vivir en Santo Domingo', 'Best Areas to Live in Santo Domingo', 'Les Meilleurs Quartiers pour Vivre à Saint-Domingue', language),
      excerpt: getTranslatedText(
        'Descubre los sectores más exclusivos y seguros de la capital dominicana para establecer tu hogar.',
        'Discover the most exclusive and safe sectors of the Dominican capital to establish your home.',
        'Découvrez les secteurs les plus exclusifs et sûrs de la capitale dominicaine pour établir votre maison.',
        language
      ),
      image: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&h=600&fit=crop',
      slug: 'mejores-zonas-santo-domingo',
      category: getTranslatedText('Guías', 'Guides', 'Guides', language),
      published_at: '2024-02-05',
      author: teamName,
      author_avatar: fallbackAvatar
    }
  ];
}

function getHeroSection(tenant: TenantConfig, language: string): any {
  const titles = {
    es: `${tenant.name} - Bienes Raíces Premium`,
    en: `${tenant.name} - Premium Real Estate`,
    fr: `${tenant.name} - Immobilier Premium`
  };

  const taglines = {
    es: 'Tu próximo hogar te espera',
    en: 'Your next home awaits',
    fr: 'Votre prochaine maison vous attend'
  };

  const subtitles = {
    es: 'Explora nuestra selección de propiedades exclusivas en República Dominicana. Casas, apartamentos, villas y más con asesoría personalizada.',
    en: 'Explore our selection of exclusive properties in the Dominican Republic. Houses, apartments, villas and more with personalized advice.',
    fr: 'Explorez notre sélection de propriétés exclusives en République Dominicaine. Maisons, appartements, villas et plus avec des conseils personnalisés.'
  };

  return {
    title: titles[language as keyof typeof titles] || titles.es,
    tagline: taglines[language as keyof typeof taglines] || taglines.es,
    subtitle: subtitles[language as keyof typeof subtitles] || subtitles.es,
    backgroundImage: 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=1920&h=1080&fit=crop&auto=format&q=80',
    overlayOpacity: 0.5,
    showSearch: true
  };
}

function buildSearchTags(popularLocations: { cities: any[]; sectors: any[] }, language: string): any {
  const propertyTypes = [
    { id: 1, slug: 'casa', name: language === 'en' ? 'House' : 'Casa' },
    { id: 2, slug: 'apartamento', name: language === 'en' ? 'Apartment' : 'Apartamento' },
    { id: 3, slug: 'local', name: language === 'en' ? 'Commercial' : 'Local' },
    { id: 4, slug: 'terreno', name: language === 'en' ? 'Land' : 'Terreno' },
    { id: 5, slug: 'oficina', name: language === 'en' ? 'Office' : 'Oficina' },
    { id: 6, slug: 'penthouse', name: 'Penthouse' },
    { id: 7, slug: 'villa', name: 'Villa' }
  ];

  return {
    tags: {
      tipo: propertyTypes,
      ciudad: popularLocations.cities.map((c: any, index: number) => ({
        id: index + 1,
        slug: c.slug,
        name: c.name
      })),
      sector: popularLocations.sectors.map((s: any, index: number) => ({
        id: index + 1,
        slug: s.slug,
        name: s.name
      }))
    },
    locationHierarchy: [],
    currencies: {
      available: ['USD', 'DOP'],
      default: 'USD'
    }
  };
}

function getTranslatedText(es: string, en: string, fr: string, language: string): string {
  switch (language) {
    case 'en': return en;
    case 'fr': return fr;
    default: return es;
  }
}

function generateHomepageSEO(tenant: TenantConfig, language: string): any {
  const titles = {
    es: `${tenant.name} - Bienes Raíces y Propiedades en República Dominicana`,
    en: `${tenant.name} - Real Estate and Properties in Dominican Republic`,
    fr: `${tenant.name} - Immobilier et Propriétés en République Dominicaine`
  };

  const descriptions = {
    es: `Encuentra tu hogar ideal con ${tenant.name}. Amplia selección de propiedades en venta y alquiler en República Dominicana. Asesores expertos a tu servicio con más de 18 años de experiencia.`,
    en: `Find your ideal home with ${tenant.name}. Wide selection of properties for sale and rent in the Dominican Republic. Expert advisors at your service with over 18 years of experience.`,
    fr: `Trouvez votre maison idéale avec ${tenant.name}. Large sélection de propriétés à vendre et à louer en République Dominicaine. Des conseillers experts à votre service avec plus de 18 ans d'expérience.`
  };

  const title = titles[language as keyof typeof titles] || titles.es;
  const description = descriptions[language as keyof typeof descriptions] || descriptions.es;

  // URLs relativas para hreflang - el dominio lo maneja el frontend
  // Esto permite que funcione en cualquier dominio (localhost, clic.do, etc.)
  const canonicalPath = language === 'es' ? '/' : `/${language}`;

  return {
    title,
    description,
    h1: title,
    keywords: 'bienes raíces, propiedades, casas, apartamentos, venta, alquiler, inmobiliaria, República Dominicana, Punta Cana, Santo Domingo',
    canonical_url: canonicalPath,
    open_graph: {
      title,
      description,
      type: 'website',
      url: canonicalPath,
      site_name: tenant.name,
      locale: language === 'es' ? 'es_DO' : language === 'en' ? 'en_US' : 'fr_FR',
      image: 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=1200&h=630&fit=crop&auto=format&q=80'
    },
    twitter_card: {
      card: 'summary_large_image',
      site: '@clic.do',
      creator: '@renecastillotv',
      title,
      description,
      image: 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=1200&h=630&fit=crop&auto=format&q=80'
    },
    additional_meta_tags: {
      author: 'René Castillo - CLIC Real Estate',
      publisher: tenant.name,
      robots: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
    },
    // URLs relativas para cambio de idioma (funciona en cualquier dominio)
    hreflang: {
      es: '/',
      en: '/en',
      fr: '/fr',
      'x-default': '/'
    },
    structured_data: {
      '@context': 'https://schema.org',
      '@type': 'RealEstateAgent',
      name: tenant.name,
      description,
      url: canonicalPath
    }
  };
}

export default {
  handleHomepage
};
