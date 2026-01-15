// handlers/videos.ts
// Handler completo para videos: main, category, single
// Basado en la tabla 'videos' de Neon

import db from '../lib/db';
import utils from '../lib/utils';
import type { TenantConfig, SEOData } from '../types';

// ============================================================================
// TIPOS ESPECÍFICOS PARA VIDEOS
// ============================================================================

interface VideoCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  videoCount?: number;
}

interface Video {
  id: string;
  slug: string;
  title: string;
  description: string;
  videoUrl: string;
  videoId: string | null;
  videoType: string;
  embedCode: string | null;
  thumbnail: string;
  duration: number;
  durationFormatted: string;
  publishedAt: string;
  views: number;
  featured: boolean;
  url: string;
  category?: VideoCategory;
  property?: {
    id: string;
    slug: string;
    title: string;
  } | null;
  tags?: string[];
}

interface VideosMainResponse {
  type: 'videos-main';
  language: string;
  tenant: TenantConfig;
  seo: SEOData;
  trackingString: string;
  heroVideo: Video | null;
  featuredVideos: Video[];
  recentVideos: Video[];
  categories: VideoCategory[];
  stats: {
    totalVideos: number;
    totalCategories: number;
    totalViews: number;
    featuredCount: number;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

interface VideosCategoryResponse {
  type: 'videos-category';
  language: string;
  tenant: TenantConfig;
  seo: SEOData;
  trackingString: string;
  category: VideoCategory;
  videos: Video[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

interface VideosSingleResponse {
  type: 'videos-single';
  language: string;
  tenant: TenantConfig;
  seo: SEOData;
  trackingString: string;
  video: Video;
  relatedVideos: Video[];
  category: VideoCategory | null;
}

type VideosResponse = VideosMainResponse | VideosCategoryResponse | VideosSingleResponse;

// ============================================================================
// TEXTOS UI POR IDIOMA
// ============================================================================

const UI_TEXTS: Record<string, Record<string, string>> = {
  es: {
    HOME: 'Inicio',
    VIDEOS: 'Videos',
    WATCH: 'Ver video',
    NOT_FOUND: 'Video no encontrado',
    NOT_FOUND_DESC: 'El video que buscas no existe o ha sido eliminado.',
  },
  en: {
    HOME: 'Home',
    VIDEOS: 'Videos',
    WATCH: 'Watch video',
    NOT_FOUND: 'Video not found',
    NOT_FOUND_DESC: 'The video you are looking for does not exist or has been removed.',
  },
  fr: {
    HOME: 'Accueil',
    VIDEOS: 'Vidéos',
    WATCH: 'Voir la vidéo',
    NOT_FOUND: 'Vidéo non trouvée',
    NOT_FOUND_DESC: "La vidéo que vous recherchez n'existe pas ou a été supprimée.",
  },
};

function getUIText(key: string, language: string): string {
  return UI_TEXTS[language]?.[key] || UI_TEXTS.es[key] || key;
}

// ============================================================================
// HELPER: FORMATEAR DURACIÓN
// ============================================================================

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ============================================================================
// HELPER: EXTRAER VIDEO ID DE URL
// ============================================================================

function extractVideoId(url: string, type: string): string | null {
  if (!url) return null;

  if (type === 'youtube') {
    // YouTube: varios formatos posibles
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\?\/]+)/,
      /^([a-zA-Z0-9_-]{11})$/, // Solo el ID
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
  }

  if (type === 'vimeo') {
    const match = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (match) return match[1];
  }

  return null;
}

// ============================================================================
// HELPER: GENERAR THUMBNAIL
// ============================================================================

function generateThumbnail(videoId: string | null, type: string, customThumbnail: string | null): string {
  if (customThumbnail) return customThumbnail;

  if (videoId && type === 'youtube') {
    return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  }

  return '/images/placeholder-video.jpg';
}

// ============================================================================
// HELPER: PROCESAR VIDEO
// ============================================================================

function processVideo(
  item: Record<string, any>,
  language: string,
  trackingString: string
): Video {
  // Procesar traducciones
  const processed = utils.processTranslations(item, language);

  // Obtener campos traducidos
  const title = utils.getTranslatedField(processed, 'titulo', language) || processed.titulo || '';
  const description = utils.getTranslatedField(processed, 'descripcion', language) || processed.descripcion || '';

  // Tipo de video y URL
  const videoType = processed.tipo_video || 'youtube';
  const videoUrl = processed.video_url || '';
  const videoId = processed.video_id || extractVideoId(videoUrl, videoType);

  // Thumbnail
  const thumbnail = generateThumbnail(videoId, videoType, processed.thumbnail);

  // Construir URL del video
  const categorySlug = processed.categoria_slug || 'general';
  const videoSlug = processed.slug;
  const basePath = language === 'es'
    ? `/videos/${categorySlug}/${videoSlug}`
    : `/${language}/videos/${categorySlug}/${videoSlug}`;
  const url = basePath + trackingString;

  // Procesar categoría
  const category: VideoCategory | undefined = processed.categoria_slug ? {
    id: processed.categoria_id || '',
    name: utils.getTranslatedField(processed, 'categoria_nombre', language) || processed.categoria_nombre || processed.categoria_slug,
    slug: processed.categoria_slug,
  } : undefined;

  // Procesar tags
  let tags: string[] | undefined;
  if (processed.tags) {
    try {
      const parsedTags = typeof processed.tags === 'string' ? JSON.parse(processed.tags) : processed.tags;
      if (Array.isArray(parsedTags)) {
        tags = parsedTags.map((t: any) => typeof t === 'string' ? t : t.name || t.tag || '').filter(Boolean);
      }
    } catch {
      tags = undefined;
    }
  }

  // Duración
  const durationSeconds = processed.duracion_segundos || 0;

  return {
    id: processed.id,
    slug: videoSlug,
    title,
    description,
    videoUrl,
    videoId,
    videoType,
    embedCode: processed.embed_code || null,
    thumbnail,
    duration: durationSeconds,
    durationFormatted: formatDuration(durationSeconds),
    publishedAt: processed.fecha_publicacion || processed.created_at,
    views: processed.vistas || 0,
    featured: processed.destacado || false,
    url,
    category,
    property: processed.propiedad_id ? {
      id: processed.propiedad_id,
      slug: processed.propiedad_slug || '',
      title: processed.propiedad_titulo || '',
    } : null,
    tags,
  };
}

// ============================================================================
// HANDLER: VIDEOS MAIN
// ============================================================================

async function handleVideosMain(options: {
  tenant: TenantConfig;
  language: string;
  trackingString: string;
  page: number;
  limit: number;
}): Promise<VideosMainResponse> {
  const { tenant, language, trackingString, page, limit } = options;
  const sql = db.getSQL();
  const offset = (page - 1) * limit;

  try {
    // Query: Video destacado principal (hero)
    const heroResult = await sql`
      SELECT
        v.id,
        v.slug,
        v.titulo,
        v.descripcion,
        v.tipo_video,
        v.video_url,
        v.video_id,
        v.embed_code,
        v.thumbnail,
        v.duracion_segundos,
        v.fecha_publicacion,
        v.vistas,
        v.destacado,
        v.traducciones,
        v.categoria_id,
        v.tags,
        cc.slug as categoria_slug,
        cc.nombre as categoria_nombre
      FROM videos v
      LEFT JOIN categorias_contenido cc ON v.categoria_id = cc.id
      WHERE v.tenant_id = ${tenant.id}::uuid
        AND v.publicado = true
        AND v.destacado = true
      ORDER BY v.orden ASC, v.fecha_publicacion DESC NULLS LAST
      LIMIT 1
    `;

    // Query: Videos destacados (excluyendo el hero)
    // Usamos una query sin condición dinámica para evitar errores de sintaxis con Neon
    const heroId = heroResult.length > 0 ? (heroResult as any[])[0].id : null;

    let featuredResult: any[];
    if (heroId) {
      featuredResult = await sql`
        SELECT
          v.id,
          v.slug,
          v.titulo,
          v.descripcion,
          v.tipo_video,
          v.video_url,
          v.video_id,
          v.thumbnail,
          v.duracion_segundos,
          v.fecha_publicacion,
          v.vistas,
          v.destacado,
          v.traducciones,
          v.categoria_id,
          cc.slug as categoria_slug,
          cc.nombre as categoria_nombre
        FROM videos v
        LEFT JOIN categorias_contenido cc ON v.categoria_id = cc.id
        WHERE v.tenant_id = ${tenant.id}::uuid
          AND v.publicado = true
          AND v.destacado = true
          AND v.id != ${heroId}::uuid
        ORDER BY v.orden ASC, v.fecha_publicacion DESC NULLS LAST
        LIMIT 6
      ` as any[];
    } else {
      featuredResult = await sql`
        SELECT
          v.id,
          v.slug,
          v.titulo,
          v.descripcion,
          v.tipo_video,
          v.video_url,
          v.video_id,
          v.thumbnail,
          v.duracion_segundos,
          v.fecha_publicacion,
          v.vistas,
          v.destacado,
          v.traducciones,
          v.categoria_id,
          cc.slug as categoria_slug,
          cc.nombre as categoria_nombre
        FROM videos v
        LEFT JOIN categorias_contenido cc ON v.categoria_id = cc.id
        WHERE v.tenant_id = ${tenant.id}::uuid
          AND v.publicado = true
          AND v.destacado = true
        ORDER BY v.orden ASC, v.fecha_publicacion DESC NULLS LAST
        LIMIT 6
      ` as any[];
    }

    // Query: Videos recientes (paginados)
    const recentResult = await sql`
      SELECT
        v.id,
        v.slug,
        v.titulo,
        v.descripcion,
        v.tipo_video,
        v.video_url,
        v.video_id,
        v.thumbnail,
        v.duracion_segundos,
        v.fecha_publicacion,
        v.vistas,
        v.destacado,
        v.traducciones,
        v.categoria_id,
        cc.slug as categoria_slug,
        cc.nombre as categoria_nombre
      FROM videos v
      LEFT JOIN categorias_contenido cc ON v.categoria_id = cc.id
      WHERE v.tenant_id = ${tenant.id}::uuid
        AND v.publicado = true
      ORDER BY v.destacado DESC, v.fecha_publicacion DESC NULLS LAST
      LIMIT ${limit} OFFSET ${offset}
    `;

    console.log('[Videos Handler] recentResult count:', (recentResult as any[]).length);

    // Query: Categorías de videos
    const categoriesResult = await sql`
      SELECT
        cc.id,
        cc.slug,
        cc.nombre as name,
        cc.descripcion as description,
        cc.traducciones,
        COALESCE((
          SELECT COUNT(*)
          FROM videos v
          WHERE v.categoria_id = cc.id
            AND v.publicado = true
            AND v.tenant_id = ${tenant.id}::uuid
        ), 0) as video_count
      FROM categorias_contenido cc
      WHERE cc.tenant_id = ${tenant.id}::uuid
        AND cc.activa = true
        AND cc.tipo = 'video'
      ORDER BY cc.orden ASC, cc.nombre ASC
    `;

    // Query: Estadísticas
    const statsResult = await sql`
      SELECT
        COUNT(*) as total_videos,
        COALESCE(SUM(vistas), 0) as total_views,
        COUNT(CASE WHEN destacado = true THEN 1 END) as featured_count
      FROM videos
      WHERE tenant_id = ${tenant.id}::uuid
        AND publicado = true
    `;

    // Query: Total para paginación
    const countResult = await sql`
      SELECT COUNT(*) as total
      FROM videos
      WHERE tenant_id = ${tenant.id}::uuid
        AND publicado = true
    `;

    // Procesar hero video
    const heroVideo = heroResult.length > 0
      ? processVideo((heroResult as any[])[0], language, trackingString)
      : null;

    // Procesar videos destacados
    const featuredVideos = (featuredResult as any[]).map((item: any) =>
      processVideo(item, language, trackingString)
    );

    // Procesar videos recientes
    const recentVideos = (recentResult as any[]).map((item: any) =>
      processVideo(item, language, trackingString)
    );

    // Procesar categorías
    const categories: VideoCategory[] = (categoriesResult as any[])
      .map((cat: any) => {
        const catProcessed = utils.processTranslations(cat, language);
        return {
          id: cat.id,
          name: utils.getTranslatedField(catProcessed, 'name', language) || cat.name,
          slug: cat.slug,
          description: utils.getTranslatedField(catProcessed, 'description', language) || cat.description,
          videoCount: parseInt(cat.video_count || '0', 10),
        };
      });

    // Verificar si hay videos sin categoría
    const uncategorizedResult = await sql`
      SELECT COUNT(*) as count
      FROM videos
      WHERE tenant_id = ${tenant.id}::uuid
        AND publicado = true
        AND categoria_id IS NULL
    `;
    const uncategorizedCount = parseInt((uncategorizedResult as any[])[0]?.count || '0', 10);

    if (uncategorizedCount > 0) {
      const generalNames: Record<string, string> = {
        es: 'General',
        en: 'General',
        fr: 'Général',
      };
      categories.push({
        id: 'general',
        name: generalNames[language] || generalNames.es,
        slug: 'general',
        description: language === 'es' ? 'Videos generales' : 'General videos',
        videoCount: uncategorizedCount,
      });
    }

    // Procesar estadísticas
    const statsData = (statsResult as any[])[0] || {};
    const totalVideos = parseInt((countResult as any[])[0]?.total || '0', 10);

    const stats = {
      totalVideos,
      totalCategories: categories.length,
      totalViews: parseInt(statsData.total_views || '0', 10),
      featuredCount: parseInt(statsData.featured_count || '0', 10),
    };

    // Construir SEO
    const seo = generateVideosMainSEO(language, tenant, stats.totalVideos);

    // Paginación
    const totalPages = Math.ceil(totalVideos / limit) || 1;
    const pagination = {
      page,
      limit,
      total: totalVideos,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };

    return {
      type: 'videos-main',
      language,
      tenant,
      seo,
      trackingString,
      heroVideo,
      featuredVideos,
      recentVideos,
      categories,
      stats,
      pagination,
    };
  } catch (error) {
    console.error('[Videos Main Handler] Error:', error);
    return {
      type: 'videos-main',
      language,
      tenant,
      seo: generateVideosMainSEO(language, tenant, 0),
      trackingString,
      heroVideo: null,
      featuredVideos: [],
      recentVideos: [],
      categories: [],
      stats: {
        totalVideos: 0,
        totalCategories: 0,
        totalViews: 0,
        featuredCount: 0,
      },
      pagination: {
        page: 1,
        limit,
        total: 0,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      },
    };
  }
}

// ============================================================================
// HANDLER: VIDEOS POR CATEGORÍA
// ============================================================================

async function handleVideosCategory(options: {
  tenant: TenantConfig;
  categorySlug: string;
  language: string;
  trackingString: string;
  page: number;
  limit: number;
}): Promise<VideosCategoryResponse | null> {
  const { tenant, categorySlug, language, trackingString, page, limit } = options;
  const sql = db.getSQL();
  const offset = (page - 1) * limit;

  let category: VideoCategory;
  let videosResult: any[];
  let totalVideos: number;

  // Caso especial: categoría "general"
  if (categorySlug === 'general') {
    const countResult = await sql`
      SELECT COUNT(*) as total
      FROM videos
      WHERE tenant_id = ${tenant.id}::uuid
        AND publicado = true
        AND categoria_id IS NULL
    `;
    totalVideos = parseInt((countResult as any[])[0]?.total || '0', 10);

    if (totalVideos === 0) {
      return null;
    }

    const generalNames: Record<string, string> = {
      es: 'General',
      en: 'General',
      fr: 'Général',
    };

    category = {
      id: 'general',
      name: generalNames[language] || generalNames.es,
      slug: 'general',
      description: language === 'es' ? 'Videos generales' : 'General videos',
    };

    videosResult = await sql`
      SELECT
        v.id,
        v.slug,
        v.titulo,
        v.descripcion,
        v.tipo_video,
        v.video_url,
        v.video_id,
        v.thumbnail,
        v.duracion_segundos,
        v.fecha_publicacion,
        v.vistas,
        v.destacado,
        v.traducciones,
        v.categoria_id,
        'general' as categoria_slug,
        ${category.name} as categoria_nombre
      FROM videos v
      WHERE v.tenant_id = ${tenant.id}::uuid
        AND v.publicado = true
        AND v.categoria_id IS NULL
      ORDER BY v.destacado DESC, v.fecha_publicacion DESC NULLS LAST
      LIMIT ${limit} OFFSET ${offset}
    ` as any[];

  } else {
    // Obtener categoría de tipo 'video'
    const categoryResult = await sql`
      SELECT
        cc.id,
        cc.slug,
        cc.nombre as name,
        cc.descripcion as description,
        cc.traducciones
      FROM categorias_contenido cc
      WHERE cc.tenant_id = ${tenant.id}::uuid
        AND cc.slug = ${categorySlug}
        AND cc.activa = true
        AND cc.tipo = 'video'
      LIMIT 1
    `;

    const categoryResultArray = categoryResult as any[];
    if (!categoryResultArray || categoryResultArray.length === 0) {
      return null;
    }

    const categoryData = categoryResultArray[0];
    const categoryProcessed = utils.processTranslations(categoryData, language);

    category = {
      id: categoryData.id,
      name: utils.getTranslatedField(categoryProcessed, 'name', language) || categoryData.name,
      slug: categoryData.slug,
      description: utils.getTranslatedField(categoryProcessed, 'description', language) || categoryData.description,
    };

    videosResult = await sql`
      SELECT
        v.id,
        v.slug,
        v.titulo,
        v.descripcion,
        v.tipo_video,
        v.video_url,
        v.video_id,
        v.thumbnail,
        v.duracion_segundos,
        v.fecha_publicacion,
        v.vistas,
        v.destacado,
        v.traducciones,
        v.categoria_id,
        ${categoryData.slug} as categoria_slug,
        ${categoryData.name} as categoria_nombre
      FROM videos v
      WHERE v.tenant_id = ${tenant.id}::uuid
        AND v.categoria_id = ${categoryData.id}::uuid
        AND v.publicado = true
      ORDER BY v.destacado DESC, v.fecha_publicacion DESC NULLS LAST
      LIMIT ${limit} OFFSET ${offset}
    ` as any[];

    const countResult = await sql`
      SELECT COUNT(*) as total
      FROM videos
      WHERE tenant_id = ${tenant.id}::uuid
        AND categoria_id = ${categoryData.id}::uuid
        AND publicado = true
    `;
    totalVideos = parseInt((countResult as any[])[0]?.total || '0', 10);
  }

  // Procesar videos
  const videos = (videosResult as any[]).map((item: any) =>
    processVideo(item, language, trackingString)
  );

  // Paginación
  const totalPages = Math.ceil(totalVideos / limit);

  const pagination = {
    page,
    limit,
    total: totalVideos,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };

  category.videoCount = totalVideos;

  const seo = generateVideosCategorySEO(category, language, tenant, totalVideos);

  return {
    type: 'videos-category',
    language,
    tenant,
    seo,
    trackingString,
    category,
    videos,
    pagination,
  };
}

// ============================================================================
// HANDLER: VIDEO INDIVIDUAL
// ============================================================================

async function handleSingleVideo(options: {
  tenant: TenantConfig;
  categorySlug: string;
  videoSlug: string;
  language: string;
  trackingString: string;
}): Promise<VideosSingleResponse | null> {
  const { tenant, categorySlug, videoSlug, language, trackingString } = options;
  const sql = db.getSQL();

  // Query: Video individual
  const videoResult = await sql`
    SELECT
      v.id,
      v.slug,
      v.titulo,
      v.descripcion,
      v.tipo_video,
      v.video_url,
      v.video_id,
      v.embed_code,
      v.thumbnail,
      v.duracion_segundos,
      v.fecha_publicacion,
      v.vistas,
      v.destacado,
      v.traducciones,
      v.categoria_id,
      v.tags,
      v.propiedad_id,
      cc.slug as categoria_slug,
      cc.nombre as categoria_nombre,
      cc.descripcion as categoria_descripcion
    FROM videos v
    LEFT JOIN categorias_contenido cc ON v.categoria_id = cc.id
    WHERE v.tenant_id = ${tenant.id}::uuid
      AND v.slug = ${videoSlug}
      AND v.publicado = true
    LIMIT 1
  `;

  if (!videoResult || (videoResult as any[]).length === 0) {
    return null;
  }

  const videoData = (videoResult as any[])[0];

  // Procesar video
  const video = processVideo(videoData, language, trackingString);

  // Procesar categoría
  const category: VideoCategory | null = videoData.categoria_slug ? {
    id: videoData.categoria_id || '',
    name: videoData.categoria_nombre || 'General',
    slug: videoData.categoria_slug,
    description: videoData.categoria_descripcion,
  } : null;

  // Query: Videos relacionados
  const relatedResult = await sql`
    SELECT
      v.id,
      v.slug,
      v.titulo,
      v.descripcion,
      v.tipo_video,
      v.video_url,
      v.video_id,
      v.thumbnail,
      v.duracion_segundos,
      v.fecha_publicacion,
      v.vistas,
      v.destacado,
      v.traducciones,
      v.categoria_id,
      cc.slug as categoria_slug,
      cc.nombre as categoria_nombre
    FROM videos v
    LEFT JOIN categorias_contenido cc ON v.categoria_id = cc.id
    WHERE v.tenant_id = ${tenant.id}::uuid
      AND v.publicado = true
      AND v.id != ${videoData.id}::uuid
    ORDER BY
      CASE WHEN v.categoria_id = ${videoData.categoria_id}::uuid THEN 0 ELSE 1 END,
      v.fecha_publicacion DESC NULLS LAST
    LIMIT 6
  `;

  const relatedVideos = (relatedResult as any[]).map((item: any) =>
    processVideo(item, language, trackingString)
  );

  // Incrementar vistas
  sql`
    UPDATE videos
    SET vistas = COALESCE(vistas, 0) + 1
    WHERE id = ${videoData.id}
  `.catch((err: unknown) => console.warn('Error updating video views:', err));

  const seo = generateSingleVideoSEO(video, category, language, tenant);

  return {
    type: 'videos-single',
    language,
    tenant,
    seo,
    trackingString,
    video,
    relatedVideos,
    category,
  };
}

// ============================================================================
// GENERADORES DE SEO
// ============================================================================

function generateVideosMainSEO(
  language: string,
  tenant: TenantConfig,
  totalVideos: number
): SEOData {
  const titles: Record<string, string> = {
    es: 'Videos Inmobiliarios',
    en: 'Real Estate Videos',
    fr: 'Vidéos Immobilières',
  };

  const descriptions: Record<string, string> = {
    es: `Descubre ${totalVideos} videos sobre propiedades, tours virtuales y consejos inmobiliarios. Explora nuestro contenido multimedia.`,
    en: `Discover ${totalVideos} videos about properties, virtual tours and real estate tips. Explore our multimedia content.`,
    fr: `Découvrez ${totalVideos} vidéos sur les propriétés, visites virtuelles et conseils immobiliers. Explorez notre contenu multimédia.`,
  };

  const canonicalUrl = utils.buildUrl('/videos', language);

  return {
    title: `${titles[language] || titles.es} | ${tenant.name}`,
    description: descriptions[language] || descriptions.es,
    canonical_url: canonicalUrl,
    structured_data: {
      '@context': 'https://schema.org',
      '@type': 'VideoGallery',
      name: titles[language] || titles.es,
      description: descriptions[language] || descriptions.es,
      url: `${tenant.domain}${canonicalUrl}`,
      publisher: {
        '@type': 'Organization',
        name: tenant.name,
      },
    },
  };
}

function generateVideosCategorySEO(
  category: VideoCategory,
  language: string,
  tenant: TenantConfig,
  totalVideos: number
): SEOData {
  const titles: Record<string, string> = {
    es: `Videos de ${category.name}`,
    en: `${category.name} Videos`,
    fr: `Vidéos de ${category.name}`,
  };

  const descriptions: Record<string, string> = {
    es: `Mira ${totalVideos} videos sobre ${category.name.toLowerCase()}. Contenido multimedia de ${tenant.name}.`,
    en: `Watch ${totalVideos} videos about ${category.name.toLowerCase()}. Multimedia content from ${tenant.name}.`,
    fr: `Regardez ${totalVideos} vidéos sur ${category.name.toLowerCase()}. Contenu multimédia de ${tenant.name}.`,
  };

  const canonicalUrl = utils.buildUrl(`/videos/${category.slug}`, language);

  return {
    title: `${titles[language] || titles.es} | ${tenant.name}`,
    description: descriptions[language] || descriptions.es,
    canonical_url: canonicalUrl,
    structured_data: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: titles[language] || titles.es,
      description: descriptions[language] || descriptions.es,
      url: `${tenant.domain}${canonicalUrl}`,
    },
  };
}

function generateSingleVideoSEO(
  video: Video,
  category: VideoCategory | null,
  language: string,
  tenant: TenantConfig
): SEOData {
  const categorySlug = category?.slug || 'general';
  const canonicalUrl = utils.buildUrl(`/videos/${categorySlug}/${video.slug}`, language);

  return {
    title: `${video.title} | ${tenant.name}`,
    description: video.description.substring(0, 160),
    canonical_url: canonicalUrl,
    og_image: video.thumbnail,
    structured_data: {
      '@context': 'https://schema.org',
      '@type': 'VideoObject',
      name: video.title,
      description: video.description,
      thumbnailUrl: video.thumbnail,
      uploadDate: video.publishedAt,
      duration: `PT${Math.floor(video.duration / 60)}M${video.duration % 60}S`,
      embedUrl: video.videoType === 'youtube' && video.videoId
        ? `https://www.youtube.com/embed/${video.videoId}`
        : undefined,
      publisher: {
        '@type': 'Organization',
        name: tenant.name,
      },
    },
  };
}

// ============================================================================
// HANDLER PRINCIPAL EXPORTADO
// ============================================================================

export async function handleVideos(options: {
  tenant: TenantConfig;
  slug?: string;
  categorySlug?: string;
  language: string;
  trackingString: string;
  page: number;
  limit: number;
}): Promise<VideosResponse | { type: '404'; message: string }> {
  const { tenant, slug, categorySlug, language, trackingString, page, limit } = options;

  try {
    // Caso 1: Video individual
    if (slug && categorySlug) {
      const result = await handleSingleVideo({
        tenant,
        categorySlug,
        videoSlug: slug,
        language,
        trackingString,
      });

      if (!result) {
        return {
          type: '404',
          message: getUIText('NOT_FOUND', language),
        };
      }

      return result;
    }

    // Caso 2: Lista por categoría
    if (categorySlug && !slug) {
      const result = await handleVideosCategory({
        tenant,
        categorySlug,
        language,
        trackingString,
        page,
        limit,
      });

      if (!result) {
        return {
          type: '404',
          message: getUIText('NOT_FOUND', language),
        };
      }

      return result;
    }

    // Caso 3: Lista principal
    return await handleVideosMain({
      tenant,
      language,
      trackingString,
      page,
      limit,
    });

  } catch (error) {
    console.error('[Videos Handler] Error:', error);
    throw error;
  }
}

export default {
  handleVideos,
  handleVideosMain,
  handleVideosCategory,
  handleSingleVideo,
};
// Trigger deploy Wed, Jan 14, 2026  8:56:44 PM
