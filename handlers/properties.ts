// api/handlers/properties.ts
// Handler para propiedades - lista y detalle individual
// Formato compatible con Supabase Edge Functions para el frontend existente

import db from '../lib/db';
import utils from '../lib/utils';
import type { TenantConfig } from '../types';

// ============================================================================
// UTILIDADES
// ============================================================================

// Formatear duración de video de segundos a "MM:SS" o "H:MM:SS"
function formatVideoDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '';

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Normalizar URL de red social a URL completa
function normalizeSocialUrl(value: string | null | undefined, platform: string): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  // Si ya es una URL completa válida, devolverla
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  // Quitar @ inicial si existe (común en usernames)
  const cleanValue = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;

  // Construir URL completa según la plataforma
  const baseUrls: Record<string, string> = {
    facebook: 'https://facebook.com/',
    instagram: 'https://instagram.com/',
    linkedin: 'https://linkedin.com/in/',
    twitter: 'https://twitter.com/',
    youtube: 'https://youtube.com/',
    tiktok: 'https://tiktok.com/@'
  };

  const baseUrl = baseUrls[platform.toLowerCase()];
  if (!baseUrl) return trimmed; // Plataforma desconocida, devolver valor tal cual

  return `${baseUrl}${cleanValue}`;
}

// Formatear objeto de redes sociales a URLs completas
function formatSocialUrls(socialNetworks: Record<string, string> | null | undefined): {
  facebook_url: string | null;
  instagram_url: string | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  youtube_url: string | null;
} {
  const networks = socialNetworks || {};
  return {
    facebook_url: normalizeSocialUrl(networks.facebook, 'facebook'),
    instagram_url: normalizeSocialUrl(networks.instagram, 'instagram'),
    linkedin_url: normalizeSocialUrl(networks.linkedin, 'linkedin'),
    twitter_url: normalizeSocialUrl(networks.twitter, 'twitter'),
    youtube_url: normalizeSocialUrl(networks.youtube, 'youtube')
  };
}

// Extraer código de referido del trackingString (ref=CODIGO)
function extractRefCode(trackingString: string): string | null {
  if (!trackingString) return null;
  const match = trackingString.match(/[?&]ref=([^&]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
}

// Formatear datos de asesor a estructura del frontend
function formatAdvisorData(advisor: any, source: string = 'captador'): any {
  if (!advisor) return null;

  const socialNetworks = advisor.redes_sociales || {};
  const socialUrls = formatSocialUrls(socialNetworks);

  return {
    id: advisor.usuario_id,
    user_id: advisor.usuario_id,
    profile_id: advisor.perfil_id || null,
    name: `${advisor.nombre || ''} ${advisor.apellido || ''}`.trim() || 'Asesor',
    first_name: advisor.nombre || '',
    last_name: advisor.apellido || '',
    phone: advisor.telefono_directo || advisor.telefono || '',
    whatsapp: advisor.whatsapp || advisor.telefono || '',
    email: advisor.email || '',
    position: advisor.titulo_profesional || 'Asesor Inmobiliario',
    profile_photo_url: advisor.foto_url || advisor.avatar_url || '',
    image: advisor.foto_url || advisor.avatar_url || '',
    rating: 4.9,
    external_id: advisor.usuario_id,
    code: advisor.codigo || advisor.usuario_id,
    years_experience: advisor.experiencia_anos || 0,
    specialty_description: Array.isArray(advisor.especialidades) && advisor.especialidades.length > 0
      ? advisor.especialidades[0]
      : '',
    specialties: advisor.especialidades || [],
    languages: advisor.idiomas || ['Español'],
    biography: advisor.biografia || '',
    slug: advisor.slug || '',
    url: advisor.slug ? `/asesores/${advisor.slug}` : null,
    ...socialUrls,
    whatsapp_url: advisor.whatsapp ? `https://wa.me/${advisor.whatsapp.replace(/[^\d]/g, '')}` : null,
    social: socialNetworks,
    active: true,
    show_on_website: true,
    source // 'ref', 'captador', 'cocaptador', 'default', 'company'
  };
}

// Crear fallback de empresa cuando no hay asesor disponible
function createCompanyFallback(tenant: TenantConfig): any {
  // Usar isotipo como avatar (mejor para foto de perfil), fallback a logo
  const avatarUrl = tenant.branding?.isotipo_url || tenant.branding?.logo_url || '';
  // Formatear teléfono para WhatsApp (quitar caracteres no numéricos)
  const whatsappNumber = tenant.contact?.whatsapp || tenant.contact?.phone || '';
  const whatsappClean = whatsappNumber.replace(/[^\d]/g, '');
  // Normalizar URLs de redes sociales
  const socialUrls = formatSocialUrls(tenant.social);

  return {
    id: 'company-fallback',
    user_id: null,
    profile_id: null,
    name: 'Equipo de Asistencia',
    first_name: 'Equipo de',
    last_name: 'Asistencia',
    phone: tenant.contact?.phone || '',
    whatsapp: whatsappNumber,
    email: tenant.contact?.email || '',
    position: 'Atención al Cliente',
    profile_photo_url: avatarUrl,
    image: avatarUrl,
    rating: 5.0,
    external_id: 'company',
    code: 'CLIC',
    years_experience: 0,
    specialty_description: '',
    specialties: [],
    languages: ['Español', 'Inglés'],
    biography: '',
    slug: '',
    url: '/contacto',
    ...socialUrls,
    whatsapp_url: whatsappClean ? `https://wa.me/${whatsappClean}` : null,
    social: tenant.social || {},
    active: true,
    show_on_website: true,
    source: 'company'
  };
}

// ============================================================================
// TIPOS COMPATIBLES CON SUPABASE
// ============================================================================

interface PricingUnified {
  display_price: {
    formatted: string;
    amount: number;
    currency: string;
  };
  operation_type: string;
  sale?: { price: number; currency: string; formatted: string };
  rental?: { price: number; currency: string; formatted: string };
}

interface ImagesUnified {
  url: string;
  optimized_url: string;
  is_main: boolean;
  sort_order: number;
  title?: string;
  position?: number;
}

interface PropertyForList {
  id: string;
  code: number | string;
  name: string;
  description: string;
  agent_id?: string;
  slug_url: string;
  sale_price: number | null;
  sale_currency: string;
  rental_price: number | null;
  rental_currency: string;
  temp_rental_price: number | null;
  temp_rental_currency: string;
  furnished_rental_price: number | null;
  furnished_rental_currency: string;
  bedrooms: number;
  bathrooms: number;
  parking_spots: number;
  built_area: number | null;
  land_area: number | null;
  main_image_url: string;
  gallery_images_url: string;
  property_status: string;
  is_project: boolean;
  delivery_date: string | null;
  project_detail_id: string | null;
  exact_coordinates: string | null;
  show_exact_location: boolean;
  property_categories: { name: string; description?: string };
  cities: {
    name: string;
    coordinates: string | null;
    provinces?: { name: string; coordinates: string | null };
  };
  sectors: { name: string; coordinates: string | null };
  property_images: Array<{ url: string; title?: string; is_main: boolean; sort_order: number }>;
  pricing_unified: PricingUnified;
  main_image_optimized?: string;
  images_unified: ImagesUnified[];
  images_count: number;
  location?: any;
  projectDetails?: any;
  agent?: any;
}

interface Tag {
  id: string;
  slug: string;
  name: string;
  display_name: string;
  category: string;
  description?: string;
}

interface Breadcrumb {
  name: string;
  slug?: string;
  url: string;
  category?: string;
  is_active?: boolean;
  is_current_page?: boolean;
  position?: number;
}

// ============================================================================
// HANDLER: Lista de Propiedades (Formato Supabase)
// ============================================================================

export async function handlePropertyList(options: {
  tenant: TenantConfig;
  tags: string[];
  language: string;
  trackingString: string;
  page: number;
  limit: number;
  searchParams: URLSearchParams;
  pathname: string;
}): Promise<any> {
  const { tenant, tags, language, trackingString, page, limit, searchParams, pathname } = options;

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

  // Convertir a formato Supabase
  const properties: PropertyForList[] = rawProperties.map(prop =>
    toSupabasePropertyFormat(prop, language, trackingString)
  );

  // Construir tags desde filtros activos
  const searchTags = buildSearchTags(tags, filters, language);

  // Generar breadcrumbs
  const breadcrumbs = generateBreadcrumbs(tags, filters, language);

  // Generar SEO con hreflang
  const seo = generateListSEO(filters, language, tenant, pagination.total_items, pathname);

  // Obtener contenido relacionado y opciones de filtros en paralelo
  const [faqs, testimonials, filterOptions, popularLocations] = await Promise.all([
    db.getFAQs({ tenantId: tenant.id, limit: 8 }),
    db.getTestimonials(tenant.id, 5),
    db.getFilterOptions(tenant.id),
    db.getPopularLocations(tenant.id)
  ]);

  // Respuesta en formato Supabase - incluye campos a nivel raíz para compatibilidad con frontend
  return {
    type: 'property-list',
    available: true,
    // Campos a nivel raíz para compatibilidad con PropertyListLayout
    properties,
    totalProperties: pagination.total_items,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total_properties: pagination.total_items,
      total_pages: pagination.total_pages,
      has_next_page: pagination.has_next,
      has_prev_page: pagination.has_prev
    },
    tags: searchTags,
    // searchResults también para compatibilidad con Supabase format
    searchResults: {
      properties,
      tags: searchTags,
      searchTerms: tags,
      pagination: {
        currentPage: pagination.page,
        totalCount: pagination.total_items,
        itemsPerPage: pagination.limit,
        totalPages: pagination.total_pages,
        hasMore: pagination.has_next,
        hasNextPage: pagination.has_next,
        hasPreviousPage: pagination.has_prev
      }
    },
    relatedContent: {
      articles: [],
      videos: [],
      testimonials: utils.formatTestimonials(testimonials, language, { trackingString }),
      faqs: faqs.map(f => ({
        id: f.id,
        question: f.question,
        answer: f.answer,
        category: f.category,
        order: f.order
      })),
      seo_content: [],
      content_source: 'neon_db',
      hierarchy_info: {
        specific_count: 0,
        tag_related_count: faqs.length + testimonials.length,
        default_count: 0
      }
    },
    // hotItems para PopularLocations component
    hotItems: {
      cities: popularLocations.cities.map((c: any) => ({
        slug: c.slug,
        title: c.name,
        url: utils.buildUrl(`/comprar/${c.slug}`, language, trackingString),
        count: parseInt(c.count, 10)
      })),
      sectors: popularLocations.sectors.map((s: any) => ({
        slug: s.slug,
        title: s.name,
        url: utils.buildUrl(`/comprar/${s.slug}`, language, trackingString),
        count: parseInt(s.count, 10)
      })),
      properties: properties.slice(0, 6),
      agents: [],
      projects: []
    },
    referralAgent: null,
    breadcrumbs,
    seo,
    // Opciones de filtros para FilterModal
    searchTags: filterOptions,
    countryInfo: {
      code: tenant.regional?.country_code || 'DO',
      name: 'República Dominicana',
      currency: tenant.regional?.currency_default || 'USD'
    },
    meta: {
      timestamp: new Date().toISOString(),
      source: 'neon_edge_function',
      tenant_id: tenant.id,
      language,
      filters_applied: Object.keys(filters).length > 0
    }
  };
}

// ============================================================================
// HANDLER: Propiedad Individual (Formato Supabase)
// ============================================================================

export async function handleSingleProperty(options: {
  tenant: TenantConfig;
  propertySlug: string;
  language: string;
  trackingString: string;
}): Promise<any | null> {
  const { tenant, propertySlug, language, trackingString } = options;

  console.log('[handleSingleProperty] Looking for slug:', propertySlug, 'tenant:', tenant.id);

  // Obtener propiedad (busca por slug simple o URL completa)
  const rawProperty = await db.getPropertyBySlug(propertySlug, tenant.id);

  console.log('[handleSingleProperty] Result:', rawProperty ? `Found: ${rawProperty.id}` : 'NOT FOUND');

  if (!rawProperty) {
    return null;
  }

  // Convertir a formato Supabase completo
  const property = toSupabasePropertyFormat(rawProperty, language, trackingString);

  // Parsear amenidades del campo JSON
  let amenityNames: string[] = [];
  if (rawProperty.amenidades) {
    try {
      amenityNames = typeof rawProperty.amenidades === 'string'
        ? JSON.parse(rawProperty.amenidades)
        : rawProperty.amenidades;
    } catch (e) {
      console.warn('Error parsing amenidades:', e);
    }
  }

  // Parsear cocaptadores_ids del campo JSONB
  let cocaptadoresIds: string[] = [];
  if (rawProperty.cocaptadores_ids) {
    try {
      cocaptadoresIds = typeof rawProperty.cocaptadores_ids === 'string'
        ? JSON.parse(rawProperty.cocaptadores_ids)
        : rawProperty.cocaptadores_ids;
    } catch (e) {
      console.warn('Error parsing cocaptadores_ids:', e);
    }
  }

  // Obtener datos relacionados en paralelo
  // Usar captador_id (usuario) para buscar propiedades del agente
  const captadorId = rawProperty.captador_id || rawProperty.captador_usuario_id;
  console.log('[handleSingleProperty] captadorId for agent properties:', captadorId);

  // Extraer código de referido del tracking string (ref=CODIGO)
  const refCode = extractRefCode(trackingString);
  console.log('[handleSingleProperty] Ref code from tracking:', refCode);

  const [similarPropertiesRaw, faqsRaw, testimonialsRaw, recentArticles, recentVideos, amenityDetails, cocaptadoresData, refAdvisor] = await Promise.all([
    db.getSimilarProperties(tenant.id, rawProperty.id, 4),
    db.getFAQs({ tenantId: tenant.id, limit: 6 }),
    db.getTestimonials(tenant.id, 4),
    db.getRecentArticles(tenant.id, 4),
    db.getRecentVideos(tenant.id, 4),
    amenityNames.length > 0 ? db.getAmenityDetails(tenant.id, amenityNames) : Promise.resolve([]),
    cocaptadoresIds.length > 0 ? db.getCocaptadoresData(tenant.id, cocaptadoresIds) : Promise.resolve([]),
    refCode ? db.getAdvisorByCode(tenant.id, refCode) : Promise.resolve(null)
  ]);

  // Type assertions para los resultados de Neon
  const faqs = faqsRaw as any[];
  const testimonials = testimonialsRaw as any[];

  // Procesar amenidades con detalles
  // El frontend espera: { amenities: { name, icon, category } } o { name, icon, category }
  const amenityDetailsArray = amenityDetails as any[];

  console.log('[handleSingleProperty] Amenity names from property:', amenityNames);
  console.log('[handleSingleProperty] Amenity details from DB:', amenityDetailsArray.map((a: any) => ({
    nombre: a.nombre,
    icono: a.icono,
    categoria: a.categoria
  })));

  const processedAmenities = amenityNames.map(name => {
    // Buscar por nombre O por código
    const detail = amenityDetailsArray.find((a: any) =>
      a.nombre === name || a.codigo === name
    );
    // Las traducciones están en el campo JSONB 'traducciones'
    const traducciones = detail?.traducciones || {};
    // Usar el nombre de la tabla amenidades si existe, sino el valor original
    const displayName = detail?.nombre || name;
    const amenityData = {
      name: displayName,
      name_en: traducciones.en?.nombre || traducciones.nombre_en || displayName,
      name_fr: traducciones.fr?.nombre || traducciones.nombre_fr || displayName,
      icon: detail?.icono || 'fas fa-check',
      category: detail?.categoria || 'General'
    };
    // Enviar en ambos formatos para compatibilidad
    return {
      ...amenityData,
      amenities: amenityData
    };
  });

  console.log('[handleSingleProperty] Processed amenities:', processedAmenities.slice(0, 3));

  // Formatear propiedades similares
  const similarPropertiesArray = similarPropertiesRaw as any[];
  const similarProperties = similarPropertiesArray.map((p: any) => {
    // Usar el campo operacion como fuente principal (venta/alquiler)
    const operationType = p.operacion || 'venta';
    // Seleccionar el precio según la operación principal
    const price = operationType === 'venta'
      ? (p.precio_venta || p.precio || 0)
      : (p.precio_alquiler || p.precio || 0);
    const currency = utils.normalizeCurrency(p.moneda);
    const operationDisplay = language === 'en' ? (operationType === 'venta' ? 'Sale' : 'Rent') :
                             language === 'fr' ? (operationType === 'venta' ? 'Vente' : 'Location') :
                             (operationType === 'venta' ? 'Venta' : 'Alquiler');
    return {
      id: p.id,
      title: p.titulo,
      title_display: p.titulo,
      price: utils.formatPrice(price, currency, operationType, language),
      price_display: utils.formatPrice(price, currency, operationType, language),
      operation_display: operationDisplay,
      bedrooms: p.habitaciones || 0,
      bathrooms: p.banos || 0,
      area: p.m2_construccion || 0,
      built_area: p.m2_construccion || 0,
      // Incluir ambos campos para compatibilidad con el frontend
      image: p.imagen_principal || '',
      main_image_url: p.imagen_principal || '',
      location: `${p.sector || ''}, ${p.ciudad || ''}`.replace(/^, |, $/g, '') || 'Ubicación no especificada',
      location_display: `${p.sector || ''}, ${p.ciudad || ''}`.replace(/^, |, $/g, '') || '',
      type: p.tipo || 'Propiedad',
      category_display: p.tipo || 'Propiedad',
      url: `/${p.slug}`,
      is_project: p.is_project || false
    };
  });

  // Formatear artículos recientes
  const recentArticlesArray = recentArticles as any[];
  const formattedArticles = recentArticlesArray.map((a: any) => ({
    id: a.id,
    title: a.titulo,
    slug: a.slug,
    excerpt: a.descripcion?.substring(0, 150) + '...' || '',
    image: a.imagen || '',
    category: a.categoria_nombre || '',
    category_slug: a.categoria_slug || '',
    url: `/articulos/${a.categoria_slug || 'general'}/${a.slug}`
  }));

  // Formatear videos recientes
  // El frontend requiere video.title - video_id es opcional (algunos videos no lo tienen)
  const recentVideosArray = recentVideos as any[];
  const formattedVideos = recentVideosArray
    .filter((v: any) => v.titulo) // Solo requerir título, video_id es opcional
    .map((v: any) => ({
      id: v.id,
      title: v.titulo,
      slug: v.slug,
      slug_url: v.slug,
      description: v.descripcion?.substring(0, 100) + '...' || '',
      // Si tiene video_id usar thumbnail de YouTube, sino usar el thumbnail guardado o placeholder
      thumbnail: v.thumbnail || (v.video_id ? `https://img.youtube.com/vi/${v.video_id}/hqdefault.jpg` : ''),
      video_id: v.video_id || null,
      video_url: v.video_url || null, // Incluir video_url como alternativa
      // Formatear duración de segundos a "MM:SS" o "HH:MM:SS"
      duration: formatVideoDuration(v.duracion_segundos),
      views: v.vistas || 0,
      category: v.categoria_nombre || 'Video',
      category_name: v.categoria_nombre || 'Video', // Campo que espera el frontend
      category_slug: v.categoria_slug || 'general',
      url: `/videos/${v.categoria_slug || 'general'}/${v.slug}`,
      featured: v.destacado === true || v.destacado === 1, // Usar el campo destacado de la DB
      relation_type: 'tags' // Para que el frontend los muestre como relacionados
    }));

  console.log('[handleSingleProperty] Videos found:', formattedVideos.length);

  // ============================================================================
  // SISTEMA DE FALLBACK PARA ASESOR CON PRIORIDADES
  // Prioridad 0: ref code (máxima)
  // Prioridad 1: captador
  // Prioridad 2: cocaptador
  // Prioridad 3: empresa (fallback final)
  //
  // Cada nivel debe cumplir las 3 condiciones: activo + visible_en_web + usuario_activo
  // Si no cumple, se pasa al siguiente nivel de prioridad
  // ============================================================================

  // Helper: Validar si un asesor cumple las 3 condiciones requeridas
  const isAdvisorQualified = (activo: any, visibleEnWeb: any, usuarioActivo: any): boolean => {
    const isActivo = activo === true;
    const isVisible = visibleEnWeb === true || visibleEnWeb === null; // null = visible por defecto
    const isUsuarioActivo = usuarioActivo === true;
    return isActivo && isVisible && isUsuarioActivo;
  };

  let agentMain: any = null;
  let agentSource = 'none';
  let agentIdForProperties: string | null = null;
  const cocaptadoresArray = cocaptadoresData as any[];

  // =====================
  // PRIORIDAD 0: REF CODE
  // =====================
  // refAdvisor ya viene validado desde getAdvisorByCode (activo + visible_en_web + usuario_activo)
  if (refAdvisor) {
    console.log('[handleSingleProperty] Priority 0 - REF advisor QUALIFIED:', refAdvisor.codigo);
    agentMain = formatAdvisorData(refAdvisor, 'ref');
    agentSource = 'ref';
    agentIdForProperties = refAdvisor.usuario_id;
  }

  // ===================
  // PRIORIDAD 1: CAPTADOR
  // ===================
  if (!agentMain && captadorId && rawProperty.agente_nombre) {
    const captadorQualified = isAdvisorQualified(
      rawProperty.agente_activo,
      rawProperty.agente_visible_en_web,
      rawProperty.agente_usuario_activo
    );

    console.log('[handleSingleProperty] Priority 1 - CAPTADOR check:', {
      captadorId,
      activo: rawProperty.agente_activo,
      visible_en_web: rawProperty.agente_visible_en_web,
      usuario_activo: rawProperty.agente_usuario_activo,
      qualified: captadorQualified
    });

    if (captadorQualified) {
      const socialNetworks = rawProperty.agente_redes_sociales || {};
      const socialUrls = formatSocialUrls(socialNetworks);
      agentMain = {
        id: captadorId,
        user_id: rawProperty.captador_usuario_id || captadorId,
        profile_id: rawProperty.perfil_asesor_id || null,
        name: `${rawProperty.agente_nombre || ''} ${rawProperty.agente_apellido || ''}`.trim() || 'Asesor',
        first_name: rawProperty.agente_nombre || '',
        last_name: rawProperty.agente_apellido || '',
        phone: rawProperty.agente_telefono_directo || rawProperty.agente_telefono || '',
        whatsapp: rawProperty.agente_whatsapp || rawProperty.agente_telefono || '',
        email: rawProperty.agente_email || '',
        position: rawProperty.agente_titulo || 'Asesor Inmobiliario',
        profile_photo_url: rawProperty.agente_foto_url || rawProperty.agente_avatar || '',
        image: rawProperty.agente_foto_url || rawProperty.agente_avatar || '',
        rating: 4.9,
        external_id: captadorId,
        code: captadorId,
        years_experience: rawProperty.agente_experiencia_anos || 0,
        specialty_description: Array.isArray(rawProperty.agente_especialidades) && rawProperty.agente_especialidades.length > 0
          ? rawProperty.agente_especialidades[0]
          : '',
        specialties: rawProperty.agente_especialidades || [],
        languages: rawProperty.agente_idiomas || ['Español'],
        biography: rawProperty.agente_biografia || '',
        slug: rawProperty.agente_slug || '',
        url: rawProperty.agente_slug ? `/asesores/${rawProperty.agente_slug}` : null,
        ...socialUrls,
        whatsapp_url: rawProperty.agente_whatsapp ? `https://wa.me/${rawProperty.agente_whatsapp.replace(/[^\d]/g, '')}` : null,
        social: socialNetworks,
        active: true,
        show_on_website: true,
        source: 'captador'
      };
      agentSource = 'captador';
      agentIdForProperties = captadorId;
      console.log('[handleSingleProperty] Priority 1 - Using CAPTADOR:', agentMain.name);
    } else {
      console.log('[handleSingleProperty] Priority 1 - CAPTADOR not qualified, checking next priority');
    }
  }

  // =====================
  // PRIORIDAD 2: COCAPTADOR
  // =====================
  if (!agentMain && cocaptadoresArray.length > 0) {
    // Buscar el primer cocaptador que cumpla las 3 condiciones
    const qualifiedCocaptador = cocaptadoresArray.find((c: any) => {
      const qualified = isAdvisorQualified(c.perfil_activo, c.visible_en_web, c.usuario_activo);
      console.log('[handleSingleProperty] Priority 2 - COCAPTADOR check:', {
        nombre: c.nombre,
        perfil_activo: c.perfil_activo,
        visible_en_web: c.visible_en_web,
        usuario_activo: c.usuario_activo,
        qualified
      });
      return qualified;
    });

    if (qualifiedCocaptador) {
      agentMain = formatAdvisorData(qualifiedCocaptador, 'cocaptador');
      agentSource = 'cocaptador';
      agentIdForProperties = qualifiedCocaptador.usuario_id;
      console.log('[handleSingleProperty] Priority 2 - Using COCAPTADOR:', agentMain?.name);
    } else {
      console.log('[handleSingleProperty] Priority 2 - No qualified COCAPTADOR found, checking next priority');
    }
  }

  // =====================
  // PRIORIDAD 3: EMPRESA (FALLBACK FINAL)
  // =====================
  if (!agentMain) {
    agentMain = createCompanyFallback(tenant);
    agentSource = 'company';
    agentIdForProperties = null;
    console.log('[handleSingleProperty] Priority 3 - Using COMPANY FALLBACK (Equipo de Asistencia)');
  }

  // Formatear cocaptadores: solo los que califiquen (3 condiciones) y excluir el que se usó como main
  const formattedCocaptores = cocaptadoresArray
    .filter((c: any) => {
      // Excluir el que ya se usó como agente principal
      if (agentSource === 'cocaptador' && c.usuario_id === agentMain?.id) return false;
      // Solo mostrar cocaptadores que cumplan las 3 condiciones
      return isAdvisorQualified(c.perfil_activo, c.visible_en_web, c.usuario_activo);
    })
    .map((c: any, index: number) => ({
      id: c.usuario_id,
      profile_id: c.perfil_id || null,
      first_name: c.nombre || '',
      last_name: c.apellido || '',
      full_name: `${c.nombre || ''} ${c.apellido || ''}`.trim() || 'Asesor',
      name: `${c.nombre || ''} ${c.apellido || ''}`.trim() || 'Asesor',
      phone: c.telefono_directo || c.telefono || '',
      whatsapp: c.whatsapp || c.telefono || '',
      email: c.email || '',
      position: c.titulo_profesional || 'Asesor Inmobiliario',
      position_display: c.titulo_profesional || 'Asesor Inmobiliario',
      role: 'Cocaptador',
      order_priority: index + 1,
      profile_photo_url: c.foto_url || c.avatar_url || '',
      image: c.foto_url || c.avatar_url || '',
      years_experience: c.experiencia_anos || 0,
      biography: c.biografia || '',
      slug: c.slug || '',
      url: c.slug ? `/asesores/${c.slug}` : null
    }));

  // Obtener propiedades del agente (usa el ID determinado por el sistema de fallback)
  const agentProperties = await getAgentProperties(tenant.id, agentIdForProperties, rawProperty.id, language, trackingString);

  // Formatear propiedades del agente para el carrusel
  const formattedAgentProperties = agentProperties.map((p: any) => ({
    id: p.id,
    title: p.name,
    title_display: p.name || 'Propiedad',
    price: p.pricing_unified?.display_price?.formatted || 'Precio a consultar',
    price_display: p.pricing_unified?.display_price?.formatted || 'Precio a consultar',
    operation_display: p.pricing_unified?.operation_type === 'venta'
      ? (language === 'es' ? 'En Venta' : language === 'en' ? 'For Sale' : 'À Vendre')
      : (language === 'es' ? 'En Alquiler' : language === 'en' ? 'For Rent' : 'À Louer'),
    category_display: p.property_categories?.name || 'Propiedad',
    location_display: `${p.sectors?.name || ''}, ${p.cities?.name || ''}`.replace(/^, |, $/g, '') || 'Ubicación no especificada',
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    built_area: p.built_area,
    parking_spots: p.parking_spots,
    area: p.built_area,
    image: p.main_image_url,
    main_image_url: p.main_image_url,
    location: `${p.sectors?.name || ''}, ${p.cities?.name || ''}`.replace(/^, |, $/g, ''),
    type: p.property_categories?.name,
    url: p.slug_url,
    is_project: p.is_project
  }));

  // Construir estructura agent completa como espera el frontend
  const agent = {
    main: agentMain,
    cocaptors: formattedCocaptores,
    cocaptors_count: formattedCocaptores.length,
    source: agentSource,
    should_show_properties: formattedAgentProperties.length > 0,
    properties_count: formattedAgentProperties.length,
    // Propiedades del agente para el carrusel - estructura esperada por AgentPropertiesCarousel.astro
    properties: formattedAgentProperties
  };

  // Generar breadcrumbs para propiedad individual
  const breadcrumbs = generatePropertyBreadcrumbs(rawProperty, language);

  // Generar SEO
  const seo = generatePropertySEO(rawProperty, language, tenant);

  // Construir location con coordenadas
  const location = buildLocationData(rawProperty);

  // Agregar property_amenities al objeto property para que el frontend lo encuentre
  const propertyWithAmenities = {
    ...property,
    property_amenities: processedAmenities
  };

  // Respuesta en formato Supabase
  return {
    type: rawProperty.is_project ? 'single-property-project' : 'single-property',
    available: rawProperty.estado_propiedad === 'disponible',
    property: propertyWithAmenities,
    location,
    // Detalles del proyecto para ProjectWidget.astro (snake_case para SinglePropertyLayout)
    project_details: rawProperty.is_project ? buildProjectDetails(rawProperty) : null,
    // También en camelCase para compatibilidad legacy
    projectDetails: rawProperty.is_project ? buildProjectDetails(rawProperty) : null,
    // Agente con estructura completa (main + cocaptors) como espera el frontend
    agent,
    // También enviar referralAgent apuntando al main para compatibilidad
    referralAgent: agentMain,
    agentProperties: agentProperties.map(p => ({
      id: p.id,
      title: p.name,
      price: p.pricing_unified?.display_price?.formatted || 'Precio a consultar',
      bedrooms: p.bedrooms,
      bathrooms: p.bathrooms,
      area: p.built_area,
      image: p.main_image_url,
      location: `${p.sectors?.name || ''}, ${p.cities?.name || ''}`.replace(/^, |, $/g, ''),
      type: p.property_categories?.name,
      url: p.slug_url,
      is_project: p.is_project,
      parking_spots: p.parking_spots
    })),
    agentPropertiesInfo: {
      total: agentProperties.length,
      agent_id: captadorId,
      excluded_property: rawProperty.id
    },
    // snake_case para compatibilidad con SinglePropertyLayout.astro
    related_content: {
      articles: formattedArticles,
      videos: formattedVideos,
      testimonials: utils.formatTestimonials(testimonials, language, { trackingString }),
      faqs: faqs.map((f: any) => ({
        id: f.id,
        question: f.question,
        answer: f.answer,
        category: f.category
      })),
      similar_properties: similarProperties,
      seo_content: [],
      content_source: 'neon_db'
    },
    // También mantener camelCase por compatibilidad legacy
    relatedContent: {
      articles: formattedArticles,
      videos: formattedVideos,
      testimonials: utils.formatTestimonials(testimonials, language, { trackingString }),
      faqs: faqs.map((f: any) => ({
        id: f.id,
        question: f.question,
        answer: f.answer,
        category: f.category
      })),
      seo_content: [],
      content_source: 'neon_db',
      hierarchy_info: {
        specific_count: 0,
        tag_related_count: 0,
        default_count: faqs.length + testimonials.length
      }
    },
    // Amenidades procesadas
    property_amenities: processedAmenities,
    breadcrumbs,
    similarProperties: similarProperties,
    similarPropertiesDebug: {
      total_found: similarProperties.length,
      tags_used: 0,
      search_method: 'recent_properties'
    },
    seo,
    meta: {
      timestamp: new Date().toISOString(),
      source: 'neon_edge_function',
      property_id: rawProperty.id,
      tenant_id: tenant.id,
      language
    }
  };
}

// ============================================================================
// FUNCIONES DE CONVERSIÓN
// ============================================================================

function toSupabasePropertyFormat(prop: any, language: string, trackingString: string): PropertyForList {
  const salePrice = prop.precio_venta ? parseFloat(prop.precio_venta) : null;
  const rentalPrice = prop.precio_alquiler ? parseFloat(prop.precio_alquiler) : null;
  const tempRentalPrice = prop.precio_alquiler_temporal ? parseFloat(prop.precio_alquiler_temporal) : null;
  const furnishedRentalPrice = prop.precio_alquiler_amueblado ? parseFloat(prop.precio_alquiler_amueblado) : null;

  // Usar moneda única del schema (no hay moneda_venta/moneda_alquiler separadas)
  // Normalizar para evitar errores con valores inválidos (0, null, undefined, etc.)
  const currency = utils.normalizeCurrency(prop.moneda);
  const operationType = salePrice ? 'venta' : 'alquiler';
  const displayPrice = salePrice || rentalPrice || tempRentalPrice || furnishedRentalPrice || 0;

  // Construir pricing_unified
  const pricingUnified: PricingUnified = {
    display_price: {
      formatted: utils.formatPrice(displayPrice, currency, operationType, language),
      amount: displayPrice,
      currency
    },
    operation_type: operationType
  };

  if (salePrice) {
    pricingUnified.sale = {
      price: salePrice,
      currency: currency,
      formatted: utils.formatPrice(salePrice, currency, 'venta', language)
    };
  }

  if (rentalPrice) {
    pricingUnified.rental = {
      price: rentalPrice,
      currency: currency,
      formatted: utils.formatPrice(rentalPrice, currency, 'alquiler', language)
    };
  }

  // Extraer variables igual que en homepage.ts
  const mainImage = prop.imagen_principal || '';
  const galleryImages = parseGalleryImages(prop.galeria_imagenes || prop.imagenes);
  const allImages = [mainImage, ...galleryImages.filter(img => img !== mainImage)].filter(Boolean);
  const slugUrl = buildPropertySlugUrl(prop, language);
  const propertyType = formatPropertyType(prop.tipo, language);
  const sectorName = prop.sector || '';
  const cityName = prop.ciudad || '';
  const bedroomsCount = prop.habitaciones || 0;
  const bathroomsCount = prop.banos || 0;
  const builtArea = prop.m2_construccion || prop.area_construida || 0;
  const landArea = prop.m2_terreno || prop.area_total || 0;

  // Código público de referencia (usar codigo_publico si existe, sino codigo, sino generar uno)
  const publicCode = prop.codigo_publico
    ? String(prop.codigo_publico)
    : (prop.codigo || `P-${String(prop.id).substring(0, 6).toUpperCase()}`);

  const imagesUnified: ImagesUnified[] = allImages.map((url, index) => ({
    url,
    optimized_url: url,
    is_main: index === 0,
    sort_order: index,
    position: index
  }));

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
    temp_rental_price: tempRentalPrice,
    temp_rental_currency: currency,
    furnished_rental_price: furnishedRentalPrice,
    furnished_rental_currency: currency,
    bedrooms: bedroomsCount,
    bathrooms: bathroomsCount,
    parking_spots: prop.estacionamientos || prop.parking || 0,
    built_area: builtArea,
    land_area: landArea,
    main_image_url: mainImage,
    gallery_images_url: galleryImages.join(','),
    property_status: prop.estado_propiedad || 'disponible',
    is_project: prop.is_project || false,
    delivery_date: prop.fecha_entrega || null,
    project_detail_id: prop.proyecto_id || null,
    // Coordenadas en formato string "(lat,lng)" para el frontend
    exact_coordinates: (prop.latitud && prop.longitud)
      ? `(${prop.latitud},${prop.longitud})`
      : prop.coordenadas || null,
    show_exact_location: prop.mostrar_ubicacion_exacta || false,
    property_categories: {
      name: propertyType,
      description: ''
    },
    cities: {
      name: cityName,
      coordinates: prop.ciudad_coordenadas || null,
      provinces: {
        name: prop.provincia || '',
        coordinates: prop.provincia_coordenadas || null
      }
    },
    sectors: {
      name: sectorName,
      coordinates: prop.sector_coordenadas || null
    },
    property_images: imagesUnified.map(img => ({
      url: img.url,
      title: img.is_main ? 'Imagen Principal' : undefined,
      is_main: img.is_main,
      sort_order: img.sort_order
    })),
    pricing_unified: pricingUnified,
    main_image_optimized: mainImage,
    images_unified: imagesUnified,
    images_count: allImages.length,
    location: {
      address: prop.direccion || '',
      sector: sectorName,
      city: cityName,
      province: prop.provincia
    },

    // ============================================================
    // Campos en español para PropertyList.astro (IGUAL que homepage.ts)
    // ============================================================
    slug: slugUrl,
    titulo: prop.titulo || 'Propiedad sin nombre',
    precio: pricingUnified.display_price.formatted,
    imagen: mainImage,
    imagenes: allImages.length > 0 ? allImages : (mainImage ? [mainImage] : []),
    sector: sectorName || cityName || 'Ubicación no especificada',
    habitaciones: bedroomsCount,
    banos: bathroomsCount,
    metros: parseFloat(String(builtArea)) || 0,
    metros_terreno: parseFloat(String(landArea)) || 0,
    tipo: propertyType,
    destacado: prop.destacado || prop.is_featured || false,
    nuevo: prop.nuevo || false,
    parqueos: prop.estacionamientos || prop.parking || 0,
    url: slugUrl,
    isFormattedByProvider: true,

    // ============================================================
    // Campos _display para SinglePropertyLayout.astro
    // ============================================================
    title_display: prop.titulo || 'Propiedad sin nombre',
    price_display: pricingUnified.display_price.formatted,
    operation_display: language === 'es'
      ? (operationType === 'venta' ? 'En Venta' : 'En Alquiler')
      : language === 'en'
        ? (operationType === 'venta' ? 'For Sale' : 'For Rent')
        : (operationType === 'venta' ? 'À Vendre' : 'À Louer'),
    description_display: prop.descripcion || prop.short_description || '',
    processed_images: {
      final_images: allImages.length > 0 ? allImages : [mainImage || 'https://via.placeholder.com/400x300/e5e7eb/9ca3af?text=Sin+Imagen'],
      main_image: mainImage || 'https://via.placeholder.com/400x300/e5e7eb/9ca3af?text=Sin+Imagen'
    }
  };
}

function parseGalleryImages(gallery: any): string[] {
  if (!gallery) return [];

  if (Array.isArray(gallery)) {
    return gallery.filter(img => typeof img === 'string' && img.trim());
  }

  if (typeof gallery === 'string') {
    try {
      const parsed = JSON.parse(gallery);
      if (Array.isArray(parsed)) {
        return parsed.filter(img => typeof img === 'string' && img.trim());
      }
    } catch {
      return gallery.split(',').map(s => s.trim()).filter(Boolean);
    }
  }

  return [];
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

function parseFiltersFromTags(tags: string[], searchParams: URLSearchParams): Record<string, any> {
  const filters: Record<string, any> = {};

  const operationSlugs: Record<string, string> = {
    'comprar': 'venta', 'buy': 'venta', 'acheter': 'venta',
    'alquilar': 'alquiler', 'rent': 'alquiler', 'louer': 'alquiler',
    'venta': 'venta', 'alquiler': 'alquiler'
  };

  const propertyTypes: Record<string, string> = {
    'casa': 'casa', 'casas': 'casa', 'house': 'casa',
    'apartamento': 'apartamento', 'apartamentos': 'apartamento', 'apartment': 'apartamento',
    'local': 'local', 'locales': 'local', 'commercial': 'local',
    'terreno': 'terreno', 'terrenos': 'terreno', 'land': 'terreno',
    'oficina': 'oficina', 'oficinas': 'oficina', 'office': 'oficina',
    'penthouse': 'penthouse', 'villa': 'villa'
  };

  for (const tag of tags) {
    const tagLower = tag.toLowerCase();

    if (operationSlugs[tagLower]) {
      filters.operacion = operationSlugs[tagLower];
      continue;
    }

    if (propertyTypes[tagLower]) {
      filters.tipo = propertyTypes[tagLower];
      continue;
    }

    // Ubicación
    if (tag && !filters.ciudad) {
      filters.ciudad = tag.replace(/-/g, ' ');
    } else if (tag && !filters.sector) {
      filters.sector = tag.replace(/-/g, ' ');
    }
  }

  // Query params
  if (searchParams.get('min_price')) filters.minPrice = parseInt(searchParams.get('min_price')!, 10);
  if (searchParams.get('max_price')) filters.maxPrice = parseInt(searchParams.get('max_price')!, 10);
  if (searchParams.get('bedrooms')) filters.habitaciones = parseInt(searchParams.get('bedrooms')!, 10);
  if (searchParams.get('bathrooms')) filters.banos = parseInt(searchParams.get('bathrooms')!, 10);
  if (searchParams.get('tipo')) filters.tipo = searchParams.get('tipo');
  if (searchParams.get('operacion')) filters.operacion = searchParams.get('operacion');

  return filters;
}

function buildSearchTags(tags: string[], filters: Record<string, any>, language: string): Tag[] {
  const result: Tag[] = [];
  let position = 0;

  if (filters.operacion) {
    result.push({
      id: `op-${filters.operacion}`,
      slug: filters.operacion === 'venta' ? 'comprar' : 'alquilar',
      name: filters.operacion === 'venta' ? 'Comprar' : 'Alquilar',
      display_name: filters.operacion === 'venta' ? 'En Venta' : 'En Alquiler',
      category: 'operacion'
    });
    position++;
  }

  if (filters.tipo) {
    result.push({
      id: `type-${filters.tipo}`,
      slug: filters.tipo,
      name: formatPropertyType(filters.tipo, language),
      display_name: formatPropertyType(filters.tipo, language),
      category: 'categoria'
    });
    position++;
  }

  if (filters.ciudad) {
    result.push({
      id: `city-${utils.slugify(filters.ciudad)}`,
      slug: utils.slugify(filters.ciudad),
      name: filters.ciudad,
      display_name: filters.ciudad,
      category: 'ciudad'
    });
    position++;
  }

  if (filters.sector) {
    result.push({
      id: `sector-${utils.slugify(filters.sector)}`,
      slug: utils.slugify(filters.sector),
      name: filters.sector,
      display_name: filters.sector,
      category: 'sector'
    });
  }

  return result;
}

function generateBreadcrumbs(tags: string[], filters: Record<string, any>, language: string): Breadcrumb[] {
  const breadcrumbs: Breadcrumb[] = [
    { name: 'Inicio', url: '/', is_active: false, position: 0 }
  ];

  let currentPath = '';
  let position = 1;

  if (filters.operacion) {
    const opSlug = filters.operacion === 'venta' ? 'comprar' : 'alquilar';
    currentPath = `/${opSlug}`;
    breadcrumbs.push({
      name: filters.operacion === 'venta' ? 'Comprar' : 'Alquilar',
      slug: opSlug,
      url: currentPath,
      category: 'operacion',
      is_active: false,
      position: position++
    });
  }

  if (filters.tipo) {
    currentPath += `/${filters.tipo}`;
    breadcrumbs.push({
      name: formatPropertyType(filters.tipo, language),
      slug: filters.tipo,
      url: currentPath,
      category: 'categoria',
      is_active: false,
      position: position++
    });
  }

  if (filters.ciudad) {
    const citySlug = utils.slugify(filters.ciudad);
    currentPath += `/${citySlug}`;
    breadcrumbs.push({
      name: filters.ciudad,
      slug: citySlug,
      url: currentPath,
      category: 'ciudad',
      is_active: false,
      position: position++
    });
  }

  if (filters.sector) {
    const sectorSlug = utils.slugify(filters.sector);
    currentPath += `/${sectorSlug}`;
    breadcrumbs.push({
      name: filters.sector,
      slug: sectorSlug,
      url: currentPath,
      category: 'sector',
      is_active: true,
      is_current_page: true,
      position: position++
    });
  }

  // Marcar último como activo si no hay sector
  if (breadcrumbs.length > 1 && !filters.sector) {
    breadcrumbs[breadcrumbs.length - 1].is_active = true;
    breadcrumbs[breadcrumbs.length - 1].is_current_page = true;
  }

  return breadcrumbs;
}

function generatePropertyBreadcrumbs(prop: any, language: string): Breadcrumb[] {
  const breadcrumbs: Breadcrumb[] = [
    { name: 'Inicio', url: '/', is_active: false, position: 0 },
    { name: 'Propiedades', url: '/comprar', is_active: false, position: 1 }
  ];

  let currentPath = '/comprar';
  let position = 2;

  if (prop.tipo) {
    currentPath += `/${prop.tipo}`;
    breadcrumbs.push({
      name: formatPropertyType(prop.tipo, language),
      slug: prop.tipo,
      url: currentPath,
      category: 'categoria',
      is_active: false,
      position: position++
    });
  }

  if (prop.ciudad) {
    const citySlug = utils.slugify(prop.ciudad);
    currentPath += `/${citySlug}`;
    breadcrumbs.push({
      name: prop.ciudad,
      slug: citySlug,
      url: currentPath,
      category: 'ciudad',
      is_active: false,
      position: position++
    });
  }

  if (prop.sector) {
    const sectorSlug = utils.slugify(prop.sector);
    currentPath += `/${sectorSlug}`;
    breadcrumbs.push({
      name: prop.sector,
      slug: sectorSlug,
      url: currentPath,
      category: 'sector',
      is_active: false,
      position: position++
    });
  }

  breadcrumbs.push({
    name: prop.titulo || 'Propiedad',
    url: prop.slug_url || '#',
    is_active: true,
    is_current_page: true,
    position: position
  });

  return breadcrumbs;
}

function generateListSEO(filters: Record<string, any>, language: string, tenant: TenantConfig, total: number, pathname: string): any {
  const parts: string[] = [];

  if (filters.tipo) {
    parts.push(formatPropertyType(filters.tipo, language));
  } else {
    parts.push('Propiedades');
  }

  if (filters.operacion === 'venta') {
    parts.push('en Venta');
  } else if (filters.operacion === 'alquiler') {
    parts.push('en Alquiler');
  }

  if (filters.ciudad) {
    parts.push(`en ${filters.ciudad}`);
  }

  const title = `${parts.join(' ')} | ${tenant.name}`;
  const description = `Encuentra ${total} ${parts[0].toLowerCase()} disponibles ${parts.slice(1).join(' ')}. Amplia selección con fotos, precios y características.`;

  return {
    title,
    description,
    h1: parts.join(' '),
    keywords: parts.map(p => p.toLowerCase()).join(', ') + ', inmobiliaria, bienes raíces',
    hreflang: utils.generateHreflangUrls(pathname),
    og: {
      title,
      description,
      type: 'website'
    }
  };
}

function generatePropertySEO(prop: any, language: string, tenant: TenantConfig): any {
  const title = prop.titulo || 'Propiedad';
  const location = [prop.sector, prop.ciudad].filter(Boolean).join(', ');
  const currency = utils.normalizeCurrency(prop.moneda);
  const price = utils.formatPrice(
    prop.precio_venta || prop.precio_alquiler || 0,
    currency,
    prop.precio_venta ? 'venta' : 'alquiler',
    language
  );

  const seoTitle = `${title} | ${price} | ${tenant.name}`;
  const description = prop.descripcion
    ? prop.descripcion.replace(/<[^>]*>/g, '').substring(0, 155)
    : `${title} en ${location}. ${prop.habitaciones || 0} hab, ${prop.banos || 0} baños. ${price}`;

  // Construir el basePath para hreflang usando el slug de la propiedad
  const basePath = prop.slug_url ? `/propiedades/${prop.slug_url}` : null;

  return {
    title: seoTitle,
    description,
    h1: title,
    keywords: `${title}, ${location}, ${prop.tipo || 'propiedad'}, inmobiliaria`.toLowerCase(),
    hreflang: basePath ? utils.generateHreflangUrls(basePath) : undefined,
    og: {
      title: seoTitle,
      description,
      image: prop.imagen_principal,
      type: 'website'
    },
    structured_data: {
      '@context': 'https://schema.org',
      '@type': 'RealEstateListing',
      name: title,
      description,
      price: prop.precio_venta || prop.precio_alquiler,
      priceCurrency: currency
    }
  };
}

function buildLocationData(prop: any): any {
  // Usar latitud y longitud directamente si existen
  let coordinates = null;
  if (prop.latitud && prop.longitud) {
    coordinates = {
      lat: parseFloat(prop.latitud),
      lng: parseFloat(prop.longitud)
    };
  } else {
    // Fallback a coordenadas de ciudad si existen
    coordinates = parseCoordinates(prop.ciudad_coordenadas);
  }

  const hasExactCoords = !!(prop.latitud && prop.longitud);

  return {
    coordinates,
    hasExactCoordinates: hasExactCoords,
    showExactLocation: prop.mostrar_ubicacion_exacta || false,
    coordinatesSource: hasExactCoords ? 'property' : prop.ciudad_coordenadas ? 'city' : 'none',
    address: prop.direccion || '',
    sector: prop.sector,
    city: prop.ciudad,
    province: prop.provincia,
    mapConfig: {
      zoom: coordinates ? 15 : 10,
      showMarker: !!coordinates,
      showAreaCircle: !prop.mostrar_ubicacion_exacta && !!coordinates,
      circleRadius: 500
    }
  };
}

function parseCoordinates(coordString: string | null): { lat: number; lng: number } | null {
  if (!coordString) return null;

  // Formato PostGIS: "(-70.123,18.456)"
  const match = coordString.match(/\(([-\d.]+),([-\d.]+)\)/);
  if (match) {
    return {
      lng: parseFloat(match[1]),
      lat: parseFloat(match[2])
    };
  }

  return null;
}

function buildProjectDetails(prop: any): any {
  if (!prop.is_project) return null;

  // =====================================================================
  // TIPOLOGÍAS - Usar array tipologias de la propiedad si existe
  // Estructura BD: [{id, nombre, habitaciones, banos, m2, precio, studio, medios_banos, estacionamiento}]
  // =====================================================================
  let projectTypologies = [];

  if (Array.isArray(prop.tipologias) && prop.tipologias.length > 0) {
    // Usar tipologías reales de la base de datos
    projectTypologies = prop.tipologias.map((typo: any) => ({
      id: typo.id,
      name: typo.nombre || `${typo.habitaciones} Hab`,
      bedrooms: parseInt(typo.habitaciones) || 0,
      bathrooms: parseInt(typo.banos) || 0,
      half_bathrooms: parseInt(typo.medios_banos) || 0,
      built_area: parseFloat(typo.m2) || 0,
      sale_price_from: parseFloat(typo.precio) || 0,
      sale_price_to: parseFloat(typo.precio) || 0,
      sale_currency: prop.moneda || 'USD',
      parking_spots: parseInt(typo.estacionamiento) || 0,
      has_studio: typo.studio === true || typo.studio === 'true',
      available_units: 1
    }));
  } else {
    // Fallback: crear una tipología básica desde los datos de la propiedad
    projectTypologies = [{
      bedrooms: prop.habitaciones || 0,
      bathrooms: prop.banos || 0,
      built_area: parseFloat(prop.m2_construccion) || 0,
      sale_price_from: parseFloat(prop.precio_min) || parseFloat(prop.precio_venta) || parseFloat(prop.precio) || 0,
      sale_price_to: parseFloat(prop.precio_max) || parseFloat(prop.precio_venta) || parseFloat(prop.precio) || 0,
      sale_currency: prop.moneda || 'USD',
      available_units: 1
    }];
  }

  // =====================================================================
  // PLANES DE PAGO - Usar objeto planes_pago de la propiedad
  // Estructura BD: {separacion, reserva_valor, contra_entrega, inicial_construccion}
  // =====================================================================
  let projectPaymentPlans = [];

  if (prop.planes_pago && typeof prop.planes_pago === 'object') {
    const plan = prop.planes_pago;
    projectPaymentPlans = [{
      name: 'Plan de Pago',
      is_default: true,
      reservation_amount: parseFloat(plan.reserva_valor) || 1000,
      reservation_currency: prop.moneda || 'USD',
      separation_percentage: parseFloat(plan.separacion) || 10,
      construction_percentage: parseFloat(plan.inicial_construccion) || 40,
      delivery_percentage: parseFloat(plan.contra_entrega) || 50
    }];
  } else {
    // Fallback: plan de pago predeterminado
    projectPaymentPlans = [{
      name: 'Plan Estándar',
      is_default: true,
      reservation_amount: 1000,
      reservation_currency: prop.moneda || 'USD',
      separation_percentage: 10,
      construction_percentage: 40,
      delivery_percentage: 50
    }];
  }

  // =====================================================================
  // ETAPAS/FASES - Usar array etapas de la propiedad
  // Estructura BD: [{id, nombre, fecha_entrega}]
  // =====================================================================
  let projectPhases = [];

  if (Array.isArray(prop.etapas) && prop.etapas.length > 0) {
    projectPhases = prop.etapas.map((etapa: any, index: number) => ({
      id: etapa.id,
      phase_name: etapa.nombre || `Etapa ${index + 1}`,
      estimated_delivery: etapa.fecha_entrega || null,
      completion_percentage: 0
    }));
  } else {
    // Fallback: usar fecha_entrega general si existe
    projectPhases = [{
      phase_name: 'Fase 1',
      estimated_delivery: prop.fecha_entrega || null,
      completion_percentage: 0
    }];
  }

  // =====================================================================
  // BENEFICIOS Y GARANTÍAS
  // =====================================================================
  const benefits = Array.isArray(prop.beneficios) ? prop.beneficios : [];
  const guarantees = Array.isArray(prop.garantias) ? prop.garantias : [];

  return {
    id: prop.proyecto_id || prop.id,
    name: prop.proyecto_nombre || prop.titulo,
    status: {
      construction: prop.estado_construccion || 'En construcción',
      sales: 'En venta',
      completion: prop.fecha_entrega
    },
    // Estructuras que espera SinglePropertyLayout.astro
    project_typologies: projectTypologies,
    project_payment_plans: projectPaymentPlans,
    project_phases: projectPhases,
    // Beneficios y garantías del proyecto
    benefits: benefits,
    guarantees: guarantees,
    // Desarrollador (si existe desarrollador_id, se podría hacer JOIN)
    developers: prop.desarrollador_nombre ? {
      id: prop.desarrollador_id,
      name: prop.desarrollador_nombre,
      logo_url: prop.desarrollador_logo || null,
      years_experience: prop.desarrollador_experiencia || null,
      total_projects: prop.desarrollador_proyectos || null
    } : null,
    // Rangos de precio del proyecto
    price_range: {
      min: parseFloat(prop.precio_min) || null,
      max: parseFloat(prop.precio_max) || null,
      currency: prop.moneda || 'USD'
    },
    // Rangos de características
    specs_range: {
      bedrooms: { min: prop.habitaciones_min, max: prop.habitaciones_max },
      bathrooms: { min: prop.banos_min, max: prop.banos_max },
      area: { min: parseFloat(prop.m2_min), max: parseFloat(prop.m2_max) },
      parking: { min: prop.parqueos_min, max: prop.parqueos_max }
    }
  };
}

async function getAgentProperties(
  tenantId: string,
  captadorId: string | null,
  excludePropertyId: string,
  language: string,
  trackingString: string
): Promise<PropertyForList[]> {
  if (!captadorId) {
    console.log('[getAgentProperties] No captadorId provided, returning empty array');
    return [];
  }

  console.log('[getAgentProperties] Searching properties for captador:', captadorId);

  const sql = db.getSQL();

  // Buscar propiedades donde el usuario es captador o está en cocaptadores
  const properties = await sql`
    SELECT
      p.id, p.slug, p.codigo, p.codigo_publico, p.titulo, p.tipo, p.operacion,
      p.precio, p.precio_venta, p.precio_alquiler, p.moneda,
      p.ciudad, p.sector, p.direccion, p.habitaciones, p.banos,
      p.estacionamientos, p.m2_construccion, p.m2_terreno,
      p.imagen_principal, p.destacada, p.created_at, p.is_project,
      p.estado_propiedad
    FROM propiedades p
    WHERE p.tenant_id = ${tenantId}
      AND p.activo = true
      AND p.estado_propiedad = 'disponible'
      AND p.id != ${excludePropertyId}
      AND (
        p.captador_id = ${captadorId}::uuid
        OR p.cocaptadores_ids @> ${JSON.stringify([captadorId])}::jsonb
      )
    ORDER BY p.destacada DESC, p.created_at DESC
    LIMIT 6
  `;

  const propertiesArray = properties as any[];
  console.log('[getAgentProperties] Found properties:', propertiesArray.length);

  return propertiesArray.map(p => toSupabasePropertyFormat(p, language, trackingString));
}

export default {
  handlePropertyList,
  handleSingleProperty
};
