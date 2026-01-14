// src/types/api.ts
// Tipos TypeScript para la estructura de datos normalizada de las APIs
// Compatible con Neon PostgreSQL y Vercel Edge Functions

// ============================================================================
// TIPOS BASE - Comunes a todas las entidades
// ============================================================================

export interface BaseEntity {
  id: number;
  created_at: string;
  updated_at: string;
  tenant_id?: number;
}

export interface MultilingualText {
  es: string;
  en?: string;
  fr?: string;
}

export interface SEOData {
  title: string;
  description: string;
  keywords?: string;
  canonical_url?: string;
  og_image?: string;
  structured_data?: Record<string, any>;
  hreflang?: {
    es: string;
    en?: string;
    fr?: string;
  };
}

// ============================================================================
// UBICACIONES - Estructura jerárquica normalizada
// ============================================================================

export interface Location {
  id: number;
  slug: string;
  name: string;
  name_en?: string;
  name_fr?: string;
  type: 'pais' | 'provincia' | 'ciudad' | 'sector';
  parent_id?: number;
  coordinates?: {
    lat: number;
    lng: number;
  };
  // Datos calculados/denormalizados para eficiencia
  full_path?: string; // "Sector, Ciudad, Provincia"
  property_count?: number;
}

export interface LocationHierarchy {
  country?: Location;
  province?: Location;
  city?: Location;
  sector?: Location;
}

// ============================================================================
// PROPIEDADES - Estructura normalizada
// ============================================================================

export interface PropertyImage {
  url: string;
  alt?: string;
  is_main: boolean;
  order: number;
}

export interface PropertyPrice {
  type: 'sale' | 'rental' | 'temp_rental' | 'furnished_rental';
  amount: number;
  currency: 'USD' | 'DOP' | 'EUR';
  display: string; // Precio formateado para mostrar
}

export interface PropertyFeatures {
  bedrooms: number;
  bathrooms: number;
  half_bathrooms: number;
  parking_spaces: number;
  area_construction: number;
  area_total: number;
  floor?: number;
  year_built?: number;
}

export interface PropertyAmenity {
  id: number;
  name: string;
  name_en?: string;
  name_fr?: string;
  icon?: string;
  category?: string;
}

export interface PropertyAgent {
  id: number;
  slug: string;
  full_name: string;
  photo_url?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  is_main: boolean;
}

export interface Property extends BaseEntity {
  slug: string;
  code?: string;

  // Contenido multilingüe
  title: MultilingualText;
  description: MultilingualText;

  // Ubicación normalizada
  location: LocationHierarchy;
  address?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };

  // Categorización
  category: {
    id: number;
    slug: string;
    name: string;
    name_en?: string;
    name_fr?: string;
  };

  operation_type: 'venta' | 'alquiler' | 'ambos';

  // Precios (pueden ser múltiples)
  prices: PropertyPrice[];
  primary_price: PropertyPrice; // Precio principal para mostrar

  // Características
  features: PropertyFeatures;

  // Imágenes procesadas
  images: PropertyImage[];
  main_image: string;

  // Amenidades
  amenities: PropertyAmenity[];
  amenity_badges: Array<{
    text: string;
    icon?: string;
    category?: string;
  }>;

  // Agentes
  agents: PropertyAgent[];
  main_agent?: PropertyAgent;

  // Proyecto asociado (si aplica)
  project?: {
    id: number;
    slug: string;
    name: string;
    image?: string;
  };

  // Estados
  status: 'disponible' | 'reservado' | 'vendido' | 'alquilado' | 'inactivo';
  is_featured: boolean;
  is_project: boolean;
  is_new: boolean;

  // URLs
  url: string; // URL canónica

  // SEO
  seo?: SEOData;
}

// Versión ligera para listados
export interface PropertyCard {
  id: number;
  slug: string;
  title: string;
  location_display: string;
  main_image: string;
  price_display: string;
  operation_display: string;
  features: {
    bedrooms: number;
    bathrooms: number;
    area: number;
  };
  amenity_badges: Array<{ text: string; icon?: string }>;
  url: string;
  is_featured: boolean;
  is_new: boolean;
}

// ============================================================================
// ASESORES
// ============================================================================

export interface Advisor extends BaseEntity {
  slug: string;
  first_name: string;
  last_name: string;
  full_name: string;

  // Contacto
  email?: string;
  phone?: string;
  whatsapp?: string;

  // Perfil
  photo_url?: string;
  bio?: MultilingualText;

  // Especialidades
  specialties?: string[];
  languages?: string[];
  certifications?: string[];

  // Estadísticas
  stats?: {
    properties_count: number;
    sales_count: number;
    years_experience: number;
    rating?: number;
  };

  // Redes sociales
  social?: {
    instagram?: string;
    facebook?: string;
    linkedin?: string;
    twitter?: string;
    youtube?: string;
  };

  // Estado
  active: boolean;
  is_featured: boolean;

  // URLs
  url: string;

  // SEO
  seo?: SEOData;
}

// ============================================================================
// CONTENIDO - Artículos, Videos, Testimonios
// ============================================================================

export interface Article extends BaseEntity {
  slug: string;

  // Contenido multilingüe
  title: MultilingualText;
  excerpt: MultilingualText;
  content: MultilingualText;

  // Categorización
  category?: {
    id: number;
    slug: string;
    name: string;
    name_en?: string;
    name_fr?: string;
  };
  tags?: string[];

  // Autor
  author?: {
    id: number;
    name: string;
    photo_url?: string;
    slug?: string;
  };

  // Multimedia
  featured_image?: string;

  // Estados
  status: 'draft' | 'published' | 'archived';
  published_at?: string;

  // URLs
  url: string;

  // SEO
  seo?: SEOData;
}

export interface Video extends BaseEntity {
  slug: string;

  // Contenido multilingüe
  title: MultilingualText;
  description: MultilingualText;

  // Video data
  video_url: string;
  video_type: 'youtube' | 'vimeo' | 'local';
  video_id?: string;
  thumbnail?: string;
  duration?: number;

  // Categorización
  category?: {
    id: number;
    slug: string;
    name: string;
  };

  // Estados
  status: 'draft' | 'published' | 'archived';
  published_at?: string;

  // URLs
  url: string;

  // SEO
  seo?: SEOData;
}

export interface Testimonial extends BaseEntity {
  slug?: string;

  // Contenido
  content: MultilingualText;
  rating: number;

  // Cliente
  client_name: string;
  client_photo?: string;
  client_location?: string;

  // Contexto
  transaction_type?: 'venta' | 'alquiler' | 'compra';
  property_type?: string;

  // Agente asociado
  advisor?: {
    id: number;
    name: string;
    photo_url?: string;
  };

  // Estados
  status: 'pending' | 'approved' | 'rejected';
  is_featured: boolean;

  // URLs
  url?: string;
}

export interface FAQ extends BaseEntity {
  // Contenido multilingüe
  question: MultilingualText;
  answer: MultilingualText;

  // Categorización
  category?: string;
  order: number;

  // Contexto
  context?: 'general' | 'property' | 'advisor' | 'location';
  context_id?: number;
}

// ============================================================================
// CAROUSELES Y CONTENIDO DINÁMICO
// ============================================================================

export interface Carousel {
  id: string;
  title: string;
  title_en?: string;
  title_fr?: string;
  subtitle?: string;
  view_all_url?: string;
  properties: PropertyCard[];
}

export interface HotItems {
  cities: Array<{
    slug: string;
    title: string;
    url: string;
    count?: number;
  }>;
  sectors: Array<{
    slug: string;
    title: string;
    url: string;
    count?: number;
  }>;
  properties: PropertyCard[];
  agents: Array<{
    slug: string;
    name: string;
    photo_url?: string;
    url: string;
  }>;
  projects: Array<{
    slug: string;
    name: string;
    image?: string;
    url: string;
  }>;
}

// ============================================================================
// CONFIGURACIÓN DE TENANT/PAÍS
// ============================================================================

export interface TenantConfig {
  id: number;
  slug: string;
  name: string;
  domain: string;

  // Configuración visual
  branding: {
    logo_url?: string;
    favicon_url?: string;
    primary_color?: string;
    secondary_color?: string;
  };

  // Contacto
  contact: {
    phone?: string;
    whatsapp?: string;
    email?: string;
    address?: string;
  };

  // Redes sociales
  social: {
    facebook?: string;
    instagram?: string;
    youtube?: string;
    linkedin?: string;
    twitter?: string;
  };

  // Características habilitadas
  features: {
    vacation_rentals: boolean;
    projects: boolean;
    curated_lists: boolean;
    advisor_profiles: boolean;
    testimonials: boolean;
    articles: boolean;
    videos: boolean;
  };

  // Legal
  legal: {
    company_name: string;
    company_id?: string;
    terms_url?: string;
    privacy_url?: string;
  };

  // Configuración regional
  regional: {
    country_code: string;
    currency_default: 'USD' | 'DOP' | 'EUR';
    languages: string[];
    timezone: string;
  };

  // SEO por defecto
  default_seo: {
    title_suffix: string;
    description: string;
    keywords: string;
  };
}

// ============================================================================
// RESPUESTAS DE API - Estructuras estandarizadas
// ============================================================================

export interface PaginationMeta {
  page: number;
  limit: number;
  total_items: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface ApiResponseBase {
  pageType: string;
  language: string;
  tenant: TenantConfig;
  seo: SEOData;
  trackingString?: string;
}

// Respuesta de Homepage
export interface HomepageResponse extends ApiResponseBase {
  pageType: 'homepage';
  sections: Array<{
    type: string;
    data: any;
  }>;
  searchTags?: {
    tags: Record<string, any[]>;
    locationHierarchy: any;
    preselected?: any;
    currencies?: any;
  };
  hotItems: HotItems;
  quickStats?: {
    total_properties: number;
    for_sale: number;
    for_rent: number;
    new_this_month: number;
  };
}

// Respuesta de Lista de Propiedades
export interface PropertyListResponse extends ApiResponseBase {
  pageType: 'property-list';
  properties: PropertyCard[];
  totalProperties: number;
  pagination: PaginationMeta;
  filters: {
    active: Record<string, any>;
    available: Record<string, any[]>;
  };
  aggregatedStats?: {
    avgPrice: number;
    minPrice: number;
    maxPrice: number;
    currency: string;
    totalCount: number;
  };
  carousels?: Carousel[];
  relatedContent?: {
    articles: Article[];
    videos: Video[];
    faqs: FAQ[];
    testimonials: Testimonial[];
  };
  hotItems?: HotItems;
}

// Respuesta de Propiedad Individual
export interface SinglePropertyResponse extends ApiResponseBase {
  pageType: 'single-property';
  property: Property;
  agent: {
    main: PropertyAgent;
    cocaptors?: PropertyAgent[];
    properties_count?: number;
    should_show_properties: boolean;
  };
  relatedContent: {
    similar_properties: PropertyCard[];
    articles: Article[];
    videos: Video[];
    faqs: FAQ[];
    testimonials: Testimonial[];
    agent_properties?: PropertyCard[];
  };
}

// Respuesta de Lista de Asesores
export interface AdvisorsListResponse extends ApiResponseBase {
  pageType: 'advisors-list' | 'advisors-main';
  advisors: Advisor[];
  totalAdvisors: number;
  pagination?: PaginationMeta;
}

// Respuesta de Asesor Individual
export interface SingleAdvisorResponse extends ApiResponseBase {
  pageType: 'advisor-single';
  advisor: Advisor;
  properties: PropertyCard[];
  testimonials: Testimonial[];
  relatedContent?: {
    articles: Article[];
    videos: Video[];
  };
}

// Respuesta de Artículos
export interface ArticlesResponse extends ApiResponseBase {
  pageType: 'articles-main' | 'articles-category' | 'articles-single';
  articles?: Article[];
  article?: Article;
  categories?: Array<{
    id: number;
    slug: string;
    name: string;
    count: number;
  }>;
  pagination?: PaginationMeta;
  relatedContent?: {
    articles: Article[];
    videos: Video[];
  };
}

// Respuesta de Videos
export interface VideosResponse extends ApiResponseBase {
  pageType: 'videos-main' | 'videos-category' | 'videos-single';
  videos?: Video[];
  video?: Video;
  categories?: Array<{
    id: number;
    slug: string;
    name: string;
    count: number;
  }>;
  pagination?: PaginationMeta;
}

// Respuesta de Testimonios
export interface TestimonialsResponse extends ApiResponseBase {
  pageType: 'testimonials-main' | 'testimonials-category' | 'testimonials-single';
  testimonials?: Testimonial[];
  testimonial?: Testimonial;
  categories?: Array<{
    slug: string;
    name: string;
    count: number;
  }>;
  pagination?: PaginationMeta;
}

// Respuesta de Favoritos
export interface FavoritesResponse extends ApiResponseBase {
  pageType: 'favorites-main' | 'favorites-shared';
  properties?: PropertyCard[];
  shareId?: string;
  shareUrl?: string;
}

// Respuesta de Contacto
export interface ContactResponse extends ApiResponseBase {
  pageType: 'contact';
  formConfig: {
    fields: Array<{
      name: string;
      type: string;
      required: boolean;
      options?: string[];
    }>;
    subjects: string[];
  };
  officeInfo: {
    address: string;
    phone: string;
    whatsapp: string;
    email: string;
    hours: string;
    map_url?: string;
  };
}

// Respuesta de Vender
export interface SellResponse extends ApiResponseBase {
  pageType: 'sell';
  formConfig: Record<string, any>;
  benefits: Array<{
    icon: string;
    title: string;
    description: string;
  }>;
  testimonials: Testimonial[];
  faqs: FAQ[];
}

// Respuesta de Vacation Rentals
export interface VacationRentalsResponse extends ApiResponseBase {
  pageType: 'vacation-rentals-main' | 'vacation-rentals-plans' | 'vacation-rentals-dynamic';
  properties?: PropertyCard[];
  plans?: Array<{
    id: number;
    slug: string;
    name: string;
    description: string;
    features: string[];
    price?: string;
  }>;
  pagination?: PaginationMeta;
}

// Respuesta de Curated Listings
export interface CuratedListingsResponse extends ApiResponseBase {
  pageType: 'curated-listings-main' | 'curated-listings-single';
  lists?: Array<{
    id: number;
    slug: string;
    title: string;
    description: string;
    image: string;
    property_count: number;
  }>;
  list?: {
    id: number;
    slug: string;
    title: string;
    description: string;
    image: string;
  };
  properties?: PropertyCard[];
}

// Respuesta de Ubicaciones
export interface LocationsResponse extends ApiResponseBase {
  pageType: 'locations-main';
  locations: Array<{
    type: 'province' | 'city' | 'sector';
    items: Array<{
      slug: string;
      name: string;
      property_count: number;
      url: string;
    }>;
  }>;
}

// Respuesta de Tipos de Propiedad
export interface PropertyTypesResponse extends ApiResponseBase {
  pageType: 'property-types-main';
  propertyTypes: Array<{
    slug: string;
    name: string;
    name_en?: string;
    name_fr?: string;
    icon?: string;
    property_count: number;
    url: string;
  }>;
}

// Respuesta de páginas legales
export interface LegalResponse extends ApiResponseBase {
  pageType: 'legal-terms' | 'legal-privacy';
  legalType: 'terms' | 'privacy';
  content: MultilingualText;
  last_updated: string;
}

// Respuesta 404
export interface Error404Response extends ApiResponseBase {
  pageType: '404';
  suggestedLinks?: Array<{
    title: string;
    url: string;
  }>;
  searchSuggestions?: string[];
}

// Union type de todas las respuestas posibles
export type ApiResponse =
  | HomepageResponse
  | PropertyListResponse
  | SinglePropertyResponse
  | AdvisorsListResponse
  | SingleAdvisorResponse
  | ArticlesResponse
  | VideosResponse
  | TestimonialsResponse
  | FavoritesResponse
  | ContactResponse
  | SellResponse
  | VacationRentalsResponse
  | CuratedListingsResponse
  | LocationsResponse
  | PropertyTypesResponse
  | LegalResponse
  | Error404Response;

// ============================================================================
// UTILIDADES DE TIPO
// ============================================================================

// Helper para obtener texto multilingüe según idioma
export function getLocalizedText(text: MultilingualText | string, language: string): string {
  if (typeof text === 'string') return text;

  switch (language) {
    case 'en': return text.en || text.es;
    case 'fr': return text.fr || text.es;
    default: return text.es;
  }
}

// Helper para formatear precios
export function formatPrice(amount: number, currency: string, type: 'sale' | 'rental' = 'sale', language: string = 'es'): string {
  const formatter = new Intl.NumberFormat(language === 'en' ? 'en-US' : language === 'fr' ? 'fr-FR' : 'es-DO', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });

  const formatted = formatter.format(amount);

  if (type === 'rental') {
    const suffixes = {
      es: '/mes',
      en: '/mo',
      fr: '/mois'
    };
    return `${formatted}${suffixes[language as keyof typeof suffixes] || '/mes'}`;
  }

  return formatted;
}

// Helper para construir URLs con tracking
export function buildUrl(basePath: string, language: string, trackingString?: string): string {
  let url = basePath || '/';

  if (language !== 'es' && language) {
    url = `/${language}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  if (!url.startsWith('/')) {
    url = `/${url}`;
  }

  return url + (trackingString || '');
}
