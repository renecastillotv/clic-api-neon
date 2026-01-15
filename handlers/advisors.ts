// api/handlers/advisors.ts
// Handler para asesores inmobiliarios
// Adaptado al schema real de Neon

import db from '../lib/db';
import utils from '../lib/utils';
import type {
  AdvisorsListResponse,
  SingleAdvisorResponse,
  Advisor,
  PropertyCard,
  TenantConfig,
  SEOData
} from '../types';

// ============================================================================
// HANDLER: Lista de Asesores
// ============================================================================

export async function handleAdvisorsList(options: {
  tenant: TenantConfig;
  language: string;
  trackingString: string;
  page: number;
  limit: number;
}): Promise<AdvisorsListResponse> {
  const { tenant, language, trackingString, page, limit } = options;

  // Usar la función de db.ts para obtener asesores
  const advisors = await db.getAdvisors(tenant.id, limit);

  // Procesar asesores
  const processedAdvisors = advisors.map((a: any) => processAdvisor(a, language, trackingString));

  const total = advisors.length;

  // Generar SEO
  const seo = generateAdvisorsListSEO(language, tenant, total);

  // Calcular estadísticas agregadas para el frontend
  const totalExperience = processedAdvisors.reduce((sum, a) => sum + (a.stats?.yearsExperience || 0), 0);
  const totalSalesAll = processedAdvisors.reduce((sum, a) => sum + (a.stats?.totalSales || 0), 0);
  const avgSatisfaction = processedAdvisors.length > 0
    ? (processedAdvisors.reduce((sum, a) => sum + (a.stats?.clientSatisfaction || 4.8), 0) / processedAdvisors.length).toFixed(1)
    : '4.8';

  return {
    type: 'advisors-list',
    language,
    tenant,
    seo,
    trackingString,
    advisors: processedAdvisors,
    totalAdvisors: total,
    // Stats agregados que espera el frontend (AdvisorsLayout líneas 104-110)
    stats: {
      totalAdvisors: total,
      totalExperience: totalExperience,
      totalSales: totalSalesAll,
      averageSatisfaction: avgSatisfaction
    },
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

// ============================================================================
// HANDLER: Asesor Individual
// ============================================================================

export async function handleSingleAdvisor(options: {
  tenant: TenantConfig;
  advisorSlug: string;
  language: string;
  trackingString: string;
}): Promise<SingleAdvisorResponse | any> {
  const { tenant, advisorSlug, language, trackingString } = options;
  const sql = db.getSQL();

  // Obtener asesor usando la función de db.ts
  const rawAdvisor = await db.getAdvisorBySlug(advisorSlug, tenant.id);

  if (!rawAdvisor) {
    // Soft 404: devolver página de asesor con notFound para preservar SEO
    const advisorUrl = utils.buildUrl(`/asesores/${advisorSlug}`, language);

    // Obtener otros asesores para mostrar como contenido alternativo
    const otherAdvisors = await db.getAdvisors(tenant.id, 6);
    const suggestedAdvisors = otherAdvisors.map((a: any) => processAdvisor(a, language, trackingString));

    const seo = generateSingleAdvisorSEO(
      {
        name: advisorSlug,
        slug: advisorSlug,
        position: '',
        avatar: '',
        phone: '',
        whatsapp: '',
        email: '',
        bio: '',
        languages: [],
        specialties: [],
        stats: { yearsExperience: 0, totalSales: 0, clientSatisfaction: 0, avgResponseTime: '' },
        url: advisorUrl,
        socialLinks: {}
      },
      language,
      tenant,
      0
    );

    return {
      type: 'advisor-single',
      notFound: true,
      notFoundMessage: language === 'en' ? 'Advisor not found' : language === 'fr' ? 'Conseiller non trouvé' : 'Asesor no encontrado',
      language,
      tenant,
      seo,
      trackingString,
      advisor: {
        id: '',
        name: advisorSlug,
        slug: advisorSlug,
        position: '',
        avatar: '',
        phone: '',
        whatsapp: '',
        email: '',
        bio: '',
        languages: [],
        specialties: [],
        stats: { yearsExperience: 0, totalSales: 0, clientSatisfaction: 0, avgResponseTime: '' },
        url: advisorUrl,
        socialLinks: {}
      },
      properties: [],
      testimonials: [],
      articles: [],
      videos: [],
      suggestedAdvisors,
      stats: {},
      services: [],
      contactMethods: []
    };
  }

  // Procesar asesor
  const advisor = processAdvisor(rawAdvisor, language, trackingString);

  // Obtener propiedades del asesor - adaptado al schema real
  // El asesor puede estar vinculado por perfil_asesor_id, captador_id o agente_id
  const perfilId = rawAdvisor.perfil_id || rawAdvisor.id;
  const usuarioId = rawAdvisor.usuario_id || rawAdvisor.id;

  // Query con try-catch para debugging
  let properties: any[] = [];
  try {
    const result = await sql`
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
        p.moneda_venta,
        p.moneda_alquiler,
        p.ciudad,
        p.sector,
        p.provincia,
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
      WHERE (
        p.perfil_asesor_id::text = ${String(perfilId)}
        OR p.captador_id::text = ${String(usuarioId)}
        OR p.agente_id::text = ${String(usuarioId)}
      )
        AND p.tenant_id = ${tenant.id}
        AND p.activo = true
        AND p.estado_propiedad = 'disponible'
      ORDER BY p.destacada DESC, p.created_at DESC
      LIMIT 12
    `;
    properties = Array.isArray(result) ? result : [];
  } catch (err) {
    console.error('[SingleAdvisor] Error fetching properties:', err);
    properties = [];
  }

  const propertyCards = (properties as any[]).map(p => toPropertyCard(p, language, trackingString));

  // Obtener testimonios del tenant (no hay relación directa asesor-testimonio en mock_testimonios)
  const rawTestimonials = await db.getTestimonials(tenant.id, 6);
  const testimonials = Array.isArray(rawTestimonials) ? rawTestimonials : [];

  // Generar SEO
  const seo = generateSingleAdvisorSEO(advisor, language, tenant, propertyCards.length);

  // Mapear testimonios usando el formato unificado
  const mappedTestimonials = utils.formatTestimonials(testimonials, language, { trackingString });

  return {
    type: 'advisor-single',
    language,
    tenant,
    seo,
    trackingString,
    advisor,
    properties: propertyCards,
    testimonials: mappedTestimonials,
    relatedContent: {
      articles: [],
      videos: []
    }
  };
}

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

function toPropertyCard(prop: any, language: string, trackingString: string): any {
  const price = prop.precio_venta || prop.precio_alquiler || prop.precio || 0;
  const currency = prop.moneda_venta || prop.moneda_alquiler || prop.moneda || 'USD';
  const operationType = prop.operacion || (prop.precio_venta ? 'sale' : 'rental');
  const propertyUrl = utils.buildPropertyUrl(prop, language, trackingString);

  // El frontend SingleAdvisorLayout.astro espera campos específicos (líneas 74-106)
  return {
    id: prop.id,
    slug: prop.slug,
    code: prop.codigo,

    // Campos que espera el frontend (camelCase)
    name: prop.titulo,  // Frontend usa 'name' para el título
    mainPrice: price,  // Frontend usa mainPrice
    mainCurrency: currency,  // Frontend usa mainCurrency
    operation: operationType,  // Frontend usa 'operation'
    mainImage: prop.imagen_principal || '',  // Frontend usa mainImage

    // Ubicación - frontend espera campos planos
    city: prop.ciudad,
    sector: prop.sector,
    province: prop.provincia,
    address: prop.direccion,

    // Características - frontend espera campos planos en camelCase
    bedrooms: prop.habitaciones || 0,
    bathrooms: prop.banos || 0,
    parkingSpots: prop.estacionamientos || 0,
    builtArea: prop.m2_construccion || 0,
    landArea: prop.m2_terreno || 0,

    // Tipo de propiedad
    category: prop.tipo,
    categoryDisplay: prop.tipo,

    // URL
    url: propertyUrl,

    // Campos estructurados originales (para compatibilidad con PropertyCard type)
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
    amenity_badges: []
  };
}

function processAdvisor(
  raw: Record<string, any>,
  language: string,
  trackingString: string
): any {
  // El frontend espera campos específicos como 'name', 'avatar', 'position', 'stats'
  // Adaptamos la respuesta para que coincida

  // Procesar bio - obtener string según idioma
  let bioText = '';
  if (typeof raw.biografia === 'string') {
    bioText = raw.biografia;
  } else if (typeof raw.bio === 'object' && raw.bio !== null) {
    bioText = raw.bio[language] || raw.bio.es || '';
  } else if (typeof raw.bio === 'string') {
    bioText = raw.bio;
  }

  // Procesar arrays (especialidades, idiomas)
  const parseArray = (value: any): string[] => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return value.split(',').map(s => s.trim()).filter(Boolean);
      }
    }
    return [];
  };

  const specialties = parseArray(raw.especialidades || raw.specialties);
  const languages = parseArray(raw.idiomas || raw.languages) || ['Español'];

  // Nombre completo
  const fullName = raw.full_name || `${raw.nombre || ''} ${raw.apellido || ''}`.trim() || 'Asesor';

  // Construir URL del asesor
  const advisorUrl = utils.buildUrl(`/asesores/${raw.slug}`, language, trackingString);

  // Stats del asesor
  const propertiesCount = parseInt(raw.propiedades_count || raw.properties_count || '0', 10);
  const yearsExperience = parseInt(raw.experiencia_anos || raw.years_experience || '0', 10);
  const totalSales = parseInt(raw.ventas_totales || raw.total_sales || '0', 10);
  const clientSatisfaction = parseFloat(raw.satisfaccion_cliente || raw.client_satisfaction || '4.8');

  return {
    // IDs y slugs
    id: raw.id || raw.perfil_id || raw.usuario_id,
    slug: raw.slug,
    created_at: raw.created_at,
    updated_at: raw.updated_at,

    // CAMPOS QUE ESPERA EL FRONTEND
    name: fullName,  // El frontend usa 'name', no 'full_name'
    avatar: raw.foto_url || raw.avatar_url || raw.avatar || raw.photo_url || null,  // El frontend usa 'avatar'
    position: raw.titulo_profesional || raw.position || (language === 'es' ? 'Asesor Inmobiliario' : language === 'en' ? 'Real Estate Advisor' : 'Conseiller Immobilier'),
    bio: bioText,
    description: bioText, // Alias para compatibilidad

    // Campos originales (para compatibilidad hacia atrás)
    first_name: raw.nombre,
    last_name: raw.apellido,
    full_name: fullName,
    photo_url: raw.foto_url || raw.avatar_url || raw.avatar || null,

    // Contacto
    email: raw.email,
    phone: raw.telefono || raw.phone,
    whatsapp: raw.whatsapp || raw.telefono || raw.phone,

    // Arrays
    specialties: specialties,
    languages: languages.length > 0 ? languages : ['Español'],
    certifications: parseArray(raw.certificaciones || raw.certifications),

    // STATS - estructura que espera el frontend
    stats: {
      properties_count: propertiesCount,
      propertiesCount: propertiesCount,  // Alias
      activeListings: propertiesCount,   // Alias
      sales_count: totalSales,
      totalSales: totalSales,            // Alias
      years_experience: yearsExperience,
      yearsExperience: yearsExperience,  // Alias - LO QUE USA EL FRONTEND
      clientSatisfaction: clientSatisfaction,  // LO QUE USA EL FRONTEND
      client_satisfaction: clientSatisfaction
    },

    // Social links
    social: {
      instagram: raw.instagram,
      facebook: raw.facebook,
      linkedin: raw.linkedin,
      youtube: raw.youtube,
      tiktok: raw.tiktok
    },

    // Estados
    active: raw.activo !== false,
    featured: raw.destacado || raw.es_owner || false,
    is_featured: raw.destacado || raw.es_owner || false,

    // URL del perfil
    url: advisorUrl
  };
}

function generateAdvisorsListSEO(
  language: string,
  tenant: TenantConfig,
  total: number
): SEOData {
  const titles = {
    es: 'Nuestros Asesores Inmobiliarios',
    en: 'Our Real Estate Advisors',
    fr: 'Nos Conseillers Immobiliers'
  };

  const descriptions = {
    es: `Conoce a nuestro equipo de ${total} asesores inmobiliarios profesionales. Expertos en bienes raíces listos para ayudarte.`,
    en: `Meet our team of ${total} professional real estate advisors. Real estate experts ready to help you.`,
    fr: `Découvrez notre équipe de ${total} conseillers immobiliers professionnels. Des experts prêts à vous aider.`
  };

  const slugs = {
    es: 'asesores',
    en: 'advisors',
    fr: 'conseillers'
  };

  return utils.generateSEO({
    title: `${titles[language as keyof typeof titles]} | ${tenant.name}`,
    description: descriptions[language as keyof typeof descriptions],
    keywords: 'asesores inmobiliarios, agentes de bienes raíces, expertos inmobiliarios',
    canonicalUrl: utils.buildUrl(`/${slugs[language as keyof typeof slugs]}`, language),
    language,
    siteName: tenant.name
  });
}

function generateSingleAdvisorSEO(
  advisor: any,
  language: string,
  tenant: TenantConfig,
  propertiesCount: number
): SEOData {
  const bioText = utils.getLocalizedText(advisor.bio, language);
  const specialtiesText = (advisor.specialties || []).slice(0, 3).join(', ');

  const titles = {
    es: `${advisor.full_name} - Asesor Inmobiliario`,
    en: `${advisor.full_name} - Real Estate Advisor`,
    fr: `${advisor.full_name} - Conseiller Immobilier`
  };

  const descriptions = {
    es: bioText
      ? bioText.substring(0, 150)
      : `${advisor.full_name}, asesor inmobiliario con ${propertiesCount} propiedades activas.`,
    en: bioText
      ? bioText.substring(0, 150)
      : `${advisor.full_name}, real estate advisor with ${propertiesCount} active properties.`,
    fr: bioText
      ? bioText.substring(0, 150)
      : `${advisor.full_name}, conseiller immobilier avec ${propertiesCount} propriétés actives.`
  };

  return utils.generateSEO({
    title: `${titles[language as keyof typeof titles]} | ${tenant.name}`,
    description: descriptions[language as keyof typeof descriptions],
    keywords: `${advisor.full_name}, asesor inmobiliario`,
    canonicalUrl: advisor.url,
    ogImage: advisor.photo_url,
    language,
    siteName: tenant.name
  });
}

export default {
  handleAdvisorsList,
  handleSingleAdvisor
};
