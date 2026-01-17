// api/lib/utils.ts
// Utilidades comunes para las Edge Functions

import type {
  MultilingualText,
  PropertyPrice,
  PropertyCard,
  Property,
  SEOData,
  LocationHierarchy
} from '../types';

// ============================================================================
// MANEJO DE IDIOMAS Y TRADUCCIONES
// ============================================================================

export const SUPPORTED_LANGUAGES = ['es', 'en', 'fr'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

// ============================================================================
// MAPA DE TRADUCCIÓN DE RUTAS
// Cada clave es el slug en español, los valores son las traducciones
// ============================================================================
export const ROUTE_TRANSLATIONS: Record<string, Record<string, string>> = {
  // Páginas principales
  'vender': { es: 'vender', en: 'sell', fr: 'vendre' },
  'comprar': { es: 'comprar', en: 'buy', fr: 'acheter' },
  'alquilar': { es: 'alquilar', en: 'rent', fr: 'louer' },

  // Asesores
  'asesores': { es: 'asesores', en: 'advisors', fr: 'conseillers' },

  // Favoritos y propuestas
  'favoritos': { es: 'favoritos', en: 'favorites', fr: 'favoris' },
  'propuestas': { es: 'propuestas', en: 'proposals', fr: 'propositions' },

  // Contenido
  'testimonios': { es: 'testimonios', en: 'testimonials', fr: 'temoignages' },
  'articulos': { es: 'articulos', en: 'articles', fr: 'articles' },
  'videos': { es: 'videos', en: 'videos', fr: 'videos' },

  // Contacto
  'contacto': { es: 'contacto', en: 'contact', fr: 'contact' },

  // Rentas vacacionales
  'rentas-vacacionales': { es: 'rentas-vacacionales', en: 'vacation-rentals', fr: 'locations-vacances' },

  // Listados curados
  'listados-de': { es: 'listados-de', en: 'listings-of', fr: 'listes-de' },

  // Ubicaciones y tipos
  'ubicaciones': { es: 'ubicaciones', en: 'locations', fr: 'emplacements' },
  'propiedades': { es: 'propiedades', en: 'properties', fr: 'proprietes' },
  'tipos-de-propiedad': { es: 'tipos-de-propiedad', en: 'property-types', fr: 'types-de-proprietes' },

  // Legales (versiones largas y cortas)
  'terminos-y-condiciones': { es: 'terminos', en: 'terms', fr: 'termes' },
  'terminos': { es: 'terminos', en: 'terms', fr: 'termes' },
  'politicas-de-privacidad': { es: 'privacidad', en: 'privacy', fr: 'confidentialite' },
  'privacidad': { es: 'privacidad', en: 'privacy', fr: 'confidentialite' },
  // Alias en inglés y francés
  'terms-and-conditions': { es: 'terminos', en: 'terms', fr: 'termes' },
  'terms': { es: 'terminos', en: 'terms', fr: 'termes' },
  'privacy-policy': { es: 'privacidad', en: 'privacy', fr: 'confidentialite' },
  'privacy': { es: 'privacidad', en: 'privacy', fr: 'confidentialite' },
  'termes-et-conditions': { es: 'terminos', en: 'terms', fr: 'termes' },
  'termes': { es: 'terminos', en: 'terms', fr: 'termes' },
  'politique-de-confidentialite': { es: 'privacidad', en: 'privacy', fr: 'confidentialite' },
  'confidentialite': { es: 'privacidad', en: 'privacy', fr: 'confidentialite' },

  // FAQs
  'faqs': { es: 'faqs', en: 'faqs', fr: 'faqs' },
};

// Mapa inverso: dado un slug en cualquier idioma, obtener el slug base (español)
export const ROUTE_SLUG_TO_BASE: Record<string, string> = {};

// Construir el mapa inverso
Object.entries(ROUTE_TRANSLATIONS).forEach(([baseSlug, translations]) => {
  Object.values(translations).forEach(translatedSlug => {
    ROUTE_SLUG_TO_BASE[translatedSlug] = baseSlug;
  });
});

export function getLocalizedText(
  text: MultilingualText | string | null | undefined,
  language: string
): string {
  if (!text) return '';
  if (typeof text === 'string') return text;

  switch (language) {
    case 'en': return text.en || text.es || '';
    case 'fr': return text.fr || text.es || '';
    default: return text.es || '';
  }
}

export function getTranslatedField(
  item: Record<string, any>,
  baseField: string,
  language: string
): string {
  if (language === 'en' && item[`${baseField}_en`]) {
    return item[`${baseField}_en`];
  }
  if (language === 'fr' && item[`${baseField}_fr`]) {
    return item[`${baseField}_fr`];
  }
  return item[baseField] || '';
}

// Procesar campo de traducciones JSONB de Neon
export function processTranslations(
  item: Record<string, any>,
  language: string
): Record<string, any> {
  const traducciones = item.traducciones;
  if (!traducciones) return item;

  try {
    const translations = typeof traducciones === 'string'
      ? JSON.parse(traducciones)
      : traducciones;

    if (translations[language]) {
      return { ...item, ...translations[language] };
    }
  } catch (e) {
    console.warn('Error parsing translations:', e);
  }

  return item;
}

// ============================================================================
// FORMATEO DE PRECIOS
// ============================================================================

const CURRENCY_FORMATTERS: Record<string, Record<string, Intl.NumberFormat>> = {};

function getCurrencyFormatter(currency: string, locale: string): Intl.NumberFormat {
  const key = `${currency}-${locale}`;
  if (!CURRENCY_FORMATTERS[key]) {
    CURRENCY_FORMATTERS[key] = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  }
  return CURRENCY_FORMATTERS[key];
}

export function formatPrice(
  amount: number,
  currency: string,
  type: 'sale' | 'rental' | 'temp_rental' | 'furnished_rental' | 'venta' | 'alquiler' | string = 'sale',
  language: string = 'es'
): string {
  // Normalizar tipo
  if (type === 'venta') type = 'sale';
  if (type === 'alquiler') type = 'rental';
  if (!amount || amount <= 0) {
    const texts = {
      es: 'Consultar precio',
      en: 'Price on request',
      fr: 'Prix sur demande'
    };
    return texts[language as keyof typeof texts] || texts.es;
  }

  const locales: Record<string, string> = {
    es: 'es-DO',
    en: 'en-US',
    fr: 'fr-FR'
  };

  const formatter = getCurrencyFormatter(currency, locales[language] || 'es-DO');
  const formatted = formatter.format(amount);

  if (type !== 'sale') {
    const suffixes: Record<string, Record<string, string>> = {
      rental: { es: '/mes', en: '/mo', fr: '/mois' },
      temp_rental: { es: '/día', en: '/day', fr: '/jour' },
      furnished_rental: { es: '/mes', en: '/mo', fr: '/mois' }
    };
    return `${formatted}${suffixes[type][language] || suffixes[type].es}`;
  }

  return formatted;
}

export function buildPriceDisplay(property: Record<string, any>, language: string): PropertyPrice {
  // Usar moneda única del schema (no hay moneda_venta/moneda_alquiler separadas)
  const currency = property.moneda || 'USD';

  // Prioridad: venta > alquiler > alquiler temporal > amueblado
  if (property.precio_venta && property.precio_venta > 0) {
    return {
      type: 'sale',
      amount: property.precio_venta,
      currency: currency,
      display: formatPrice(property.precio_venta, currency, 'sale', language)
    };
  }

  if (property.precio_alquiler && property.precio_alquiler > 0) {
    return {
      type: 'rental',
      amount: property.precio_alquiler,
      currency: currency,
      display: formatPrice(property.precio_alquiler, currency, 'rental', language)
    };
  }

  if (property.precio_alquiler_temporal && property.precio_alquiler_temporal > 0) {
    return {
      type: 'temp_rental',
      amount: property.precio_alquiler_temporal,
      currency: currency,
      display: formatPrice(property.precio_alquiler_temporal, currency, 'temp_rental', language)
    };
  }

  if (property.precio_alquiler_amueblado && property.precio_alquiler_amueblado > 0) {
    return {
      type: 'furnished_rental',
      amount: property.precio_alquiler_amueblado,
      currency: currency,
      display: formatPrice(property.precio_alquiler_amueblado, currency, 'furnished_rental', language)
    };
  }

  // Fallback
  return {
    type: 'sale',
    amount: 0,
    currency: 'USD',
    display: formatPrice(0, 'USD', 'sale', language)
  };
}

// ============================================================================
// PROCESAMIENTO DE IMÁGENES
// ============================================================================

const FALLBACK_IMAGE = 'https://via.placeholder.com/400x300/e5e7eb/9ca3af?text=Sin+Imagen';

export function processImages(
  mainImage: string | null | undefined,
  gallery: string | string[] | null | undefined
): { main_image: string; images: Array<{ url: string; is_main: boolean; order: number }> } {
  const main = mainImage?.trim() || FALLBACK_IMAGE;
  let galleryImages: string[] = [];

  if (gallery) {
    if (Array.isArray(gallery)) {
      galleryImages = gallery.filter(img => img && typeof img === 'string' && img.trim());
    } else if (typeof gallery === 'string') {
      try {
        const parsed = JSON.parse(gallery);
        if (Array.isArray(parsed)) {
          galleryImages = parsed.filter(img => img && typeof img === 'string');
        }
      } catch {
        galleryImages = gallery.split(',').map(s => s.trim()).filter(Boolean);
      }
    }
  }

  // Combinar sin duplicados
  const allImages = [main, ...galleryImages.filter(img => img !== main)];

  return {
    main_image: main,
    images: allImages.map((url, index) => ({
      url,
      is_main: index === 0,
      order: index
    }))
  };
}

// ============================================================================
// CONSTRUCCIÓN DE URLS
// ============================================================================

export function buildUrl(
  basePath: string,
  language: string,
  trackingString?: string
): string {
  if (!basePath || basePath === '/') {
    // Homepage
    const url = language === 'es' ? '/' : `/${language}`;
    return url + (trackingString || '');
  }

  // Usar translatePath para obtener la URL correcta con slug traducido
  let url = translatePath(basePath, language);

  // Limpiar barras dobles
  url = url.replace(/\/+/g, '/');

  // Agregar tracking string
  return url + (trackingString || '');
}

export function buildPropertyUrl(
  property: Record<string, any>,
  language: string,
  trackingString?: string
): string {
  // Construir URL base según la operación
  const hasVenta = property.precio_venta && property.precio_venta > 0;
  const operation = hasVenta ? 'comprar' : 'alquilar';

  const operationSlugs: Record<string, Record<string, string>> = {
    comprar: { es: 'comprar', en: 'buy', fr: 'acheter' },
    alquilar: { es: 'alquilar', en: 'rent', fr: 'louer' }
  };

  const opSlug = operationSlugs[operation][language] || operationSlugs[operation].es;
  const catSlug = property.categoria_slug || 'propiedad';
  const locSlug = property.sector_slug || property.ciudad_slug || '';
  const propSlug = property.slug;

  let path = `/${opSlug}`;
  if (catSlug) path += `/${catSlug}`;
  if (locSlug) path += `/${locSlug}`;
  path += `/${propSlug}`;

  return buildUrl(path, language, trackingString);
}

// ============================================================================
// PROCESAMIENTO DE UBICACIÓN
// ============================================================================

export function buildLocationHierarchy(property: Record<string, any>): LocationHierarchy {
  const hierarchy: LocationHierarchy = {};

  if (property.sector_nombre || property.sector_slug) {
    hierarchy.sector = {
      id: property.sector_id,
      slug: property.sector_slug,
      name: property.sector_nombre,
      type: 'sector'
    };
  }

  if (property.ciudad_nombre || property.ciudad_slug) {
    hierarchy.city = {
      id: property.ciudad_id,
      slug: property.ciudad_slug,
      name: property.ciudad_nombre,
      type: 'ciudad'
    };
  }

  if (property.provincia_nombre || property.provincia_slug) {
    hierarchy.province = {
      id: property.provincia_id,
      slug: property.provincia_slug,
      name: property.provincia_nombre,
      type: 'provincia'
    };
  }

  return hierarchy;
}

export function buildLocationDisplay(hierarchy: LocationHierarchy): string {
  const parts: string[] = [];

  if (hierarchy.sector?.name) parts.push(hierarchy.sector.name);
  if (hierarchy.city?.name) parts.push(hierarchy.city.name);
  if (hierarchy.province?.name && !hierarchy.city?.name) parts.push(hierarchy.province.name);

  return parts.join(', ') || 'Ubicación no disponible';
}

export function parseCoordinates(coordsString: string | null | undefined): { lat: number; lng: number } | null {
  if (!coordsString) return null;

  try {
    // Formato PostgreSQL: (lat,lng) o POINT(lng lat)
    const cleaned = coordsString.replace(/[()POINT\s]/gi, '').trim();
    const parts = cleaned.split(',');

    if (parts.length === 2) {
      const lat = parseFloat(parts[0].trim());
      const lng = parseFloat(parts[1].trim());

      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat, lng };
      }
    }
  } catch (e) {
    console.warn('Error parsing coordinates:', e);
  }

  return null;
}

// ============================================================================
// CONVERSIÓN A PROPERTY CARD (versión ligera para listados)
// ============================================================================

export function toPropertyCard(
  property: Record<string, any>,
  language: string,
  trackingString?: string
): PropertyCard {
  const processedProperty = processTranslations(property, language);
  const priceDisplay = buildPriceDisplay(processedProperty, language);
  const locationHierarchy = buildLocationHierarchy(processedProperty);
  const { main_image } = processImages(processedProperty.imagen_principal, processedProperty.galeria_imagenes);

  // Determinar texto de operación
  const operationTexts: Record<string, Record<string, string>> = {
    sale: { es: 'En Venta', en: 'For Sale', fr: 'À Vendre' },
    rental: { es: 'En Alquiler', en: 'For Rent', fr: 'À Louer' },
    temp_rental: { es: 'Alquiler Temporal', en: 'Short Term', fr: 'Location Courte' },
    furnished_rental: { es: 'Amueblado', en: 'Furnished', fr: 'Meublé' }
  };

  return {
    id: processedProperty.id,
    slug: processedProperty.slug,
    title: getTranslatedField(processedProperty, 'titulo', language) || processedProperty.titulo,
    location_display: buildLocationDisplay(locationHierarchy),
    main_image,
    price_display: priceDisplay.display,
    operation_display: operationTexts[priceDisplay.type][language] || operationTexts[priceDisplay.type].es,
    features: {
      bedrooms: processedProperty.habitaciones || 0,
      bathrooms: processedProperty.banos || 0,
      area: processedProperty.area_construida || processedProperty.area_total || 0
    },
    amenity_badges: [], // Se llena después si es necesario
    url: buildPropertyUrl(processedProperty, language, trackingString),
    is_featured: processedProperty.destacada || false,
    is_new: isNewProperty(processedProperty.created_at)
  };
}

function isNewProperty(createdAt: string | Date | null): boolean {
  if (!createdAt) return false;
  const created = new Date(createdAt);
  const now = new Date();
  const diffDays = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays <= 30; // Nuevo si fue creado en los últimos 30 días
}

// ============================================================================
// GENERACIÓN DE SEO
// ============================================================================

/**
 * Traduce un segmento de ruta al idioma destino
 * Ejemplo: translateRouteSegment('sell', 'es') => 'vender'
 * Ejemplo: translateRouteSegment('vender', 'en') => 'sell'
 */
export function translateRouteSegment(segment: string, toLang: string): string {
  // Buscar el slug base (español) para este segmento
  const baseSlug = ROUTE_SLUG_TO_BASE[segment];

  if (baseSlug && ROUTE_TRANSLATIONS[baseSlug]) {
    // Tenemos traducción, retornar la versión en el idioma destino
    return ROUTE_TRANSLATIONS[baseSlug][toLang] || segment;
  }

  // No hay traducción, retornar el segmento original
  return segment;
}

/**
 * Detecta el idioma de un pathname basándose en el prefijo
 * @param pathname - Path de la URL (e.g., '/en/sell', '/vender', '/fr/acheter')
 * @returns El idioma detectado ('es', 'en', 'fr')
 */
export function detectLanguageFromPathname(pathname: string): SupportedLanguage {
  if (!pathname) return 'es';

  // Limpiar el pathname
  const cleanPath = pathname.startsWith('/') ? pathname : `/${pathname}`;

  // Verificar prefijos de idioma
  if (cleanPath.startsWith('/en/') || cleanPath === '/en') return 'en';
  if (cleanPath.startsWith('/fr/') || cleanPath === '/fr') return 'fr';

  return 'es';
}

/**
 * Remueve el prefijo de idioma de un pathname
 * @param pathname - Path completo (e.g., '/en/sell', '/fr/vendre')
 * @returns Path sin prefijo de idioma (e.g., '/sell', '/vendre')
 */
export function removeLanguagePrefix(pathname: string): string {
  if (!pathname) return '/';

  // Remover prefijos de idioma conocidos
  let cleanPath = pathname
    .replace(/^\/(en|fr)\//, '/')  // /en/xxx -> /xxx
    .replace(/^\/(en|fr)$/, '/');   // /en or /fr alone -> /

  // Asegurar que empiece con /
  if (!cleanPath.startsWith('/')) {
    cleanPath = '/' + cleanPath;
  }

  return cleanPath;
}

/**
 * Traduce un path completo de un idioma a otro
 * CENTRALIZADO: Esta función es la ÚNICA que debe usarse para traducir paths
 *
 * @param pathname - Path de la URL (puede tener o no prefijo de idioma)
 * @param targetLang - Idioma destino ('es', 'en', 'fr')
 * @returns Path traducido con prefijo correcto (relativo, sin dominio)
 *
 * Ejemplos:
 *   translatePath('/en/sell', 'es') => '/vender'
 *   translatePath('/vender', 'en') => '/en/sell'
 *   translatePath('/fr/acheter/apartamento', 'es') => '/comprar/apartamento'
 *   translatePath('/', 'en') => '/en'
 */
export function translatePath(pathname: string, targetLang: string): string {
  // Caso especial: pathname vacío o solo /
  if (!pathname || pathname === '/' || pathname === '') {
    return targetLang === 'es' ? '/' : `/${targetLang}`;
  }

  // 1. Primero remover CUALQUIER prefijo de idioma existente
  let cleanPath = removeLanguagePrefix(pathname);

  // 2. Si el path quedó vacío después de remover prefijo, es homepage
  if (cleanPath === '' || cleanPath === '/') {
    return targetLang === 'es' ? '/' : `/${targetLang}`;
  }

  // 3. Dividir en segmentos
  const segments = cleanPath.split('/').filter(s => s && s.length > 0);

  if (segments.length === 0) {
    return targetLang === 'es' ? '/' : `/${targetLang}`;
  }

  // 4. Traducir segmentos
  const translatedSegments = segments.map((segment, index) => {
    // Solo traducir el primer segmento (la ruta principal como 'vender', 'comprar', etc.)
    // Los demás segmentos (categorías, ubicaciones, slugs de propiedad) se mantienen igual
    if (index === 0) {
      return translateRouteSegment(segment, targetLang);
    }
    return segment;
  });

  // 5. Reconstruir el path
  const translatedPath = '/' + translatedSegments.join('/');

  // 6. Agregar prefijo de idioma si no es español
  if (targetLang === 'es') {
    return translatedPath;
  }

  // Para otros idiomas, agregar prefijo SIN duplicación
  return `/${targetLang}${translatedPath}`;
}

// Tipo para hreflang URLs
export type HreflangUrls = {
  es: string;
  en?: string;
  fr?: string;
  'x-default'?: string;
};

/**
 * ============================================================================
 * GENERADOR CENTRALIZADO DE HREFLANG
 * ============================================================================
 *
 * Esta es la ÚNICA función que debe usarse para generar URLs de hreflang.
 * Garantiza:
 *   - URLs relativas (sin dominio)
 *   - Sin duplicación de prefijos de idioma
 *   - Traducción correcta de slugs de ruta
 *   - Consistencia en toda la aplicación
 *
 * @param pathname - Path de la URL actual (con o sin prefijo de idioma)
 * @returns Objeto con URLs por idioma, todas relativas
 *
 * Ejemplos:
 *   generateHreflangUrls('/vender')
 *   => { es: '/vender', en: '/en/sell', fr: '/fr/vendre', 'x-default': '/vender' }
 *
 *   generateHreflangUrls('/en/sell')
 *   => { es: '/vender', en: '/en/sell', fr: '/fr/vendre', 'x-default': '/vender' }
 *
 *   generateHreflangUrls('/fr/acheter/apartamento/zona-colonial')
 *   => { es: '/comprar/apartamento/zona-colonial', en: '/en/buy/apartamento/zona-colonial', ... }
 */
export function generateHreflangUrls(pathname: string): HreflangUrls {
  // Caso: pathname vacío o root
  if (!pathname || pathname === '/' || pathname === '') {
    return {
      es: '/',
      en: '/en',
      fr: '/fr',
      'x-default': '/'
    };
  }

  // Limpiar el pathname de cualquier duplicación previa
  let cleanPathname = pathname;

  // Prevenir duplicación: si ya tiene múltiples prefijos de idioma, limpiar
  // Ejemplo: /en/fr/vendre -> limpiar a /vendre
  const multiLangMatch = cleanPathname.match(/^\/(en|fr)\/(en|fr)\//);
  if (multiLangMatch) {
    cleanPathname = cleanPathname.replace(/^\/(en|fr)\/(en|fr)\//, '/');
    console.warn(`[generateHreflangUrls] Corregida duplicación de prefijos en: ${pathname}`);
  }

  // Generar URLs traducidas para cada idioma usando translatePath
  const esUrl = translatePath(cleanPathname, 'es');
  const enUrl = translatePath(cleanPathname, 'en');
  const frUrl = translatePath(cleanPathname, 'fr');

  // Validación: asegurar que no haya duplicación de prefijos
  const validateUrl = (url: string, lang: string): string => {
    // Verificar que no haya prefijos duplicados
    if (lang !== 'es' && url.match(new RegExp(`^/${lang}/${lang}/`))) {
      return url.replace(new RegExp(`^/${lang}/${lang}/`), `/${lang}/`);
    }
    return url;
  };

  return {
    es: esUrl,
    en: validateUrl(enUrl, 'en'),
    fr: validateUrl(frUrl, 'fr'),
    'x-default': esUrl  // Default siempre es español
  };
}

/**
 * ============================================================================
 * PROCESADOR CENTRALIZADO DE IDIOMA Y HREFLANG PARA RESPUESTAS API
 * ============================================================================
 *
 * Esta función se usa en enrichResponse para agregar datos de idioma y hreflang
 * de forma consistente a TODAS las respuestas de la API.
 *
 * @param pathname - Path actual de la solicitud
 * @param language - Idioma detectado
 * @returns Objeto con información de idioma y hreflang
 */
export function processLanguageData(pathname: string, language: string): {
  currentLanguage: string;
  hreflangUrls: HreflangUrls;
  canonicalPath: string;
} {
  // Generar hreflang URLs
  const hreflangUrls = generateHreflangUrls(pathname);

  // La URL canónica es la del idioma actual
  const canonicalPath = hreflangUrls[language as keyof HreflangUrls] || hreflangUrls.es;

  return {
    currentLanguage: language,
    hreflangUrls,
    canonicalPath
  };
}

export function generateSEO(options: {
  title: string;
  description: string;
  keywords?: string;
  canonicalUrl?: string;
  ogImage?: string;
  language?: string;
  type?: string;
  siteName?: string;
}): SEOData {
  const {
    title,
    description,
    keywords,
    canonicalUrl,
    ogImage,
    language = 'es',
    type = 'website',
    siteName = 'CLIC Inmobiliaria'
  } = options;

  // Generar hreflang correctamente usando la nueva función
  const hreflang = canonicalUrl ? generateHreflangUrls(canonicalUrl) : undefined;

  return {
    title,
    description: description.substring(0, 160), // Limitar a 160 caracteres
    keywords,
    canonical_url: canonicalUrl,
    og_image: ogImage,
    structured_data: {
      '@context': 'https://schema.org',
      '@type': type === 'property' ? 'RealEstateListing' : 'WebPage',
      name: title,
      description,
      ...(canonicalUrl && { url: canonicalUrl }),
      ...(ogImage && { image: ogImage })
    },
    hreflang
  };
}

// ============================================================================
// UTILIDADES GENERALES
// ============================================================================

export function safeArray<T>(input: T[] | null | undefined): T[] {
  return Array.isArray(input) ? input : [];
}

export function safeString(input: string | null | undefined, defaultValue: string = ''): string {
  return typeof input === 'string' ? input : defaultValue;
}

export function safeNumber(input: number | string | null | undefined, defaultValue: number = 0): number {
  const num = typeof input === 'string' ? parseFloat(input) : input;
  return typeof num === 'number' && !isNaN(num) ? num : defaultValue;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remover acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Detectar idioma desde la URL
export function detectLanguageFromPath(pathname: string): SupportedLanguage {
  const segments = pathname.split('/').filter(Boolean);
  const firstSegment = segments[0];

  if (firstSegment && SUPPORTED_LANGUAGES.includes(firstSegment as SupportedLanguage)) {
    return firstSegment as SupportedLanguage;
  }

  return 'es';
}

// Parsear tracking string de query params
export function extractTrackingString(searchParams: URLSearchParams): string {
  const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'gclid', 'fbclid'];
  const params: string[] = [];

  trackingParams.forEach(param => {
    const value = searchParams.get(param);
    if (value) {
      params.push(`${param}=${encodeURIComponent(value)}`);
    }
  });

  return params.length > 0 ? `?${params.join('&')}` : '';
}

// ============================================================================
// FORMATO UNIFICADO DE TESTIMONIOS
// ============================================================================

/**
 * Interfaz unificada para testimonios.
 * Todos los handlers deben usar este formato para consistencia en el frontend.
 */
export interface UnifiedTestimonial {
  id: string;
  // Contenido del testimonio
  content: string;
  excerpt: string;
  full_testimonial: string;
  subtitle: string;
  // Rating (número entre 1-5)
  rating: number;
  // Título opcional
  title: string | null;
  // Información del cliente (ambos formatos: snake_case y camelCase)
  client_name: string;
  clientName: string;
  client_photo: string | null;
  clientAvatar: string | null;
  client_avatar: string | null;
  client_location: string | null;
  clientLocation: string | null;
  transaction_location: string | null;
  transactionLocation: string | null;
  client_profession: string | null;
  clientProfession: string | null;
  // Metadata
  featured: boolean;
  is_featured: boolean;
  client_verified: boolean;
  clientVerified: boolean;
  published_at: string | null;
  publishedAt: string | null;
  // URL y slug para enlaces
  url: string | null;
  slug: string;
  // Campos para página de testimonios
  category: string;
  views: string;
  readTime: string;
  status: 'approved' | 'pending' | 'rejected';
  agent: {
    name: string;
    avatar: string;
    slug: string;
    position: string;
  };
}

/**
 * Formatea un testimonio crudo de la base de datos al formato unificado.
 * Esta función debe usarse en TODOS los handlers para garantizar consistencia.
 *
 * @param rawTestimonial - Testimonio crudo de la base de datos
 * @param language - Idioma actual ('es', 'en', 'fr')
 * @param options - Opciones adicionales
 * @returns Testimonio formateado
 */
export function formatTestimonial(
  rawTestimonial: Record<string, any>,
  language: string,
  options: {
    trackingString?: string;
    categorySlug?: string;
    baseUrl?: string;
  } = {}
): UnifiedTestimonial {
  const { trackingString = '', categorySlug = 'compradores', baseUrl = '/testimonios' } = options;

  // Extraer contenido según idioma
  let contentText = '';
  if (typeof rawTestimonial.content === 'string') {
    contentText = rawTestimonial.content;
  } else if (rawTestimonial.content && typeof rawTestimonial.content === 'object') {
    contentText = rawTestimonial.content[language] ||
                  rawTestimonial.content.es ||
                  rawTestimonial.content.en ||
                  Object.values(rawTestimonial.content)[0] as string || '';
  }

  // Verificar traducciones si no hay contenido
  if (!contentText && rawTestimonial.translations) {
    try {
      const translations = typeof rawTestimonial.translations === 'string'
        ? JSON.parse(rawTestimonial.translations)
        : rawTestimonial.translations;
      contentText = translations?.contenido?.[language] ||
                    translations?.contenido?.es ||
                    translations?.content?.[language] || '';
    } catch {
      // Ignorar errores de parsing
    }
  }

  // Generar excerpt (primeros 150 caracteres)
  const excerpt = contentText.length > 150
    ? contentText.substring(0, 150) + '...'
    : contentText;

  // Generar título si no existe
  const rating = parseFloat(rawTestimonial.rating) || 5;
  const defaultTitle = rating >= 5
    ? (language === 'en' ? 'Excellent experience' : language === 'fr' ? 'Excellente expérience' : 'Excelente experiencia')
    : rating >= 4
    ? (language === 'en' ? 'Very good experience' : language === 'fr' ? 'Très bonne expérience' : 'Muy buena experiencia')
    : (language === 'en' ? 'Good experience' : language === 'fr' ? 'Bonne expérience' : 'Buena experiencia');

  // Generar slug
  const testimonialSlug = rawTestimonial.slug || `testimonio-${rawTestimonial.id?.substring(0, 8) || 'default'}`;

  // Construir URL
  const langPrefix = language === 'es' ? '' : `/${language}`;
  const testimonialBaseUrl = language === 'en' ? '/testimonials' : language === 'fr' ? '/temoignages' : '/testimonios';
  const url = `${langPrefix}${testimonialBaseUrl}/${categorySlug}/${testimonialSlug}${trackingString}`;

  // Datos del cliente
  const clientName = rawTestimonial.client_name || 'Cliente';
  const clientPhoto = rawTestimonial.client_photo || null;
  const clientLocation = rawTestimonial.client_location || null;
  const isFeatured = rawTestimonial.is_featured || rawTestimonial.featured || false;

  return {
    id: rawTestimonial.id,
    // Contenido
    content: contentText,
    excerpt: excerpt,
    full_testimonial: contentText,
    subtitle: '',
    // Rating
    rating: Math.round(rating),
    // Título
    title: rawTestimonial.title || defaultTitle,
    // Cliente - snake_case
    client_name: clientName,
    client_photo: clientPhoto,
    client_avatar: clientPhoto,
    client_location: clientLocation,
    transaction_location: clientLocation,
    transactionLocation: clientLocation,
    client_profession: rawTestimonial.client_profession || null,
    // Cliente - camelCase (para compatibilidad con diferentes componentes)
    clientName: clientName,
    clientAvatar: clientPhoto,
    clientLocation: clientLocation,
    clientProfession: rawTestimonial.client_profession || null,
    // Metadata
    featured: isFeatured,
    is_featured: isFeatured,
    client_verified: isFeatured,
    clientVerified: isFeatured,
    published_at: rawTestimonial.created_at || rawTestimonial.fecha || null,
    publishedAt: rawTestimonial.created_at || rawTestimonial.fecha || null,
    // URL y slug
    url: url,
    slug: testimonialSlug,
    // Campos para página de testimonios
    category: categorySlug,
    views: '0',
    readTime: '2 min',
    status: 'approved' as const,
    agent: {
      name: 'Equipo CLIC',
      avatar: '',
      slug: '',
      position: 'Asesor Inmobiliario'
    }
  };
}

/**
 * Formatea múltiples testimonios al formato unificado.
 */
export function formatTestimonials(
  rawTestimonials: Record<string, any>[],
  language: string,
  options: {
    trackingString?: string;
    categorySlug?: string;
    baseUrl?: string;
  } = {}
): UnifiedTestimonial[] {
  return rawTestimonials.map(t => formatTestimonial(t, language, options));
}

export default {
  getLocalizedText,
  getTranslatedField,
  processTranslations,
  formatPrice,
  buildPriceDisplay,
  processImages,
  buildUrl,
  buildPropertyUrl,
  buildLocationHierarchy,
  buildLocationDisplay,
  parseCoordinates,
  toPropertyCard,
  generateSEO,
  // Sistema centralizado de idiomas
  generateHreflangUrls,
  translatePath,
  translateRouteSegment,
  detectLanguageFromPathname,
  removeLanguagePrefix,
  processLanguageData,
  // Utilidades generales
  safeArray,
  safeString,
  safeNumber,
  slugify,
  detectLanguageFromPath,
  extractTrackingString,
  formatTestimonial,
  formatTestimonials
};
