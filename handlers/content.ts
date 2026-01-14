// api/handlers/content.ts
// Handler para contenido: artículos, videos, testimonios, FAQs

import db from '../lib/db';
import utils from '../lib/utils';
import type {
  ArticlesResponse,
  VideosResponse,
  TestimonialsResponse,
  Article,
  Video,
  Testimonial,
  TenantConfig,
  SEOData
} from '../types';

// ============================================================================
// HANDLER: Artículos
// ============================================================================

export async function handleArticles(options: {
  tenant: TenantConfig;
  slug?: string;
  categorySlug?: string;
  language: string;
  trackingString: string;
  page: number;
  limit: number;
}): Promise<ArticlesResponse> {
  const { tenant, slug, categorySlug, language, trackingString, page, limit } = options;
  const sql = db.getSQL();

  // Si hay slug, obtener artículo individual
  if (slug) {
    return handleSingleArticle({ tenant, slug, language, trackingString });
  }

  // Obtener lista de artículos
  const { items, pagination } = await db.getContent({
    tenantId: tenant.id,
    type: 'articulos',
    categorySlug,
    page,
    limit,
    language
  });

  // Procesar artículos
  const articles = items.map(item => processArticle(item, language, trackingString));

  // Obtener categorías
  const categories = await sql`
    SELECT
      categoria_slug as slug,
      categoria as name,
      COUNT(*) as count
    FROM articulos
    WHERE tenant_id = ${tenant.id}
      AND estado = 'publicado'
      AND categoria_slug IS NOT NULL
    GROUP BY categoria_slug, categoria
    ORDER BY count DESC
  `;

  // Generar SEO
  const pageType = categorySlug ? 'articles-category' : 'articles-main';
  const seo = generateArticlesSEO(pageType, categorySlug, language, tenant, pagination.total_items);

  return {
    pageType,
    language,
    tenant,
    seo,
    trackingString,
    articles,
    categories: categories.map(c => ({
      id: 0,
      slug: c.slug,
      name: c.name,
      count: parseInt(c.count, 10)
    })),
    pagination
  };
}

async function handleSingleArticle(options: {
  tenant: TenantConfig;
  slug: string;
  language: string;
  trackingString: string;
}): Promise<ArticlesResponse> {
  const { tenant, slug, language, trackingString } = options;
  const sql = db.getSQL();

  const { item } = await db.getContent({
    tenantId: tenant.id,
    type: 'articulos',
    slug,
    language
  });

  if (!item) {
    return {
      pageType: 'articles-single',
      language,
      tenant,
      seo: utils.generateSEO({
        title: 'Artículo no encontrado',
        description: 'El artículo que buscas no existe.',
        language
      }),
      trackingString,
      article: undefined
    };
  }

  const article = processArticle(item, language, trackingString);

  // Obtener artículos relacionados
  const relatedItems = await sql`
    SELECT * FROM articulos
    WHERE tenant_id = ${tenant.id}
      AND estado = 'publicado'
      AND id != ${item.id}
      AND (categoria_slug = ${item.categoria_slug} OR categoria_slug IS NULL)
    ORDER BY fecha_publicacion DESC
    LIMIT 3
  `;

  const seo = generateSingleArticleSEO(article, language, tenant);

  return {
    pageType: 'articles-single',
    language,
    tenant,
    seo,
    trackingString,
    article,
    relatedContent: {
      articles: relatedItems.map(a => processArticle(a, language, trackingString)),
      videos: []
    }
  };
}

function processArticle(item: Record<string, any>, language: string, trackingString: string): Article {
  const processed = utils.processTranslations(item, language);

  return {
    id: processed.id,
    slug: processed.slug,
    created_at: processed.created_at,
    updated_at: processed.updated_at,

    title: {
      es: processed.titulo,
      en: processed.titulo_en || processed.traducciones?.en?.titulo,
      fr: processed.titulo_fr || processed.traducciones?.fr?.titulo
    },

    excerpt: {
      es: processed.extracto || '',
      en: processed.extracto_en || processed.traducciones?.en?.extracto,
      fr: processed.extracto_fr || processed.traducciones?.fr?.extracto
    },

    content: {
      es: processed.contenido || '',
      en: processed.contenido_en || processed.traducciones?.en?.contenido,
      fr: processed.contenido_fr || processed.traducciones?.fr?.contenido
    },

    category: processed.categoria_slug ? {
      id: 0,
      slug: processed.categoria_slug,
      name: processed.categoria
    } : undefined,

    tags: processed.etiquetas || [],

    author: processed.autor_id ? {
      id: processed.autor_id,
      name: processed.autor_nombre || 'Autor',
      photo_url: processed.autor_foto,
      slug: processed.autor_slug
    } : undefined,

    featured_image: processed.imagen_destacada,

    status: processed.estado,
    published_at: processed.fecha_publicacion,

    url: utils.buildUrl(`/articulos/${processed.slug}`, language, trackingString),

    seo: {
      title: utils.getTranslatedField(processed, 'meta_titulo', language) ||
             utils.getTranslatedField(processed, 'titulo', language),
      description: utils.getTranslatedField(processed, 'meta_descripcion', language) ||
                   utils.getTranslatedField(processed, 'extracto', language)
    }
  };
}

function generateArticlesSEO(
  pageType: string,
  categorySlug: string | undefined,
  language: string,
  tenant: TenantConfig,
  total: number
): SEOData {
  const titles = {
    es: categorySlug ? `Artículos sobre ${categorySlug}` : 'Blog y Artículos',
    en: categorySlug ? `Articles about ${categorySlug}` : 'Blog and Articles',
    fr: categorySlug ? `Articles sur ${categorySlug}` : 'Blog et Articles'
  };

  const descriptions = {
    es: `Descubre ${total} artículos sobre bienes raíces, inversión y tendencias del mercado inmobiliario.`,
    en: `Discover ${total} articles about real estate, investment and market trends.`,
    fr: `Découvrez ${total} articles sur l'immobilier, l'investissement et les tendances du marché.`
  };

  return utils.generateSEO({
    title: `${titles[language as keyof typeof titles]} | ${tenant.name}`,
    description: descriptions[language as keyof typeof descriptions],
    canonicalUrl: categorySlug
      ? utils.buildUrl(`/articulos/${categorySlug}`, language)
      : utils.buildUrl('/articulos', language),
    language,
    siteName: tenant.name
  });
}

function generateSingleArticleSEO(article: Article, language: string, tenant: TenantConfig): SEOData {
  const title = utils.getLocalizedText(article.title, language);
  const excerpt = utils.getLocalizedText(article.excerpt, language);

  return utils.generateSEO({
    title: `${title} | ${tenant.name}`,
    description: excerpt || title,
    canonicalUrl: article.url,
    ogImage: article.featured_image,
    language,
    siteName: tenant.name
  });
}

// ============================================================================
// HANDLER: Videos
// ============================================================================

export async function handleVideos(options: {
  tenant: TenantConfig;
  slug?: string;
  categorySlug?: string;
  language: string;
  trackingString: string;
  page: number;
  limit: number;
}): Promise<VideosResponse> {
  const { tenant, slug, categorySlug, language, trackingString, page, limit } = options;
  const sql = db.getSQL();

  // Si hay slug, obtener video individual
  if (slug) {
    return handleSingleVideo({ tenant, slug, language, trackingString });
  }

  // Obtener lista de videos
  const { items, pagination } = await db.getContent({
    tenantId: tenant.id,
    type: 'videos',
    categorySlug,
    page,
    limit,
    language
  });

  // Procesar videos
  const videos = items.map(item => processVideo(item, language, trackingString));

  // Obtener categorías
  const categories = await sql`
    SELECT
      categoria_slug as slug,
      categoria as name,
      COUNT(*) as count
    FROM videos
    WHERE tenant_id = ${tenant.id}
      AND estado = 'publicado'
      AND categoria_slug IS NOT NULL
    GROUP BY categoria_slug, categoria
    ORDER BY count DESC
  `;

  // Generar SEO
  const pageType = categorySlug ? 'videos-category' : 'videos-main';
  const seo = generateVideosSEO(pageType, categorySlug, language, tenant, pagination.total_items);

  return {
    pageType,
    language,
    tenant,
    seo,
    trackingString,
    videos,
    categories: categories.map(c => ({
      id: 0,
      slug: c.slug,
      name: c.name,
      count: parseInt(c.count, 10)
    })),
    pagination
  };
}

async function handleSingleVideo(options: {
  tenant: TenantConfig;
  slug: string;
  language: string;
  trackingString: string;
}): Promise<VideosResponse> {
  const { tenant, slug, language, trackingString } = options;

  const { item } = await db.getContent({
    tenantId: tenant.id,
    type: 'videos',
    slug,
    language
  });

  if (!item) {
    return {
      pageType: 'videos-single',
      language,
      tenant,
      seo: utils.generateSEO({
        title: 'Video no encontrado',
        description: 'El video que buscas no existe.',
        language
      }),
      trackingString,
      video: undefined
    };
  }

  const video = processVideo(item, language, trackingString);
  const seo = generateSingleVideoSEO(video, language, tenant);

  return {
    pageType: 'videos-single',
    language,
    tenant,
    seo,
    trackingString,
    video
  };
}

function processVideo(item: Record<string, any>, language: string, trackingString: string): Video {
  const processed = utils.processTranslations(item, language);

  // Detectar tipo de video
  let videoType: 'youtube' | 'vimeo' | 'local' = 'local';
  let videoId: string | undefined;

  if (processed.video_url) {
    if (processed.video_url.includes('youtube.com') || processed.video_url.includes('youtu.be')) {
      videoType = 'youtube';
      const match = processed.video_url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
      videoId = match ? match[1] : undefined;
    } else if (processed.video_url.includes('vimeo.com')) {
      videoType = 'vimeo';
      const match = processed.video_url.match(/vimeo\.com\/(\d+)/);
      videoId = match ? match[1] : undefined;
    }
  }

  return {
    id: processed.id,
    slug: processed.slug,
    created_at: processed.created_at,
    updated_at: processed.updated_at,

    title: {
      es: processed.titulo,
      en: processed.titulo_en || processed.traducciones?.en?.titulo,
      fr: processed.titulo_fr || processed.traducciones?.fr?.titulo
    },

    description: {
      es: processed.descripcion || '',
      en: processed.descripcion_en || processed.traducciones?.en?.descripcion,
      fr: processed.descripcion_fr || processed.traducciones?.fr?.descripcion
    },

    video_url: processed.video_url,
    video_type: videoType,
    video_id: videoId,
    thumbnail: processed.thumbnail || (videoType === 'youtube' && videoId
      ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
      : undefined),
    duration: processed.duracion,

    category: processed.categoria_slug ? {
      id: 0,
      slug: processed.categoria_slug,
      name: processed.categoria
    } : undefined,

    status: processed.estado,
    published_at: processed.fecha_publicacion,

    url: utils.buildUrl(`/videos/${processed.slug}`, language, trackingString)
  };
}

function generateVideosSEO(
  pageType: string,
  categorySlug: string | undefined,
  language: string,
  tenant: TenantConfig,
  total: number
): SEOData {
  const titles = {
    es: categorySlug ? `Videos de ${categorySlug}` : 'Videos',
    en: categorySlug ? `${categorySlug} Videos` : 'Videos',
    fr: categorySlug ? `Vidéos de ${categorySlug}` : 'Vidéos'
  };

  const descriptions = {
    es: `Explora ${total} videos sobre bienes raíces, propiedades y el mercado inmobiliario.`,
    en: `Explore ${total} videos about real estate, properties and the housing market.`,
    fr: `Explorez ${total} vidéos sur l'immobilier, les propriétés et le marché immobilier.`
  };

  return utils.generateSEO({
    title: `${titles[language as keyof typeof titles]} | ${tenant.name}`,
    description: descriptions[language as keyof typeof descriptions],
    canonicalUrl: categorySlug
      ? utils.buildUrl(`/videos/${categorySlug}`, language)
      : utils.buildUrl('/videos', language),
    language,
    siteName: tenant.name
  });
}

function generateSingleVideoSEO(video: Video, language: string, tenant: TenantConfig): SEOData {
  const title = utils.getLocalizedText(video.title, language);
  const description = utils.getLocalizedText(video.description, language);

  return utils.generateSEO({
    title: `${title} | ${tenant.name}`,
    description: description || title,
    canonicalUrl: video.url,
    ogImage: video.thumbnail,
    language,
    siteName: tenant.name
  });
}

// ============================================================================
// HANDLER: Testimonios
// ============================================================================

export async function handleTestimonials(options: {
  tenant: TenantConfig;
  slug?: string;
  categorySlug?: string;
  language: string;
  trackingString: string;
  page: number;
  limit: number;
}): Promise<TestimonialsResponse> {
  const { tenant, slug, categorySlug, language, trackingString, page, limit } = options;
  const sql = db.getSQL();

  // Si hay slug, obtener testimonio individual
  if (slug) {
    return handleSingleTestimonial({ tenant, slug, language, trackingString });
  }

  // Obtener lista de testimonios
  const { items, pagination } = await db.getContent({
    tenantId: tenant.id,
    type: 'testimonios',
    categorySlug,
    page,
    limit,
    language
  });

  // Procesar testimonios
  const testimonials = items.map(item => processTestimonial(item, language));

  // Obtener categorías (por tipo de transacción)
  const categories = await sql`
    SELECT
      tipo_transaccion as slug,
      tipo_transaccion as name,
      COUNT(*) as count
    FROM testimonios
    WHERE tenant_id = ${tenant.id}
      AND estado = 'aprobado'
      AND tipo_transaccion IS NOT NULL
    GROUP BY tipo_transaccion
    ORDER BY count DESC
  `;

  // Generar SEO
  const pageType = categorySlug ? 'testimonials-category' : 'testimonials-main';
  const seo = generateTestimonialsSEO(pageType, language, tenant, pagination.total_items);

  return {
    pageType,
    language,
    tenant,
    seo,
    trackingString,
    testimonials,
    categories: categories.map(c => ({
      slug: c.slug,
      name: c.name,
      count: parseInt(c.count, 10)
    })),
    pagination
  };
}

async function handleSingleTestimonial(options: {
  tenant: TenantConfig;
  slug: string;
  language: string;
  trackingString: string;
}): Promise<TestimonialsResponse> {
  const { tenant, slug, language, trackingString } = options;

  const { item } = await db.getContent({
    tenantId: tenant.id,
    type: 'testimonios',
    slug,
    language
  });

  if (!item) {
    return {
      pageType: 'testimonials-single',
      language,
      tenant,
      seo: utils.generateSEO({
        title: 'Testimonio no encontrado',
        description: 'El testimonio que buscas no existe.',
        language
      }),
      trackingString,
      testimonial: undefined
    };
  }

  const testimonial = processTestimonial(item, language);
  const seo = generateSingleTestimonialSEO(testimonial, language, tenant);

  return {
    pageType: 'testimonials-single',
    language,
    tenant,
    seo,
    trackingString,
    testimonial
  };
}

function processTestimonial(item: Record<string, any>, language: string): Testimonial {
  const processed = utils.processTranslations(item, language);

  return {
    id: processed.id,
    slug: processed.slug,
    created_at: processed.created_at,
    updated_at: processed.updated_at,

    content: {
      es: processed.contenido,
      en: processed.contenido_en || processed.traducciones?.en?.contenido,
      fr: processed.contenido_fr || processed.traducciones?.fr?.contenido
    },

    rating: processed.calificacion || 5,

    client_name: processed.nombre_cliente,
    client_photo: processed.foto_cliente,
    client_location: processed.ubicacion_cliente,

    transaction_type: processed.tipo_transaccion,
    property_type: processed.tipo_propiedad,

    advisor: processed.asesor_id ? {
      id: processed.asesor_id,
      name: processed.asesor_nombre,
      photo_url: processed.asesor_foto
    } : undefined,

    status: processed.estado === 'aprobado' ? 'approved' : 'pending',
    is_featured: processed.destacado || false,

    url: processed.slug ? utils.buildUrl(`/testimonios/${processed.slug}`, language) : undefined
  };
}

function generateTestimonialsSEO(
  pageType: string,
  language: string,
  tenant: TenantConfig,
  total: number
): SEOData {
  const titles = {
    es: 'Testimonios de Clientes',
    en: 'Client Testimonials',
    fr: 'Témoignages Clients'
  };

  const descriptions = {
    es: `Lee ${total} testimonios de clientes satisfechos que encontraron su propiedad ideal con nosotros.`,
    en: `Read ${total} testimonials from satisfied clients who found their ideal property with us.`,
    fr: `Lisez ${total} témoignages de clients satisfaits qui ont trouvé leur propriété idéale avec nous.`
  };

  return utils.generateSEO({
    title: `${titles[language as keyof typeof titles]} | ${tenant.name}`,
    description: descriptions[language as keyof typeof descriptions],
    canonicalUrl: utils.buildUrl('/testimonios', language),
    language,
    siteName: tenant.name
  });
}

function generateSingleTestimonialSEO(
  testimonial: Testimonial,
  language: string,
  tenant: TenantConfig
): SEOData {
  const content = utils.getLocalizedText(testimonial.content, language);

  return utils.generateSEO({
    title: `Testimonio de ${testimonial.client_name} | ${tenant.name}`,
    description: content.substring(0, 150),
    canonicalUrl: testimonial.url,
    ogImage: testimonial.client_photo,
    language,
    siteName: tenant.name
  });
}

export default {
  handleArticles,
  handleVideos,
  handleTestimonials
};
