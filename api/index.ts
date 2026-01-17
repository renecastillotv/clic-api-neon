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
import videosHandler from '../handlers/videos';
import sellHandler from '../handlers/sell';
import favoritesHandler from '../handlers/favorites';
import proposalsHandler from '../handlers/proposals';

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
    propuestas: 'proposals',
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
    proposals: 'proposals',
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
    propositions: 'proposals',
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

    // ========================================================================
    // RUTAS DIRECTAS DE API (sin tenant)
    // ========================================================================

    // Ruta de favoritos: /api/favorites/*
    if (pathname.startsWith('/api/favorites') || pathname.startsWith('/favorites')) {
      console.log(`[API] Favorites route: ${pathname}`);
      return favoritesHandler.handleFavorites(request);
    }

    // Ruta de propuestas: /api/proposals/*
    if (pathname.startsWith('/api/proposals') || pathname.startsWith('/proposals')) {
      console.log(`[API] Proposals route: ${pathname}`);
      return proposalsHandler.handleProposals(request);
    }

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
    const { language, segments, routeType, lastSegment } = parseRoute(pathname);

    console.log(`[API] Parsed route:`, { language, segments, routeType, lastSegment });

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
        // Si hay un último segmento, verificar si es una propiedad individual
        if (lastSegment && segments.length > 1) {
          try {
            // Buscar si el último segmento es un slug de propiedad en la BD
            const singlePropertyResponse = await propertiesHandler.handleSingleProperty({
              tenant,
              propertySlug: lastSegment,
              language,
              trackingString,
            });

            if (singlePropertyResponse) {
              // Es una propiedad individual
              response = singlePropertyResponse;
              break;
            }
          } catch (err) {
            // Si falla la búsqueda de propiedad, continuar con property-list
            console.error('[API] Error checking single property:', err);
          }
        }

        // No es single-property, mostrar lista de propiedades
        response = await propertiesHandler.handlePropertyList({
          tenant,
          tags: segments,
          language,
          trackingString,
          page,
          limit,
          searchParams,
          pathname,
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
          // handleSingleAdvisor ahora devuelve soft 404 con notFound: true si no encuentra
          response = await advisorsHandler.handleSingleAdvisor({
            tenant,
            advisorSlug,
            language,
            trackingString,
          });
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

        // handleArticles ahora devuelve soft 404 con notFound: true si no encuentra
        response = articlesResult as any;
        break;

      case 'videos':
        // Estructura: /videos, /videos/categoria, /videos/categoria/slug-video
        // segments[0] = 'videos'
        // segments[1] = categorySlug (si existe)
        // segments[2] = videoSlug (si existe)
        const videoCategorySlug = segments.length >= 2 ? segments[1] : undefined;
        const videoSlug = segments.length >= 3 ? segments[2] : undefined;

        const videosResult = await videosHandler.handleVideos({
          tenant,
          slug: videoSlug,
          categorySlug: videoCategorySlug,
          language,
          trackingString,
          page,
          limit,
        });

        // handleVideos ahora devuelve soft 404 con notFound: true si no encuentra
        response = videosResult as any;
        break;

      case 'testimonials':
        // Estructura: /testimonios, /testimonios/categoria, /testimonios/categoria/slug-testimonio
        // segments[0] = 'testimonios' o 'testimonials' o 'temoignages'
        // segments[1] = categorySlug (si existe)
        // segments[2] = testimonialSlug (si existe)
        const testimonialCategorySlug = segments.length >= 2 ? segments[1] : undefined;
        const testimonialSlug = segments.length >= 3 ? segments[2] : undefined;

        const testimonialsResult = await contentHandler.handleTestimonials({
          tenant,
          slug: testimonialSlug,
          categorySlug: testimonialCategorySlug,
          language,
          trackingString,
          page,
          limit,
        });

        // handleTestimonials ahora devuelve soft 404 con notFound: true si no encuentra
        response = testimonialsResult as any;
        break;

      case 'favorites':
        // Detectar si es vista compartida: /favoritos/compartir, /favorites/share, /favoris/partager
        const favoritesSubroute = segments[1];
        const isSharedView = favoritesSubroute === 'compartir' ||
                             favoritesSubroute === 'share' ||
                             favoritesSubroute === 'partager';

        if (isSharedView) {
          // Vista compartida - el ID se pasa como query param ?id=XXX
          response = {
            type: 'favorites-shared',
            language,
            tenant,
            seo: utils.generateSEO({
              title: language === 'en' ? 'Shared Favorites' : language === 'fr' ? 'Favoris Partagés' : 'Favoritos Compartidos',
              description: language === 'en' ? 'View shared favorites list' : language === 'fr' ? 'Voir la liste des favoris partagés' : 'Ver lista de favoritos compartidos',
              language,
              canonicalUrl: pathname, // Para generar hreflang correcto
            }),
            trackingString,
            // Pasar query params para que el frontend pueda acceder al ID
            queryParams: Object.fromEntries(searchParams.entries()),
            originalUrl: pathname,
          } as any;
        } else {
          // Vista principal de favoritos del usuario
          response = {
            type: 'favorites-main',
            language,
            tenant,
            seo: utils.generateSEO({
              title: language === 'en' ? 'My Favorites' : language === 'fr' ? 'Mes Favoris' : 'Mis Favoritos',
              description: language === 'en' ? 'Your saved properties' : language === 'fr' ? 'Vos propriétés enregistrées' : 'Tus propiedades guardadas',
              language,
              canonicalUrl: pathname, // Para generar hreflang correcto
            }),
            trackingString,
          } as any;
        }
        break;

      case 'proposals':
        // Propuestas del CRM: /propuestas/:token, /proposals/:token, /propositions/:token
        const proposalToken = segments[1]; // El token de la propuesta

        response = {
          type: 'proposal',
          language,
          tenant,
          seo: utils.generateSEO({
            title: language === 'en' ? 'Property Proposal' : language === 'fr' ? 'Proposition Immobilière' : 'Propuesta de Propiedades',
            description: language === 'en' ? 'View your personalized property selection' : language === 'fr' ? 'Voir votre sélection personnalisée' : 'Ve tu selección personalizada de propiedades',
            language,
          }),
          trackingString,
          proposalToken, // El frontend usará esto para cargar la propuesta
          originalUrl: pathname,
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
            canonicalUrl: pathname,
          }),
          trackingString,
        } as any;
        break;

      case 'sell':
        // Handler de vender con estadísticas de ventas
        response = await sellHandler.handleSell({
          tenant,
          language,
          trackingString,
        });
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
            canonicalUrl: pathname,
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
            canonicalUrl: pathname,
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
            canonicalUrl: pathname,
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
            canonicalUrl: pathname,
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
            canonicalUrl: pathname,
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

    // Enriquecer respuesta con globalConfig, country y hreflang centralizado
    const enrichedResponse = enrichResponse(response, tenant, language, trackingString, pathname);

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
  lastSegment: string | null;
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
    return { language, segments: [], routeType: 'homepage', isPropertySlug: false, lastSegment: null };
  }

  // Detectar tipo de ruta
  const firstSegment = segments[0];
  const routes = SPECIAL_ROUTES[language] || SPECIAL_ROUTES.es;
  const routeType = routes[firstSegment];

  if (routeType) {
    // Es una ruta especial conocida (asesores, articulos, videos, etc.)
    return {
      language,
      segments,
      routeType,
      isPropertySlug: false,
      lastSegment: segments.length > 1 ? segments[segments.length - 1] : null,
    };
  }

  // No es una ruta especial conocida - tratar como property-list por defecto
  // La verificación de single-property se hará en el handler consultando la BD
  return {
    language,
    segments,
    routeType: 'property-list',
    isPropertySlug: false,
    lastSegment: segments.length > 0 ? segments[segments.length - 1] : null,
  };
}

function looksLikePropertySlug(slug: string): boolean {
  // Los slugs de propiedad suelen tener números, ser más largos,
  // o contener patrones específicos de propiedades
  const slugLower = slug.toLowerCase();

  // Categorías y ubicaciones comunes que NO son slugs de propiedad
  const commonSlugs = [
    // Categorías
    'apartamento', 'apartamentos', 'casa', 'casas', 'villa', 'villas',
    'penthouse', 'local', 'locales', 'oficina', 'oficinas', 'terreno', 'terrenos',
    // Ciudades comunes de RD
    'santo-domingo', 'santiago', 'punta-cana', 'bavaro', 'la-romana',
    'puerto-plata', 'samana', 'sosua', 'cabarete', 'las-terrenas',
    'distrito-nacional', 'santo-domingo-norte', 'santo-domingo-este',
    // Sectores comunes
    'naco', 'piantini', 'bella-vista', 'evaristo-morales', 'gazcue',
    'los-cacicazgos', 'ensanche-serralles', 'la-julia', 'paraiso',
  ];

  if (commonSlugs.includes(slugLower)) {
    return false;
  }

  // Si tiene números, probablemente es una propiedad
  if (/\d/.test(slug)) {
    return true;
  }

  // Si es largo (más de 20 caracteres), probablemente es una propiedad
  if (slug.length > 20) {
    return true;
  }

  // Si contiene palabras clave de propiedades
  const propertyKeywords = [
    'venta', 'alquiler', 'en-venta', 'en-alquiler',
    'apartamento-en', 'casa-en', 'villa-en', 'penthouse-en',
    'habitaciones', 'banos', 'parqueos', 'piscina',
    'vista-al-mar', 'frente-al-mar', 'proyecto',
  ];

  for (const keyword of propertyKeywords) {
    if (slugLower.includes(keyword)) {
      return true;
    }
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
// ENRICH RESPONSE - Agrega globalConfig, country y hreflang a TODAS las respuestas
// ============================================================================

function enrichResponse(
  response: any,
  tenant: TenantConfig,
  language: string,
  trackingString: string,
  pathname: string
): any {
  // Usar el sistema centralizado de idiomas para generar hreflang
  const languageData = utils.processLanguageData(pathname, language);

  return {
    ...response,
    globalConfig: buildGlobalConfig(tenant, language),
    country: buildCountryData(tenant),
    countryConfig: buildCountryConfig(tenant),
    language,
    trackingString,
    // NUEVO: Datos centralizados de idioma y hreflang
    hreflangData: languageData.hreflangUrls,
    canonicalPath: languageData.canonicalPath,
    currentLanguage: languageData.currentLanguage
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
