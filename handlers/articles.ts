// handlers/articles.ts
// Handler completo para artículos: main, category, single
// Basado en MAPEO_LAYOUT_BD.md y DOCUMENTACION_LAYOUTS_COMPLETA.md

import db from '../lib/db';
import utils from '../lib/utils';
import type { TenantConfig, SEOData } from '../types';

// ============================================================================
// TIPOS ESPECÍFICOS PARA ARTÍCULOS
// ============================================================================

interface Author {
  id: string;
  name: string;
  avatar: string;
  slug: string | null;
  position: string | null;
  bio: string | null;
  email: string | null;
  phone: string | null;
}

interface ArticleCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  articleCount?: number;
  url?: string;
}

interface Article {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content?: string;
  featuredImage: string;
  publishedAt: string;
  views: number;
  readTime: string;
  readTimeMinutes: number;
  featured: boolean;
  url: string;
  author: Author;
  category?: ArticleCategory;
  tags?: Array<{ id: string; name: string; slug: string }>;
}

interface ArticlesMainResponse {
  type: 'articles-main';
  language: string;
  tenant: TenantConfig;
  seo: SEOData;
  trackingString: string;
  featuredArticles: Article[];
  recentArticles: Article[];
  categories: ArticleCategory[];
  stats: {
    totalArticles: number;
    totalCategories: number;
    totalViews: number;
    averageReadTime: number;
    publishedThisMonth: number;
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

interface ArticlesCategoryResponse {
  type: 'articles-category';
  language: string;
  tenant: TenantConfig;
  seo: SEOData;
  trackingString: string;
  category: ArticleCategory;
  articles: Article[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

interface ArticlesSingleResponse {
  type: 'articles-single';
  language: string;
  tenant: TenantConfig;
  seo: SEOData;
  trackingString: string;
  article: Article;
  relatedArticles: Article[];
  category: ArticleCategory;
}

type ArticlesResponse = ArticlesMainResponse | ArticlesCategoryResponse | ArticlesSingleResponse;

// ============================================================================
// TEXTOS UI POR IDIOMA
// ============================================================================

const UI_TEXTS: Record<string, Record<string, string>> = {
  es: {
    HOME: 'Inicio',
    ARTICLES: 'Artículos',
    MINUTES_READ: 'min de lectura',
    TEAM_CLIC: 'Equipo CLIC',
    NOT_FOUND: 'Artículo no encontrado',
    NOT_FOUND_DESC: 'El artículo que buscas no existe o ha sido eliminado.',
  },
  en: {
    HOME: 'Home',
    ARTICLES: 'Articles',
    MINUTES_READ: 'min read',
    TEAM_CLIC: 'CLIC Team',
    NOT_FOUND: 'Article not found',
    NOT_FOUND_DESC: 'The article you are looking for does not exist or has been removed.',
  },
  fr: {
    HOME: 'Accueil',
    ARTICLES: 'Articles',
    MINUTES_READ: 'min de lecture',
    TEAM_CLIC: 'Équipe CLIC',
    NOT_FOUND: 'Article non trouvé',
    NOT_FOUND_DESC: "L'article que vous recherchez n'existe pas ou a été supprimé.",
  },
};

function getUIText(key: string, language: string): string {
  return UI_TEXTS[language]?.[key] || UI_TEXTS.es[key] || key;
}

// ============================================================================
// HELPER: CALCULAR TIEMPO DE LECTURA
// ============================================================================

function calculateReadTime(content: string | null): number {
  if (!content) return 5;
  const wordsPerMinute = 200;
  const textOnly = content.replace(/<[^>]*>/g, ''); // Remover HTML
  const words = textOnly.split(/\s+/).length;
  return Math.max(1, Math.ceil(words / wordsPerMinute));
}

// ============================================================================
// HELPER: PROCESAR ARTÍCULO
// ============================================================================

function processArticle(
  item: Record<string, any>,
  language: string,
  trackingString: string,
  includeContent: boolean = false,
  tenant?: TenantConfig
): Article {
  // Procesar traducciones
  const processed = utils.processTranslations(item, language);

  // Obtener campos traducidos
  const title = utils.getTranslatedField(processed, 'titulo', language) || processed.titulo || '';
  const excerpt = utils.getTranslatedField(processed, 'extracto', language) || processed.extracto || '';
  const content = includeContent
    ? (utils.getTranslatedField(processed, 'contenido', language) || processed.contenido || '')
    : undefined;

  // Calcular tiempo de lectura
  const readTimeMinutes = processed.tiempo_lectura || calculateReadTime(processed.contenido);

  // Construir URL del artículo
  const categorySlug = processed.categoria_slug || 'general';
  const articleSlug = processed.slug;
  const basePath = language === 'es'
    ? `/articulos/${categorySlug}/${articleSlug}`
    : `/${language}/articles/${categorySlug}/${articleSlug}`;
  const url = basePath + trackingString;

  // Procesar autor - usar isotipo del tenant como fallback para avatar
  const fallbackAvatar = tenant?.branding?.isotipo_url || tenant?.branding?.logo_url || '/images/team/clic-experts.jpg';
  const author: Author = {
    id: processed.autor_id || '',
    name: processed.autor_nombre
      ? `${processed.autor_nombre} ${processed.autor_apellido || ''}`.trim()
      : getUIText('TEAM_CLIC', language),
    avatar: processed.autor_foto || processed.autor_avatar || fallbackAvatar,
    slug: processed.autor_slug || null,
    position: processed.autor_cargo || processed.autor_titulo_profesional || null,
    bio: processed.autor_bio || processed.autor_biografia || null,
    email: processed.autor_email || null,
    phone: processed.autor_telefono || null,
  };

  // Procesar categoría
  const category: ArticleCategory | undefined = processed.categoria_slug ? {
    id: processed.categoria_id || '',
    name: utils.getTranslatedField(processed, 'categoria_nombre', language) || processed.categoria_nombre || processed.categoria_slug,
    slug: processed.categoria_slug,
  } : undefined;

  // Procesar tags si existen
  let tags: Array<{ id: string; name: string; slug: string }> | undefined;
  if (processed.etiquetas && Array.isArray(processed.etiquetas)) {
    tags = processed.etiquetas.map((tag: any) => ({
      id: tag.id || '',
      name: tag.nombre || tag.name || '',
      slug: tag.slug || '',
    }));
  }

  return {
    id: processed.id,
    slug: articleSlug,
    title,
    excerpt,
    content,
    featuredImage: processed.imagen_principal || processed.imagen_destacada || '/images/placeholder-article.jpg',
    publishedAt: processed.fecha_publicacion || processed.created_at,
    views: processed.vistas || 0,
    readTime: `${readTimeMinutes} ${getUIText('MINUTES_READ', language)}`,
    readTimeMinutes,
    featured: processed.destacado || false,
    url,
    author,
    category,
    tags,
  };
}

// ============================================================================
// HANDLER: ARTÍCULOS MAIN
// ============================================================================

async function handleArticlesMain(options: {
  tenant: TenantConfig;
  language: string;
  trackingString: string;
  page: number;
  limit: number;
}): Promise<ArticlesMainResponse> {
  const { tenant, language, trackingString, page, limit } = options;
  const sql = db.getSQL();
  const offset = (page - 1) * limit;

  try {
    // Query: Artículos destacados
    const featuredResult = await sql`
      SELECT
        a.id,
        a.slug,
        a.titulo,
        a.extracto,
        a.imagen_principal,
        a.fecha_publicacion,
        a.vistas,
        a.destacado,
        a.traducciones,
        a.categoria_id,
        a.autor_id,
        COALESCE(u.nombre, a.autor_nombre) as autor_nombre,
        u.apellido as autor_apellido,
        COALESCE(pa.foto_url, u.avatar_url, a.autor_foto) as autor_foto,
        u.avatar_url as autor_avatar,
        pa.slug as autor_slug,
        pa.titulo_profesional as autor_cargo,
        pa.biografia as autor_bio,
        cc.slug as categoria_slug,
        cc.nombre as categoria_nombre,
        cc.traducciones as categoria_traducciones
      FROM articulos a
      LEFT JOIN categorias_contenido cc ON a.categoria_id = cc.id
      LEFT JOIN usuarios u ON a.autor_id = u.id
      LEFT JOIN perfiles_asesor pa ON u.id = pa.usuario_id AND pa.tenant_id = a.tenant_id
      WHERE a.tenant_id = ${tenant.id}
        AND a.publicado = true
        AND (a.estado IS NULL OR a.estado = 'publicado')
        AND a.destacado = true
      ORDER BY a.fecha_publicacion DESC NULLS LAST
      LIMIT 6
    `;

    // Query: Artículos recientes (paginados)
    const recentResult = await sql`
      SELECT
        a.id,
        a.slug,
        a.titulo,
        a.extracto,
        a.imagen_principal,
        a.fecha_publicacion,
        a.vistas,
        a.destacado,
        a.traducciones,
        a.categoria_id,
        a.autor_id,
        COALESCE(u.nombre, a.autor_nombre) as autor_nombre,
        u.apellido as autor_apellido,
        COALESCE(pa.foto_url, u.avatar_url, a.autor_foto) as autor_foto,
        u.avatar_url as autor_avatar,
        pa.slug as autor_slug,
        pa.titulo_profesional as autor_cargo,
        pa.biografia as autor_bio,
        cc.slug as categoria_slug,
        cc.nombre as categoria_nombre,
        cc.traducciones as categoria_traducciones
      FROM articulos a
      LEFT JOIN categorias_contenido cc ON a.categoria_id = cc.id
      LEFT JOIN usuarios u ON a.autor_id = u.id
      LEFT JOIN perfiles_asesor pa ON u.id = pa.usuario_id AND pa.tenant_id = a.tenant_id
      WHERE a.tenant_id = ${tenant.id}
        AND a.publicado = true
        AND (a.estado IS NULL OR a.estado = 'publicado')
      ORDER BY a.destacado DESC, a.fecha_publicacion DESC NULLS LAST
      LIMIT ${limit} OFFSET ${offset}
    `;

    // Query: TODAS las categorías de tipo 'articulo' del tenant (con o sin artículos)
    const categoriesResult = await sql`
      SELECT
        cc.id,
        cc.slug,
        cc.nombre as name,
        cc.descripcion as description,
        cc.traducciones,
        cc.tipo,
        COALESCE((
          SELECT COUNT(*)
          FROM articulos a
          WHERE a.categoria_id = cc.id
            AND a.publicado = true
            AND (a.estado IS NULL OR a.estado = 'publicado')
            AND a.tenant_id = ${tenant.id}
        ), 0) as article_count
      FROM categorias_contenido cc
      WHERE cc.tenant_id = ${tenant.id}
        AND cc.activa = true
        AND cc.tipo = 'articulo'
      ORDER BY cc.orden ASC, cc.nombre ASC
    `;

    // Query: Estadísticas
    const statsResult = await sql`
      SELECT
        COUNT(*) as total_articles,
        COALESCE(SUM(vistas), 0) as total_views,
        COUNT(CASE WHEN destacado = true THEN 1 END) as featured_count,
        COUNT(CASE WHEN fecha_publicacion >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 END) as published_this_month
      FROM articulos
      WHERE tenant_id = ${tenant.id}
        AND publicado = true
        AND (estado IS NULL OR estado = 'publicado')
    `;

    // Query: Total para paginación
    const countResult = await sql`
      SELECT COUNT(*) as total
      FROM articulos
      WHERE tenant_id = ${tenant.id}
        AND publicado = true
        AND (estado IS NULL OR estado = 'publicado')
    `;

    // Procesar artículos destacados
    const featuredArticles = (featuredResult as any[]).map((item: any) =>
      processArticle(item, language, trackingString, false, tenant)
    );

    // Procesar artículos recientes
    const recentArticles = (recentResult as any[]).map((item: any) =>
      processArticle(item, language, trackingString, false, tenant)
    );

    // Procesar categorías - filtrar las que no tienen artículos y agregar URL
    const categories: ArticleCategory[] = (categoriesResult as any[])
      .map((cat: any) => {
        const catProcessed = utils.processTranslations(cat, language);
        const articleCount = parseInt(cat.article_count || '0', 10);
        return {
          id: cat.id,
          name: utils.getTranslatedField(catProcessed, 'name', language) || cat.name,
          slug: cat.slug,
          description: utils.getTranslatedField(catProcessed, 'description', language) || cat.description,
          articleCount,
          url: utils.buildUrl(`/articulos/${cat.slug}`, language),
        };
      })
      .filter((cat) => cat.articleCount > 0); // Solo mostrar categorías con artículos

    // Verificar si hay artículos sin categoría
    const uncategorizedResult = await sql`
      SELECT COUNT(*) as count
      FROM articulos
      WHERE tenant_id = ${tenant.id}
        AND publicado = true
        AND (estado IS NULL OR estado = 'publicado')
        AND categoria_id IS NULL
    `;
    const uncategorizedCount = parseInt((uncategorizedResult as any[])[0]?.count || '0', 10);

    // Si hay artículos sin categoría, agregar categoría "General"
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
        description: language === 'es' ? 'Artículos generales' : 'General articles',
        articleCount: uncategorizedCount,
        url: utils.buildUrl('/articulos/general', language),
      });
    }

    // Procesar estadísticas
    const statsData = (statsResult as any[])[0] || {};
    const totalArticles = parseInt((countResult as any[])[0]?.total || '0', 10);

    const stats = {
      totalArticles,
      totalCategories: categories.length,
      totalViews: parseInt(statsData.total_views || '0', 10),
      averageReadTime: 5, // Default, ya que no hay campo tiempo_lectura
      publishedThisMonth: parseInt(statsData.published_this_month || '0', 10),
      featuredCount: parseInt(statsData.featured_count || '0', 10),
    };

    // Construir SEO
    const seo = generateArticlesMainSEO(language, tenant, stats.totalArticles);

    // Paginación
    const totalPages = Math.ceil(totalArticles / limit) || 1;
    const pagination = {
      page,
      limit,
      total: totalArticles,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };

    return {
      type: 'articles-main',
      language,
      tenant,
      seo,
      trackingString,
      featuredArticles,
      recentArticles,
      categories,
      stats,
      pagination,
    };
  } catch (error) {
    console.error('[Articles Main Handler] Error:', error);
    // Retornar respuesta vacía en caso de error
    return {
      type: 'articles-main',
      language,
      tenant,
      seo: generateArticlesMainSEO(language, tenant, 0),
      trackingString,
      featuredArticles: [],
      recentArticles: [],
      categories: [],
      stats: {
        totalArticles: 0,
        totalCategories: 0,
        totalViews: 0,
        averageReadTime: 5,
        publishedThisMonth: 0,
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
// HANDLER: ARTÍCULOS POR CATEGORÍA
// ============================================================================

async function handleArticlesCategory(options: {
  tenant: TenantConfig;
  categorySlug: string;
  language: string;
  trackingString: string;
  page: number;
  limit: number;
}): Promise<ArticlesCategoryResponse | null> {
  const { tenant, categorySlug, language, trackingString, page, limit } = options;
  const sql = db.getSQL();
  const offset = (page - 1) * limit;

  let category: ArticleCategory;
  let articlesResult: any[];
  let totalArticles: number;

  // Caso especial: categoría "general" para artículos sin categoría
  if (categorySlug === 'general') {
    // Verificar si hay artículos sin categoría
    const countResult = await sql`
      SELECT COUNT(*) as total
      FROM articulos
      WHERE tenant_id = ${tenant.id}
        AND publicado = true
        AND (estado IS NULL OR estado = 'publicado')
        AND categoria_id IS NULL
    `;
    totalArticles = parseInt((countResult as any[])[0]?.total || '0', 10);

    if (totalArticles === 0) {
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
      description: language === 'es' ? 'Artículos generales' : 'General articles',
    };

    // Query: Artículos sin categoría
    articlesResult = await sql`
      SELECT
        a.id,
        a.slug,
        a.titulo,
        a.extracto,
        a.imagen_principal,
        a.fecha_publicacion,
        a.vistas,
        a.destacado,
        a.traducciones,
        a.categoria_id,
        a.autor_id,
        COALESCE(u.nombre, a.autor_nombre) as autor_nombre,
        u.apellido as autor_apellido,
        COALESCE(pa.foto_url, u.avatar_url, a.autor_foto) as autor_foto,
        u.avatar_url as autor_avatar,
        pa.slug as autor_slug,
        pa.titulo_profesional as autor_cargo,
        pa.biografia as autor_bio,
        'general' as categoria_slug,
        ${category.name} as categoria_nombre
      FROM articulos a
      LEFT JOIN usuarios u ON a.autor_id = u.id
      LEFT JOIN perfiles_asesor pa ON u.id = pa.usuario_id AND pa.tenant_id = a.tenant_id
      WHERE a.tenant_id = ${tenant.id}
        AND a.publicado = true
        AND (a.estado IS NULL OR a.estado = 'publicado')
        AND a.categoria_id IS NULL
      ORDER BY a.destacado DESC, a.fecha_publicacion DESC NULLS LAST
      LIMIT ${limit} OFFSET ${offset}
    ` as any[];

  } else {
    // Obtener categoría de tipo 'articulo' por slug
    const categoryResult = await sql`
      SELECT
        cc.id,
        cc.slug,
        cc.nombre as name,
        cc.descripcion as description,
        cc.traducciones
      FROM categorias_contenido cc
      WHERE cc.tenant_id = ${tenant.id}
        AND cc.slug = ${categorySlug}
        AND cc.activa = true
        AND cc.tipo = 'articulo'
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

    // Query: Artículos de la categoría
    articlesResult = await sql`
      SELECT
        a.id,
        a.slug,
        a.titulo,
        a.extracto,
        a.imagen_principal,
        a.fecha_publicacion,
        a.vistas,
        a.destacado,
        a.traducciones,
        a.categoria_id,
        a.autor_id,
        COALESCE(u.nombre, a.autor_nombre) as autor_nombre,
        u.apellido as autor_apellido,
        COALESCE(pa.foto_url, u.avatar_url, a.autor_foto) as autor_foto,
        u.avatar_url as autor_avatar,
        pa.slug as autor_slug,
        pa.titulo_profesional as autor_cargo,
        pa.biografia as autor_bio,
        ${categoryData.slug} as categoria_slug,
        ${categoryData.name} as categoria_nombre
      FROM articulos a
      LEFT JOIN usuarios u ON a.autor_id = u.id
      LEFT JOIN perfiles_asesor pa ON u.id = pa.usuario_id AND pa.tenant_id = a.tenant_id
      WHERE a.tenant_id = ${tenant.id}
        AND a.categoria_id = ${categoryData.id}
        AND a.publicado = true
        AND (a.estado IS NULL OR a.estado = 'publicado')
      ORDER BY a.destacado DESC, a.fecha_publicacion DESC NULLS LAST
      LIMIT ${limit} OFFSET ${offset}
    ` as any[];

    // Query: Total
    const countResult = await sql`
      SELECT COUNT(*) as total
      FROM articulos
      WHERE tenant_id = ${tenant.id}
        AND categoria_id = ${categoryData.id}
        AND publicado = true
        AND (estado IS NULL OR estado = 'publicado')
    `;
    totalArticles = parseInt((countResult as any[])[0]?.total || '0', 10);
  }

  // Procesar artículos
  const articles = (articlesResult as any[]).map((item: any) =>
    processArticle(item, language, trackingString, false, tenant)
  );

  // Paginación
  const totalPages = Math.ceil(totalArticles / limit);

  const pagination = {
    page,
    limit,
    total: totalArticles,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };

  // Actualizar conteo en categoría
  category.articleCount = totalArticles;

  // Construir SEO
  const seo = generateArticlesCategorySEO(category, language, tenant, totalArticles);

  return {
    type: 'articles-category',
    language,
    tenant,
    seo,
    trackingString,
    category,
    articles,
    pagination,
  };
}

// ============================================================================
// HANDLER: ARTÍCULO INDIVIDUAL
// ============================================================================

async function handleSingleArticle(options: {
  tenant: TenantConfig;
  categorySlug: string;
  articleSlug: string;
  language: string;
  trackingString: string;
}): Promise<ArticlesSingleResponse | null> {
  const { tenant, categorySlug, articleSlug, language, trackingString } = options;
  const sql = db.getSQL();

  // Query: Artículo individual con toda la información
  const articleResult = await sql`
    SELECT
      a.id,
      a.slug,
      a.titulo,
      a.extracto,
      a.contenido,
      a.imagen_principal,
      a.imagenes,
      a.fecha_publicacion,
      a.vistas,
      a.destacado,
      a.traducciones,
      a.categoria_id,
      a.autor_id,
      COALESCE(u.nombre, a.autor_nombre) as autor_nombre,
      u.apellido as autor_apellido,
      COALESCE(pa.foto_url, u.avatar_url, a.autor_foto) as autor_foto,
      u.avatar_url as autor_avatar,
      pa.slug as autor_slug,
      pa.titulo_profesional as autor_cargo,
      pa.biografia as autor_bio,
      u.email as autor_email,
      u.telefono as autor_telefono,
      a.meta_titulo,
      a.meta_descripcion,
      a.tags,
      cc.slug as categoria_slug,
      cc.nombre as categoria_nombre,
      cc.descripcion as categoria_descripcion,
      cc.traducciones as categoria_traducciones
    FROM articulos a
    LEFT JOIN categorias_contenido cc ON a.categoria_id = cc.id
    LEFT JOIN usuarios u ON a.autor_id = u.id
    LEFT JOIN perfiles_asesor pa ON u.id = pa.usuario_id AND pa.tenant_id = a.tenant_id
    WHERE a.tenant_id = ${tenant.id}
      AND a.slug = ${articleSlug}
      AND a.publicado = true
      AND (a.estado IS NULL OR a.estado = 'publicado')
    LIMIT 1
  `;

  if (!articleResult || articleResult.length === 0) {
    return null;
  }

  const articleData = articleResult[0] as any;

  // Procesar artículo completo (con contenido)
  const article = processArticle(articleData, language, trackingString, true, tenant);

  // Procesar categoría
  const category: ArticleCategory = {
    id: articleData.categoria_id || '',
    name: utils.getTranslatedField(
      utils.processTranslations({ nombre: articleData.categoria_nombre, traducciones: articleData.categoria_traducciones }, language),
      'nombre',
      language
    ) || articleData.categoria_nombre || 'General',
    slug: articleData.categoria_slug || 'general',
    description: articleData.categoria_descripcion,
  };

  // Query: Artículos relacionados (misma categoría, excluyendo el actual)
  const relatedResult = await sql`
    SELECT
      a.id,
      a.slug,
      a.titulo,
      a.extracto,
      a.imagen_principal,
      a.fecha_publicacion,
      a.vistas,
      a.destacado,
      a.traducciones,
      a.categoria_id,
      a.autor_id,
      COALESCE(u.nombre, a.autor_nombre) as autor_nombre,
      u.apellido as autor_apellido,
      COALESCE(pa.foto_url, u.avatar_url, a.autor_foto) as autor_foto,
      u.avatar_url as autor_avatar,
      pa.slug as autor_slug,
      pa.titulo_profesional as autor_cargo,
      cc.slug as categoria_slug,
      cc.nombre as categoria_nombre
    FROM articulos a
    LEFT JOIN categorias_contenido cc ON a.categoria_id = cc.id
    LEFT JOIN usuarios u ON a.autor_id = u.id
    LEFT JOIN perfiles_asesor pa ON u.id = pa.usuario_id AND pa.tenant_id = a.tenant_id
    WHERE a.tenant_id = ${tenant.id}
      AND a.publicado = true
      AND (a.estado IS NULL OR a.estado = 'publicado')
      AND a.id != ${articleData.id}
    ORDER BY
      CASE WHEN a.categoria_id = ${articleData.categoria_id} THEN 0 ELSE 1 END,
      a.fecha_publicacion DESC NULLS LAST
    LIMIT 4
  `;

  // Procesar artículos relacionados
  const relatedArticles = (relatedResult as any[]).map((item: any) =>
    processArticle(item, language, trackingString, false, tenant)
  );

  // Incrementar vistas (fire and forget)
  sql`
    UPDATE articulos
    SET vistas = COALESCE(vistas, 0) + 1
    WHERE id = ${articleData.id}
  `.catch((err: unknown) => console.warn('Error updating views:', err));

  // Construir SEO
  const seo = generateSingleArticleSEO(article, category, language, tenant);

  return {
    type: 'articles-single',
    language,
    tenant,
    seo,
    trackingString,
    article,
    relatedArticles,
    category,
  };
}

// ============================================================================
// GENERADORES DE SEO
// ============================================================================

function generateArticlesMainSEO(
  language: string,
  tenant: TenantConfig,
  totalArticles: number
): SEOData {
  const titles: Record<string, string> = {
    es: 'Blog y Artículos Inmobiliarios',
    en: 'Real Estate Blog & Articles',
    fr: 'Blog et Articles Immobiliers',
  };

  const descriptions: Record<string, string> = {
    es: `Descubre ${totalArticles} artículos sobre bienes raíces, inversión inmobiliaria y tendencias del mercado. Consejos de expertos para comprar, vender y alquilar propiedades.`,
    en: `Discover ${totalArticles} articles about real estate, property investment and market trends. Expert advice for buying, selling and renting properties.`,
    fr: `Découvrez ${totalArticles} articles sur l'immobilier, l'investissement immobilier et les tendances du marché. Conseils d'experts pour acheter, vendre et louer des propriétés.`,
  };

  const basePath = '/articulos';
  const canonicalUrl = utils.buildUrl(basePath, language);

  return {
    title: `${titles[language] || titles.es} | ${tenant.name}`,
    description: descriptions[language] || descriptions.es,
    canonical_url: canonicalUrl,
    hreflang: utils.generateHreflangUrls(basePath),
    structured_data: {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: titles[language] || titles.es,
      description: descriptions[language] || descriptions.es,
      url: `${tenant.domain}${canonicalUrl}`,
      publisher: {
        '@type': 'Organization',
        name: tenant.name,
        logo: tenant.branding?.logo_url,
      },
    },
  };
}

function generateArticlesCategorySEO(
  category: ArticleCategory,
  language: string,
  tenant: TenantConfig,
  totalArticles: number
): SEOData {
  const titles: Record<string, string> = {
    es: `Artículos sobre ${category.name}`,
    en: `${category.name} Articles`,
    fr: `Articles sur ${category.name}`,
  };

  const descriptions: Record<string, string> = {
    es: `Lee ${totalArticles} artículos sobre ${category.name.toLowerCase()}. Información y consejos de expertos inmobiliarios de ${tenant.name}.`,
    en: `Read ${totalArticles} articles about ${category.name.toLowerCase()}. Information and expert advice from ${tenant.name} real estate professionals.`,
    fr: `Lisez ${totalArticles} articles sur ${category.name.toLowerCase()}. Informations et conseils d'experts immobiliers de ${tenant.name}.`,
  };

  const basePath = `/articulos/${category.slug}`;
  const canonicalUrl = utils.buildUrl(basePath, language);

  return {
    title: `${titles[language] || titles.es} | ${tenant.name}`,
    description: descriptions[language] || descriptions.es,
    canonical_url: canonicalUrl,
    hreflang: utils.generateHreflangUrls(basePath),
    structured_data: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: titles[language] || titles.es,
      description: descriptions[language] || descriptions.es,
      url: `${tenant.domain}${canonicalUrl}`,
    },
  };
}

function generateSingleArticleSEO(
  article: Article,
  category: ArticleCategory,
  language: string,
  tenant: TenantConfig
): SEOData {
  const basePath = `/articulos/${category.slug}/${article.slug}`;
  const canonicalUrl = utils.buildUrl(basePath, language);

  return {
    title: `${article.title} | ${tenant.name}`,
    description: article.excerpt.substring(0, 160),
    canonical_url: canonicalUrl,
    og_image: article.featuredImage,
    hreflang: utils.generateHreflangUrls(basePath),
    structured_data: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: article.title,
      description: article.excerpt,
      image: article.featuredImage,
      datePublished: article.publishedAt,
      author: {
        '@type': 'Person',
        name: article.author.name,
        url: article.author.slug ? `${tenant.domain}/asesores/${article.author.slug}` : undefined,
      },
      publisher: {
        '@type': 'Organization',
        name: tenant.name,
        logo: tenant.branding?.logo_url,
      },
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': `${tenant.domain}${canonicalUrl}`,
      },
    },
  };
}

// ============================================================================
// HANDLER PRINCIPAL EXPORTADO
// ============================================================================

export async function handleArticles(options: {
  tenant: TenantConfig;
  slug?: string;
  categorySlug?: string;
  language: string;
  trackingString: string;
  page: number;
  limit: number;
}): Promise<ArticlesResponse | { type: '404'; message: string }> {
  const { tenant, slug, categorySlug, language, trackingString, page, limit } = options;

  try {
    // Caso 1: Artículo individual (slug proporcionado)
    if (slug && categorySlug) {
      const result = await handleSingleArticle({
        tenant,
        categorySlug,
        articleSlug: slug,
        language,
        trackingString,
      });

      if (!result) {
        // Soft 404: devolver página de artículo con notFound para preservar SEO
        const articleUrl = utils.buildUrl(`/articulos/${categorySlug}/${slug}`, language);

        // Obtener artículos relacionados para mostrar contenido alternativo
        const mainResult = await handleArticlesMain({ tenant, language, trackingString, page: 1, limit: 6 });
        const suggestedArticles = mainResult?.recentArticles || [];

        return {
          type: 'articles-single',
          notFound: true,
          notFoundMessage: getUIText('NOT_FOUND', language),
          language,
          tenant,
          seo: {
            title: `${slug} | ${tenant.name}`,
            description: language === 'en' ? 'Article not found' : language === 'fr' ? 'Article non trouvé' : 'Artículo no encontrado',
            canonical_url: articleUrl,
          },
          trackingString,
          article: {
            id: '',
            slug: slug,
            title: language === 'en' ? 'Article not found' : language === 'fr' ? 'Article non trouvé' : 'Artículo no encontrado',
            excerpt: '',
            content: '',
            featuredImage: '',
            publishedAt: new Date().toISOString(),
            views: 0,
            readTime: '0 min',
            readTimeMinutes: 0,
            featured: false,
            url: articleUrl,
            author: { id: '', name: '', avatar: '', slug: null, position: null, bio: null, email: null, phone: null },
          },
          category: {
            id: '',
            name: categorySlug,
            slug: categorySlug,
          },
          relatedArticles: suggestedArticles,
          suggestedArticles,
        } as any;
      }

      return result;
    }

    // Caso 2: Lista por categoría
    if (categorySlug && !slug) {
      const result = await handleArticlesCategory({
        tenant,
        categorySlug,
        language,
        trackingString,
        page,
        limit,
      });

      if (!result) {
        // Soft 404: devolver página de categoría con notFound para preservar SEO
        const categoryUrl = utils.buildUrl(`/articulos/${categorySlug}`, language);

        // Obtener artículos para mostrar contenido alternativo
        const mainResult = await handleArticlesMain({ tenant, language, trackingString, page: 1, limit: 12 });
        const suggestedArticles = mainResult?.recentArticles || [];
        const categories = mainResult?.categories || [];

        return {
          type: 'articles-category',
          notFound: true,
          notFoundMessage: getUIText('NOT_FOUND', language),
          language,
          tenant,
          seo: {
            title: `${categorySlug} | ${tenant.name}`,
            description: language === 'en' ? 'Category not found' : language === 'fr' ? 'Catégorie non trouvée' : 'Categoría no encontrada',
            canonical_url: categoryUrl,
          },
          trackingString,
          category: {
            id: '',
            name: categorySlug,
            slug: categorySlug,
            description: '',
            articleCount: 0,
          },
          articles: suggestedArticles,
          suggestedCategories: categories,
          pagination: {
            page: 1,
            limit,
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrev: false,
          },
        } as any;
      }

      return result;
    }

    // Caso 3: Lista principal
    return await handleArticlesMain({
      tenant,
      language,
      trackingString,
      page,
      limit,
    });

  } catch (error) {
    console.error('[Articles Handler] Error:', error);
    throw error;
  }
}

export default {
  handleArticles,
  handleArticlesMain,
  handleArticlesCategory,
  handleSingleArticle,
};
