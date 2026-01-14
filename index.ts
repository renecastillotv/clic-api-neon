// api/index.ts
// Router principal para Vercel Edge Functions
// Este archivo maneja todas las rutas y delega a los handlers específicos

import db from './lib/db';
import utils from './lib/utils';

// Handlers
import propertiesHandler from './handlers/properties';
import contentHandler from './handlers/content';
import advisorsHandler from './handlers/advisors';
import homepageHandler from './handlers/homepage';

import type { TenantConfig, ApiResponse, Error404Response } from './types';

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
        response = await contentHandler.handleArticles({
          tenant,
          slug: segments.length > 1 ? segments[segments.length - 1] : undefined,
          categorySlug: segments.length === 2 && !isArticleSlug(segments[1]) ? segments[1] : undefined,
          language,
          trackingString,
          page,
          limit,
        });
        break;

      case 'videos':
        response = await contentHandler.handleVideos({
          tenant,
          slug: segments.length > 1 ? segments[segments.length - 1] : undefined,
          categorySlug: segments.length === 2 && !isVideoSlug(segments[1]) ? segments[1] : undefined,
          language,
          trackingString,
          page,
          limit,
        });
        break;

      case 'testimonials':
        response = await contentHandler.handleTestimonials({
          tenant,
          slug: segments.length > 1 ? segments[segments.length - 1] : undefined,
          categorySlug: segments.length === 2 ? segments[1] : undefined,
          language,
          trackingString,
          page,
          limit,
        });
        break;

      case 'favorites':
        // TODO: Implementar handler de favoritos
        response = {
          pageType: 'favorites-main',
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
          pageType: 'contact',
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
          pageType: 'sell',
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
          pageType: 'vacation-rentals-main',
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
          pageType: 'curated-listings-main',
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
          pageType: 'locations-main',
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
          pageType: 'property-types-main',
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
          pageType: routeType,
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
    console.log(`[API] Response in ${duration}ms | pageType: ${response.pageType}`);

    return jsonResponse(response);

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

  return {
    id: tenantData.id,
    slug: tenantData.slug,
    name: tenantData.nombre || config.company_name || 'Inmobiliaria',
    domain: tenantData.dominio_principal || domain,

    branding: {
      logo_url: config.logo_url,
      favicon_url: config.favicon_url,
      primary_color: config.primary_color,
      secondary_color: config.secondary_color,
    },

    contact: {
      phone: config.phone || tenantData.telefono,
      whatsapp: config.whatsapp,
      email: config.email || tenantData.email,
      address: config.address || tenantData.direccion,
    },

    social: config.social || {},

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
      company_name: config.legal?.company_name || tenantData.nombre,
      company_id: config.legal?.company_id,
      terms_url: config.legal?.terms_url,
      privacy_url: config.legal?.privacy_url,
    },

    regional: {
      country_code: config.country_code || 'DO',
      currency_default: config.currency_default || 'USD',
      languages: config.languages || ['es', 'en'],
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

async function isArticleSlug(slug: string): Promise<boolean> {
  // Verificar si el slug corresponde a un artículo
  // Por ahora, asumir que si tiene más de 20 caracteres es un artículo
  return slug.length > 20;
}

async function isVideoSlug(slug: string): Promise<boolean> {
  return slug.length > 20;
}

function build404Response(tenant: TenantConfig, language: string, trackingString: string): Error404Response {
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
    pageType: '404',
    language,
    tenant,
    seo: utils.generateSEO({
      title: titles[language as keyof typeof titles] || titles.es,
      description: descriptions[language as keyof typeof descriptions] || descriptions.es,
      language,
    }),
    trackingString,
    suggestedLinks: [
      { title: language === 'es' ? 'Inicio' : language === 'en' ? 'Home' : 'Accueil', url: utils.buildUrl('/', language) },
      { title: language === 'es' ? 'Propiedades' : language === 'en' ? 'Properties' : 'Propriétés', url: utils.buildUrl('/comprar', language) },
    ],
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
