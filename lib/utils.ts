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
  // Prioridad: venta > alquiler > alquiler temporal > amueblado
  if (property.precio_venta && property.precio_venta > 0) {
    return {
      type: 'sale',
      amount: property.precio_venta,
      currency: property.moneda_venta || 'USD',
      display: formatPrice(property.precio_venta, property.moneda_venta || 'USD', 'sale', language)
    };
  }

  if (property.precio_alquiler && property.precio_alquiler > 0) {
    return {
      type: 'rental',
      amount: property.precio_alquiler,
      currency: property.moneda_alquiler || 'USD',
      display: formatPrice(property.precio_alquiler, property.moneda_alquiler || 'USD', 'rental', language)
    };
  }

  if (property.precio_alquiler_temporal && property.precio_alquiler_temporal > 0) {
    return {
      type: 'temp_rental',
      amount: property.precio_alquiler_temporal,
      currency: property.moneda_alquiler_temporal || 'USD',
      display: formatPrice(property.precio_alquiler_temporal, property.moneda_alquiler_temporal || 'USD', 'temp_rental', language)
    };
  }

  if (property.precio_alquiler_amueblado && property.precio_alquiler_amueblado > 0) {
    return {
      type: 'furnished_rental',
      amount: property.precio_alquiler_amueblado,
      currency: property.moneda_alquiler_amueblado || 'USD',
      display: formatPrice(property.precio_alquiler_amueblado, property.moneda_alquiler_amueblado || 'USD', 'furnished_rental', language)
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
  let url = basePath || '/';

  // Agregar prefijo de idioma si no es español
  if (language !== 'es' && language) {
    url = `/${language}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  // Asegurar barra inicial
  if (!url.startsWith('/')) {
    url = `/${url}`;
  }

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
    hreflang: canonicalUrl ? {
      es: canonicalUrl,
      en: canonicalUrl.replace(/^\//, '/en/'),
      fr: canonicalUrl.replace(/^\//, '/fr/')
    } : undefined
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
  safeArray,
  safeString,
  safeNumber,
  slugify,
  detectLanguageFromPath,
  extractTrackingString,
  formatTestimonial,
  formatTestimonials
};
