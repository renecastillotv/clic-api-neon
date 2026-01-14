// api/index.ts
// Router principal para Vercel Edge Functions
// Este archivo maneja todas las rutas y delega a los handlers específicos

import db from '../lib/db';
import utils from '../lib/utils';

// Handlers
import propertiesHandler from '../handlers/properties';
import contentHandler from '../handlers/content';
import advisorsHandler from '../handlers/advisors';
import homepageHandler from '../handlers/homepage';
import articlesHandler from '../handlers/articles';

import type { TenantConfig, ApiResponse, Error404Response } from '../types';

// Configuración para Edge Runtime
export const config = {
  runtime: 'edge',
};

// ============================================================================
// CORS Headers
// ============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-original-host',
};

// ============================================================================
// ROUTE PATTERNS
// ============================================================================

// Rutas especiales por idioma
const SPECIAL_ROUTES: Record<string, Record<string, string>> = {
  es: {
    asesores: 'advisors',
    favoritos: 'favorites',
    testimonios: 'testimonials',
    videos: 'videos',
    articulos: 'articles',
    contacto: 'contact',
    vender: 'sell',
    'rentas-vacacionales': 'vacation-rentals',
    'listados-de': 'curated-listings',
    ubicaciones: 'locations',
    propiedades: 'property-types',
    'terminos-y-condiciones': 'legal-terms',
    'politicas-de-privacidad': 'legal-privacy',
    comprar: 'property-list',
    alquilar: 'property-list',
  },
  en: {
    advisors: 'advisors',
    favorites: 'favorites',
    testimonials: 'testimonials',
    videos: 'videos',
    articles: 'articles',
    contact: 'contact',
    sell: 'sell',
    'vacation-rentals': 'vacation-rentals',
    'listings-of': 'curated-listings',
    locations: 'locations',
    'property-types': 'property-types',
    'terms-and-conditions': 'legal-terms',
    'privacy-policy': 'legal-privacy',
    buy: 'property-list',
    rent: 'property-list',
  },
  fr: {
    conseillers: 'advisors',
    favoris: 'favorites',
    temoignages: 'testimonials',
    videos: 'videos',
    articles: 'articles',
    contact: 'contact',
    vendre: 'sell',
    'locations-vacances': 'vacation-rentals',
    'listes-de': 'curated-listings',
    emplacements: 'locations',
    'types-de-proprietes': 'property-types',
    'termes-et-conditions': 'legal-terms',
    'politique-de-confidentialite': 'legal-privacy',
    acheter: 'property-list',
    louer: 'property-list',
  },
};

const LANGUAGES = ['es', 'en', 'fr'];

// ============================================================================
// MAIN HANDLER
// ============================================================================

export default async function handler(request: Request): Promise<Response> {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const searchParams = url.searchParams;

    // Extraer domain del header o query param
    const domain = request.headers.get('x-original-host') ||
                   searchParams.get('domain') ||
                   url.host;

    console.log(`[API] Request: ${pathname} | Domain: ${domain}`);

    // Obtener configuración del tenant
    const tenant = await getTenantConfig(domain);

    if (!tenant) {
      console.error(`[API] Tenant not found for domain: ${domain}`);
      return jsonResponse({ error: 'Tenant not found' }, 404);
    }

    // Parsear la ruta
    const { language, segments, routeType, isPropertySlug } = parseRoute(pathname);

    console.log(`[API] Parsed route:`, { language, segments, routeType, isPropertySlug });

    // Extraer tracking string
    const trackingString = utils.extractTrackingString(searchParams);

    // Parsear paginación
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '32', 10);

    // Delegar al handler apropiado
    let response: ApiResponse;

    switch (routeType) {
      case 'homepage':
        response = await homepageHandler.handleHomepage({
          tenant,
          language,
          trackingString,
        });
        break;

      case 'property-list':
        response = await propertiesHandler.handlePropertyList({
          tenant,
          tags: segments,
          language,
          trackingString,
          page,
          limit,
          searchParams,
        });
        break;

      case 'single-property':
        const propertySlug = segments[segments.length - 1];
        const propertyResponse = await propertiesHandler.handleSingleProperty({
          tenant,
          propertySlug,
          language,
          trackingString,
        });

        if (!propertyResponse) {
          response = build404Response(tenant, language, trackingString);
        } else {
          response = propertyResponse;
        }
        break;

      case 'advisors':
        if (segments.length > 1) {
          // Asesor individual
          const advisorSlug = segments[1];
          const advisorResponse = await advisorsHandler.handleSingleAdvisor({
            tenant,
            advisorSlug,
            language,
            trackingString,
          });

          if (!advisorResponse) {
            response = build404Response(tenant, language, trackingString);
          } else {
            response = advisorResponse;
          }
        } else {
          // Lista de asesores
          response = await advisorsHandler.handleAdvisorsList({
            tenant,
            language,
            trackingString,
            page,
            limit,
          });
        }
        break;

      case 'articles':
        // Estructura: /articulos, /articulos/categoria, /articulos/categoria/slug-articulo
        // segments[0] = 'articulos' o 'articles'
        // segments[1] = categorySlug (si existe)
        // segments[2] = articleSlug (si existe)
        const articleCategorySlug = segments.length >= 2 ? segments[1] : undefined;
        const articleSlug = segments.length >= 3 ? segments[2] : undefined;

        const articlesResult = await articlesHandler.handleArticles({
          tenant,
          slug: articleSlug,
          categorySlug: articleCategorySlug,
          language,
          trackingString,
          page,
          limit,
        });

        if (articlesResult.type === '404') {
          response = build404Response(tenant, language, trackingString);
        } else {
          response = articlesResult as any;
        }
        break;

      case 'videos':
        // Videos con datos hardcodeados (no hay tabla en Neon)
        response = buildVideosResponse(tenant, language, trackingString);
        break;

      case 'testimonials':
        response = await contentHandler.handleTestimonials({
          tenant,
          language,
          trackingString,
          page,
          limit,
        });
        break;

      case 'favorites':
        // TODO: Implementar handler de favoritos
        response = {
          type: 'favorites-main',
          language,
          tenant,
          seo: utils.generateSEO({
            title: 'Mis Favoritos',
            description: 'Tus propiedades guardadas',
            language,
          }),
          trackingString,
        } as any;
        break;

      case 'contact':
        // TODO: Implementar handler de contacto
        response = {
          type: 'contact',
          language,
          tenant,
          seo: utils.generateSEO({
            title: 'Contacto',
            description: 'Contáctanos',
            language,
          }),
          trackingString,
        } as any;
        break;

      case 'sell':
        // TODO: Implementar handler de vender
        response = {
          type: 'sell',
          language,
          tenant,
          seo: utils.generateSEO({
            title: 'Vender tu propiedad',
            description: 'Vende tu propiedad con nosotros',
            language,
          }),
          trackingString,
        } as any;
        break;

      case 'vacation-rentals':
        // TODO: Implementar handler de rentas vacacionales
        response = {
          type: 'vacation-rentals-main',
          language,
          tenant,
          seo: utils.generateSEO({
            title: 'Rentas Vacacionales',
            description: 'Propiedades para alquiler vacacional',
            language,
          }),
          trackingString,
        } as any;
        break;

      case 'curated-listings':
        // TODO: Implementar handler de listados curados
        response = {
          type: 'curated-listings-main',
          language,
          tenant,
          seo: utils.generateSEO({
            title: 'Listados Curados',
            description: 'Colecciones especiales de propiedades',
            language,
          }),
          trackingString,
        } as any;
        break;

      case 'locations':
        // TODO: Implementar handler de ubicaciones
        response = {
          type: 'locations-main',
          language,
          tenant,
          seo: utils.generateSEO({
            title: 'Ubicaciones',
            description: 'Explora propiedades por ubicación',
            language,
          }),
          trackingString,
        } as any;
        break;

      case 'property-types':
        // TODO: Implementar handler de tipos de propiedad
        response = {
          type: 'property-types-main',
          language,
          tenant,
          seo: utils.generateSEO({
            title: 'Tipos de Propiedad',
            description: 'Explora propiedades por tipo',
            language,
          }),
          trackingString,
        } as any;
        break;

      case 'legal-terms':
      case 'legal-privacy':
        // TODO: Implementar handler de páginas legales
        response = {
          type: routeType,
          language,
          tenant,
          seo: utils.generateSEO({
            title: routeType === 'legal-terms' ? 'Términos y Condiciones' : 'Política de Privacidad',
            description: routeType === 'legal-terms' ? 'Términos de uso del sitio' : 'Política de privacidad',
            language,
          }),
          trackingString,
          legalType: routeType === 'legal-terms' ? 'terms' : 'privacy',
        } as any;
        break;

      default:
        response = build404Response(tenant, language, trackingString);
    }

    const duration = Date.now() - startTime;
    console.log(`[API] Response in ${duration}ms | type: ${response.type}`);

    // Enriquecer respuesta con globalConfig y country
    const enrichedResponse = enrichResponse(response, tenant, language, trackingString);

    return jsonResponse(enrichedResponse);

  } catch (error) {
    console.error('[API] Error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function getTenantConfig(domain: string): Promise<TenantConfig | null> {
  // Intentar obtener por dominio
  let tenantData = await db.getTenantByDomain(domain);

  // Si no se encuentra, usar tenant por defecto (para desarrollo local)
  if (!tenantData) {
    tenantData = await db.getDefaultTenant();
  }

  if (!tenantData) {
    return null;
  }

  // Parsear configuración JSONB
  const config = tenantData.config || tenantData.configuracion || {};
  const infoNegocio = tenantData.info_negocio || {};

  return {
    id: tenantData.id, // UUID string
    slug: tenantData.slug,
    name: tenantData.nombre || infoNegocio.nombre_comercial || config.company_name || 'Inmobiliaria',
    domain: tenantData.dominio_personalizado || domain,

    branding: {
      logo_url: config.logo_url || infoNegocio.logo_url,
      favicon_url: config.favicon_url,
      primary_color: config.primary_color || infoNegocio.color_primario,
      secondary_color: config.secondary_color || infoNegocio.color_secundario,
    },

    contact: {
      phone: infoNegocio.telefono || config.phone,
      whatsapp: infoNegocio.whatsapp || config.whatsapp,
      email: infoNegocio.email || config.email,
      address: infoNegocio.direccion || config.address,
    },

    social: infoNegocio.redes_sociales || config.social || {},

    features: {
      vacation_rentals: config.features?.vacation_rentals !== false,
      projects: config.features?.projects !== false,
      curated_lists: config.features?.curated_lists !== false,
      advisor_profiles: config.features?.advisor_profiles !== false,
      testimonials: config.features?.testimonials !== false,
      articles: config.features?.articles !== false,
      videos: config.features?.videos !== false,
    },

    legal: {
      company_name: infoNegocio.razon_social || config.legal?.company_name || tenantData.nombre,
      company_id: infoNegocio.rnc || config.legal?.company_id,
      terms_url: config.legal?.terms_url,
      privacy_url: config.legal?.privacy_url,
    },

    regional: {
      country_code: tenantData.codigo_pais || config.country_code || 'DO',
      currency_default: config.currency_default || 'USD',
      languages: tenantData.idiomas_disponibles || config.languages || ['es', 'en'],
      timezone: config.timezone || 'America/Santo_Domingo',
    },

    default_seo: {
      title_suffix: config.seo?.title_suffix || tenantData.nombre,
      description: config.seo?.description || '',
      keywords: config.seo?.keywords || '',
    },
  };
}

function parseRoute(pathname: string): {
  language: string;
  segments: string[];
  routeType: string;
  isPropertySlug: boolean;
} {
  // Limpiar pathname
  const cleanPath = pathname.replace(/^\/+|\/+$/g, '');
  let segments = cleanPath.split('/').filter(Boolean);

  // Detectar idioma
  let language = 'es';
  if (segments[0] && LANGUAGES.includes(segments[0])) {
    language = segments[0];
    segments = segments.slice(1);
  }

  // Homepage
  if (segments.length === 0) {
    return { language, segments: [], routeType: 'homepage', isPropertySlug: false };
  }

  // Detectar tipo de ruta
  const firstSegment = segments[0];
  const routes = SPECIAL_ROUTES[language] || SPECIAL_ROUTES.es;
  const routeType = routes[firstSegment];

  if (routeType) {
    return {
      language,
      segments,
      routeType,
      isPropertySlug: routeType === 'property-list' && segments.length > 2,
    };
  }

  // Si no es una ruta especial, asumir que es una propiedad individual o 404
  // Las propiedades tienen formato: /categoria/ubicacion/slug-propiedad
  if (segments.length >= 1) {
    // Verificar si el último segmento parece ser un slug de propiedad
    const lastSegment = segments[segments.length - 1];
    if (looksLikePropertySlug(lastSegment)) {
      return {
        language,
        segments,
        routeType: 'single-property',
        isPropertySlug: true,
      };
    }
  }

  // Por defecto, tratar como lista de propiedades
  return {
    language,
    segments,
    routeType: 'property-list',
    isPropertySlug: false,
  };
}

function looksLikePropertySlug(slug: string): boolean {
  // Los slugs de propiedad suelen tener números o ser más largos
  // y no coincidir con categorías o ubicaciones comunes
  const commonSlugs = ['apartamento', 'casa', 'villa', 'penthouse', 'local', 'oficina', 'terreno'];
  if (commonSlugs.includes(slug.toLowerCase())) {
    return false;
  }
  // Si tiene números, probablemente es una propiedad
  if (/\d/.test(slug)) {
    return true;
  }
  // Si es muy largo (más de 30 caracteres), probablemente es una propiedad
  if (slug.length > 30) {
    return true;
  }
  return false;
}

function build404Response(tenant: TenantConfig, language: string, trackingString: string): any {
  const titles = {
    es: 'Página no encontrada',
    en: 'Page not found',
    fr: 'Page non trouvée',
  };

  const descriptions = {
    es: 'La página que buscas no existe o ha sido movida.',
    en: 'The page you are looking for does not exist or has been moved.',
    fr: 'La page que vous recherchez n\'existe pas ou a été déplacée.',
  };

  return {
    type: '404',
    available: false,
    language,
    tenant,
    seo: {
      title: titles[language as keyof typeof titles] || titles.es,
      description: descriptions[language as keyof typeof descriptions] || descriptions.es,
    },
    breadcrumbs: [
      { name: 'Inicio', url: '/', is_active: false },
      { name: '404', url: '#', is_active: true, is_current_page: true }
    ],
    trackingString,
    suggestedLinks: [
      { title: language === 'es' ? 'Inicio' : language === 'en' ? 'Home' : 'Accueil', url: utils.buildUrl('/', language) },
      { title: language === 'es' ? 'Propiedades' : language === 'en' ? 'Properties' : 'Propriétés', url: utils.buildUrl('/comprar', language) },
    ],
    meta: {
      timestamp: new Date().toISOString(),
      source: 'neon_edge_function',
      error: 'not_found'
    }
  };
}

function jsonResponse(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': status === 200 ? 'public, max-age=60, s-maxage=300' : 'no-cache',
      ...corsHeaders,
    },
  });
}

// ============================================================================
// VIDEOS RESPONSE - Datos hardcodeados (no hay tabla en Neon)
// ============================================================================

function buildVideosResponse(tenant: TenantConfig, language: string, trackingString: string): any {
  const baseUrl = language === 'es' ? '' : `/${language}`;

  const allVideos = [
    {
      id: 'vid-001',
      title: 'Proyecto nuevo en Bávaro - Oportunidad de Inversión',
      description: 'Descubre este increíble proyecto nuevo en Bávaro con excelentes opciones de inversión.',
      thumbnail: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&h=450&fit=crop',
      slug: 'proyecto-nuevo-bavaro',
      videoSlug: 'videos/lanzamientos/proyecto-nuevo-bavaro',
      duration: '10:00',
      publishedAt: '2025-01-10T12:00:00Z',
      views: 1250,
      featured: true,
      url: `${baseUrl}/videos/lanzamientos/proyecto-nuevo-bavaro`,
      author: {
        name: 'René Castillo',
        avatar: 'https://img.clerk.com/eyJ0eXBlIjoicHJveHkiLCJzcmMiOiJodHRwczovL2ltYWdlcy5jbGVyay5kZXYvdXBsb2FkZWQvaW1nXzM1dGlTWTl6WmswRUdrR2w2d0pNS0tzS2F2TCJ9',
        slug: 'rene-castillo',
        position: 'Fundador CLIC Inmobiliaria'
      },
      category: { id: 'cat-1', name: 'Lanzamientos', slug: 'lanzamientos' }
    },
    {
      id: 'vid-002',
      title: 'Recorrido Villa Oceánica en Cap Cana',
      description: 'Tour completo por esta increíble villa de lujo en Cap Cana con vistas al mar.',
      thumbnail: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800&h=450&fit=crop',
      slug: 'recorrido-villa-oceanica-cap-cana',
      videoSlug: 'videos/recorridos/recorrido-villa-oceanica-cap-cana',
      duration: '8:45',
      publishedAt: '2025-01-08T10:00:00Z',
      views: 980,
      featured: true,
      url: `${baseUrl}/videos/recorridos/recorrido-villa-oceanica-cap-cana`,
      author: {
        name: 'René Castillo',
        avatar: 'https://img.clerk.com/eyJ0eXBlIjoicHJveHkiLCJzcmMiOiJodHRwczovL2ltYWdlcy5jbGVyay5kZXYvdXBsb2FkZWQvaW1nXzM1dGlTWTl6WmswRUdrR2w2d0pNS0tzS2F2TCJ9',
        slug: 'rene-castillo',
        position: 'Fundador CLIC Inmobiliaria'
      },
      category: { id: 'cat-2', name: 'Recorridos', slug: 'recorridos' }
    },
    {
      id: 'vid-003',
      title: 'Tips de Decoración para Apartamentos Modernos',
      description: 'Consejos profesionales de decoración para transformar tu apartamento.',
      thumbnail: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=800&h=450&fit=crop',
      slug: 'tips-decoracion-apartamentos-modernos',
      videoSlug: 'videos/decoracion/tips-decoracion-apartamentos-modernos',
      duration: '12:30',
      publishedAt: '2025-01-05T14:00:00Z',
      views: 756,
      featured: false,
      url: `${baseUrl}/videos/decoracion/tips-decoracion-apartamentos-modernos`,
      author: {
        name: 'Equipo CLIC',
        avatar: '/images/team/clic-experts.jpg',
        slug: 'equipo-clic',
        position: 'Especialista en Diseño'
      },
      category: { id: 'cat-3', name: 'Decoración', slug: 'decoracion' }
    },
    {
      id: 'vid-004',
      title: 'Tour por Apartamento de Lujo en Naco',
      description: 'Conoce este espectacular apartamento en una de las mejores zonas de Santo Domingo.',
      thumbnail: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&h=450&fit=crop',
      slug: 'tour-naco-lujo',
      videoSlug: 'videos/recorridos/tour-naco-lujo',
      duration: '10:00',
      publishedAt: '2025-01-03T09:00:00Z',
      views: 645,
      featured: false,
      url: `${baseUrl}/videos/recorridos/tour-naco-lujo`,
      author: {
        name: 'René Castillo',
        avatar: 'https://img.clerk.com/eyJ0eXBlIjoicHJveHkiLCJzcmMiOiJodHRwczovL2ltYWdlcy5jbGVyay5kZXYvdXBsb2FkZWQvaW1nXzM1dGlTWTl6WmswRUdrR2w2d0pNS0tzS2F2TCJ9',
        slug: 'rene-castillo',
        position: 'Fundador CLIC Inmobiliaria'
      },
      category: { id: 'cat-2', name: 'Recorridos', slug: 'recorridos' }
    },
    {
      id: 'vid-005',
      title: 'Tendencias de Decoración para 2025',
      description: 'Lo último en tendencias para que tu casa se vea hermosa este 2025.',
      thumbnail: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=800&h=450&fit=crop',
      slug: 'tendencias-decoracion-2025',
      videoSlug: 'videos/decoracion/tendencias-decoracion-2025',
      duration: '9:00',
      publishedAt: '2025-01-01T11:00:00Z',
      views: 532,
      featured: false,
      url: `${baseUrl}/videos/decoracion/tendencias-decoracion-2025`,
      author: {
        name: 'René Castillo',
        avatar: 'https://img.clerk.com/eyJ0eXBlIjoicHJveHkiLCJzcmMiOiJodHRwczovL2ltYWdlcy5jbGVyay5kZXYvdXBsb2FkZWQvaW1nXzM1dGlTWTl6WmswRUdrR2w2d0pNS0tzS2F2TCJ9',
        slug: 'rene-castillo',
        position: 'Fundador CLIC Inmobiliaria'
      },
      category: { id: 'cat-3', name: 'Decoración', slug: 'decoracion' }
    },
    {
      id: 'vid-006',
      title: 'Video de Bienvenida - Conoce CLIC Inmobiliaria',
      description: 'Video introductorio de CLIC y René Castillo para compradores de propiedades.',
      thumbnail: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800&h=450&fit=crop',
      slug: 'bienvenida-clic-inmobiliaria',
      videoSlug: 'videos/entrevistas/bienvenida-clic-inmobiliaria',
      duration: '5:30',
      publishedAt: '2024-12-28T15:00:00Z',
      views: 1890,
      featured: true,
      url: `${baseUrl}/videos/entrevistas/bienvenida-clic-inmobiliaria`,
      author: {
        name: 'René Castillo',
        avatar: 'https://img.clerk.com/eyJ0eXBlIjoicHJveHkiLCJzcmMiOiJodHRwczovL2ltYWdlcy5jbGVyay5kZXYvdXBsb2FkZWQvaW1nXzM1dGlTWTl6WmswRUdrR2w2d0pNS0tzS2F2TCJ9',
        slug: 'rene-castillo',
        position: 'Fundador CLIC Inmobiliaria'
      },
      category: { id: 'cat-4', name: 'Entrevistas', slug: 'entrevistas' }
    },
    {
      id: 'vid-007',
      title: 'Guía de Inversión Inmobiliaria en RD',
      description: 'Todo lo que necesitas saber para invertir en bienes raíces en República Dominicana.',
      thumbnail: 'https://images.unsplash.com/photo-1582407947304-fd86f028f716?w=800&h=450&fit=crop',
      slug: 'guia-inversion-inmobiliaria-rd',
      videoSlug: 'videos/consejos/guia-inversion-inmobiliaria-rd',
      duration: '15:20',
      publishedAt: '2024-12-20T10:00:00Z',
      views: 2340,
      featured: false,
      url: `${baseUrl}/videos/consejos/guia-inversion-inmobiliaria-rd`,
      author: {
        name: 'René Castillo',
        avatar: 'https://img.clerk.com/eyJ0eXBlIjoicHJveHkiLCJzcmMiOiJodHRwczovL2ltYWdlcy5jbGVyay5kZXYvdXBsb2FkZWQvaW1nXzM1dGlTWTl6WmswRUdrR2w2d0pNS0tzS2F2TCJ9',
        slug: 'rene-castillo',
        position: 'Fundador CLIC Inmobiliaria'
      },
      category: { id: 'cat-5', name: 'Consejos', slug: 'consejos' }
    },
    {
      id: 'vid-008',
      title: 'Casa de los Famosos - Episodio Especial',
      description: 'Un recorrido especial por las casas más impresionantes de celebridades.',
      thumbnail: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&h=450&fit=crop',
      slug: 'casa-famosos-episodio-especial',
      videoSlug: 'videos/la-casa-de-los-famosos/casa-famosos-episodio-especial',
      duration: '18:45',
      publishedAt: '2024-12-15T12:00:00Z',
      views: 4560,
      featured: true,
      url: `${baseUrl}/videos/la-casa-de-los-famosos/casa-famosos-episodio-especial`,
      author: {
        name: 'René Castillo',
        avatar: 'https://img.clerk.com/eyJ0eXBlIjoicHJveHkiLCJzcmMiOiJodHRwczovL2ltYWdlcy5jbGVyay5kZXYvdXBsb2FkZWQvaW1nXzM1dGlTWTl6WmswRUdrR2w2d0pNS0tzS2F2TCJ9',
        slug: 'rene-castillo',
        position: 'Fundador CLIC Inmobiliaria'
      },
      category: { id: 'cat-6', name: 'La Casa de los Famosos', slug: 'la-casa-de-los-famosos' }
    }
  ];

  const featuredVideos = allVideos.filter(v => v.featured);
  const recentVideos = [...allVideos].sort((a, b) =>
    new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  const categories = [
    { id: 'cat-1', name: 'Lanzamientos', slug: 'lanzamientos', url: `${baseUrl}/videos/lanzamientos`, videoCount: 1, featured: true },
    { id: 'cat-2', name: 'Recorridos', slug: 'recorridos', url: `${baseUrl}/videos/recorridos`, videoCount: 2, featured: true },
    { id: 'cat-3', name: 'Decoración', slug: 'decoracion', url: `${baseUrl}/videos/decoracion`, videoCount: 2, featured: false },
    { id: 'cat-4', name: 'Entrevistas', slug: 'entrevistas', url: `${baseUrl}/videos/entrevistas`, videoCount: 1, featured: false },
    { id: 'cat-5', name: 'Consejos', slug: 'consejos', url: `${baseUrl}/videos/consejos`, videoCount: 1, featured: true },
    { id: 'cat-6', name: 'La Casa de los Famosos', slug: 'la-casa-de-los-famosos', url: `${baseUrl}/videos/la-casa-de-los-famosos`, videoCount: 1, featured: true }
  ];

  const totalViews = allVideos.reduce((sum, v) => sum + v.views, 0);

  return {
    type: 'videos-main',
    language,
    tenant,
    seo: utils.generateSEO({
      title: language === 'en' ? 'Videos - CLIC Real Estate' : 'Videos - CLIC Inmobiliaria',
      description: language === 'en'
        ? 'Discover properties, explore tours, and learn investment tips with CLIC Real Estate videos.'
        : 'Descubre propiedades, explora recorridos y aprende tips de inversión con los videos de CLIC Inmobiliaria.',
      language,
      canonicalUrl: `${baseUrl}/videos`,
      siteName: tenant.name
    }),
    trackingString,
    featuredVideos,
    recentVideos,
    categories,
    stats: {
      totalVideos: allVideos.length,
      totalCategories: categories.length,
      totalViews
    },
    videos: allVideos
  };
}

// ============================================================================
// GLOBAL CONFIG - Estructura compatible con Supabase
// ============================================================================

function buildGlobalConfig(tenant: TenantConfig, language: string): any {
  return {
    country: tenant.regional.country_code,
    language,
    legal: {
      company_name: tenant.name,
      company_full_name: tenant.legal.company_name,
      founded: '2022',
      logo_url: tenant.branding.logo_url || 'https://pacewqgypevfgjmdsorz.supabase.co/storage/v1/object/public/public-assets/clic%20logo%20on.png',
      rnc: tenant.legal.company_id || ''
    },
    contact: {
      phone: tenant.contact.phone || '8094872542',
      whatsapp: tenant.contact.whatsapp || '8295148080',
      email: tenant.contact.email || 'info@clicinmobiliaria.com',
      address: tenant.contact.address || 'Calle Erik Leonard Ekman No. 34, Edificio The Box Working Space, Distrito Nacional'
    },
    office: {
      name: 'Oficina Principal',
      hours: {
        weekdays: 'Lun-Vie: 9:00-18:00',
        saturday: 'Sáb: 9:00-15:00',
        sunday: 'Dom: Cerrado'
      }
    },
    social: {
      company: tenant.social || {
        facebook: 'https://www.facebook.com/ClicInmobiliaria/',
        instagram: '@clic.do',
        instagram_url: 'https://www.instagram.com/clic.do/',
        youtube: 'https://www.youtube.com/@clicinmobiliaria',
        linkedin: 'https://www.linkedin.com/company/clic-inmobiliaria',
        tiktok: '@clic.do',
        tiktok_url: 'https://www.tiktok.com/@clic.do'
      },
      founder: {
        name: 'René Castillo',
        instagram: '@renecastillotv',
        instagram_url: 'https://www.instagram.com/renecastillotv/',
        facebook: 'https://www.facebook.com/renecastillotv',
        tiktok: '@renecastillo.tv',
        tiktok_url: 'https://www.tiktok.com/@renecastillo.tv',
        followers: '600000+'
      }
    },
    team: {
      founder_experience: '6 años en Inmobiliaria',
      team_experience: '+10 años experiencia'
    },
    seo: {
      company_rating: '4.9/5',
      founder_followers: '600K+',
      youtube_subscribers: '200K+'
    },
    certifications: [
      {
        name: 'AEI',
        description: 'Miembro de la Asociación de Empresas Inmobiliarias',
        logo: 'https://pacewqgypevfgjmdsorz.supabase.co/storage/v1/object/public/public-assets/logo-aei.png'
      }
    ],
    features: {
      header: {
        sections: {
          buy: {
            enabled: true,
            order: 1,
            labels: { es: 'Comprar', en: 'Buy', fr: 'Acheter' },
            urls: { es: '/comprar', en: '/en/buy', fr: '/fr/acheter' }
          },
          rent: {
            enabled: true,
            order: 2,
            labels: { es: 'Alquilar', en: 'Rent', fr: 'Louer' },
            urls: { es: '/alquilar', en: '/en/rent', fr: '/fr/louer' }
          },
          sell: {
            enabled: true,
            order: 3,
            labels: { es: 'Vender', en: 'Sell', fr: 'Vendre' },
            urls: { es: '/vender', en: '/en/sell', fr: '/fr/vendre' }
          },
          advisors: {
            enabled: true,
            order: 4,
            labels: { es: 'Asesores', en: 'Advisors', fr: 'Conseillers' },
            urls: { es: '/asesores', en: '/en/advisors', fr: '/fr/conseillers' }
          },
          videos: {
            enabled: true,
            order: 5,
            labels: { es: 'Videos', en: 'Videos', fr: 'Vidéos' },
            urls: { es: '/videos', en: '/en/videos', fr: '/fr/videos' }
          },
          articles: {
            enabled: true,
            order: 6,
            labels: { es: 'Blog', en: 'Blog', fr: 'Articles' },
            urls: { es: '/articulos', en: '/en/articles', fr: '/fr/articles' }
          },
          contact: {
            enabled: true,
            order: 7,
            labels: { es: 'Contacto', en: 'Contact', fr: 'Contact' },
            urls: { es: '/contacto', en: '/en/contact', fr: '/fr/contact' }
          }
        }
      },
      footer: {
        company_info: true,
        experience_badges: true,
        founder_social: true,
        properties_by_zone: true,
        resources: true,
        services: true,
        social_links: true
      },
      cta: {
        phone: true,
        whatsapp: true,
        email: true,
        schedule: true
      }
    },
    footer_links: {
      properties_by_zone: [
        { label: 'Santo Domingo', url: '/comprar/santo-domingo' },
        { label: 'Punta Cana', url: '/comprar/punta-cana' },
        { label: 'Santiago', url: '/comprar/santiago' },
        { label: 'La Romana', url: '/comprar/la-romana' },
        { label: 'Puerto Plata', url: '/comprar/puerto-plata' },
        { label: 'Samaná', url: '/comprar/samana' },
        { label: 'Bávaro', url: '/comprar/bavaro' }
      ],
      services: [
        { label: 'Compra', url: '/comprar' },
        { label: 'Venta', url: '/vender' },
        { label: 'Alquiler', url: '/alquilar' },
        { label: 'Asesoría', url: '/asesores' }
      ],
      resources: [
        { label: 'Blog', url: '/articulos' },
        { label: 'Videos', url: '/videos' },
        { label: 'Testimonios', url: '/testimonios' },
        { label: 'Preguntas Frecuentes', url: '/faqs' },
        { label: 'Contacto', url: '/contacto' }
      ],
      testimonials: {
        urls: { es: '/testimonios', en: '/en/testimonials', fr: '/fr/temoignages' }
      }
    },
    translations: {
      header: {
        buy: 'Comprar',
        rent: 'Alquilar',
        sell: 'Vender',
        advisors: 'Asesores',
        videos: 'Videos',
        articles: 'Artículos',
        contact: 'Contacto'
      },
      footer: {
        aboutUs: 'Sobre Nosotros',
        contact: 'Contacto',
        followUs: 'Síguenos',
        mainOffice: 'Oficina Principal',
        officeHours: 'Horarios de Oficina',
        ourServices: 'Nuestros Servicios',
        propertiesByZone: 'Propiedades por Zona',
        resources: 'Recursos',
        rights: '© 2024 CLIC DOM SRL. Todos los derechos reservados.'
      },
      cta: {
        needHelp: '¿Necesitas Ayuda Personalizada?',
        expertsWillHelp: 'Nuestros asesores expertos te guiarán para encontrar la propiedad perfecta que se ajuste a tu presupuesto y necesidades',
        talkToAdvisor: 'Hablar con Asesor',
        callNow: 'Llamar Ahora',
        scheduleAppointment: 'Programar Cita'
      }
    }
  };
}

// ============================================================================
// COUNTRY DATA - Estructura compatible con Supabase
// ============================================================================

function buildCountryData(tenant: TenantConfig): any {
  return {
    id: tenant.id,
    name: 'República Dominicana',
    code: tenant.regional.country_code || 'DOM',
    currency: tenant.regional.currency_default || 'USD',
    timezone: tenant.regional.timezone || 'America/Santo_Domingo',
    subdomain: tenant.domain,
    custom_domain: `https://${tenant.domain}`,
    country_tag_id: null,
    tags: {
      id: null,
      slug: 'republica-dominicana',
      slug_en: 'dominican-republic',
      slug_fr: 'republique-dominicaine',
      category: 'pais',
      display_name: 'República Dominicana',
      display_name_en: 'Dominican Republic',
      display_name_fr: 'République Dominicaine'
    }
  };
}

// ============================================================================
// ENRICH RESPONSE - Agrega globalConfig y country a todas las respuestas
// ============================================================================

function enrichResponse(response: any, tenant: TenantConfig, language: string, trackingString: string): any {
  return {
    ...response,
    globalConfig: buildGlobalConfig(tenant, language),
    country: buildCountryData(tenant),
    countryConfig: buildCountryConfig(tenant),
    language,
    trackingString
  };
}

// ============================================================================
// COUNTRY CONFIG - Configuración específica del país para el frontend
// ============================================================================

function buildCountryConfig(tenant: TenantConfig): any {
  // Determinar si es el país por defecto (República Dominicana / CLIC)
  const isDefaultCountry = tenant.domain === 'clic.do' ||
                           tenant.name.toLowerCase().includes('clic') ||
                           tenant.regional?.country_code === 'DO';

  return {
    code: tenant.regional?.country_code || 'DOM',
    name: 'República Dominicana',
    isDefault: isDefaultCountry,
    showReneBranding: isDefaultCountry,
    hasContent: true,
    features: {
      showFounderStory: isDefaultCountry,
      showVideos: true,
      showArticles: true,
      showTestimonials: true,
      showFAQs: true,
      showAdvisors: true
    },
    currency: {
      default: tenant.regional?.currency_default || 'USD',
      available: ['USD', 'DOP']
    }
  };
}
