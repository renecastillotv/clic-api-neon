// api/handlers/homepage.ts
// Handler para la página de inicio

import db from '../lib/db';
import utils from '../lib/utils';
import type {
  HomepageResponse,
  TenantConfig,
  PropertyCard,
  HotItems,
  SEOData
} from '../types';

// ============================================================================
// HANDLER: Homepage
// ============================================================================

export async function handleHomepage(options: {
  tenant: TenantConfig;
  language: string;
  trackingString: string;
}): Promise<HomepageResponse> {
  const { tenant, language, trackingString } = options;
  const sql = db.getSQL();

  // Obtener datos en paralelo
  const [
    heroSection,
    featuredProperties,
    hotItems,
    searchTags,
    quickStats,
    testimonials,
    advisors,
    recentContent
  ] = await Promise.all([
    getHeroSection(tenant.id, language),
    getFeaturedProperties(tenant.id, language, trackingString),
    getHotItems(tenant.id, language, trackingString),
    getSearchTags(tenant.id, language),
    getQuickStats(tenant.id),
    getFeaturedTestimonials(tenant.id, language),
    getFeaturedAdvisors(tenant.id, language, trackingString),
    getRecentContent(tenant.id, language, trackingString)
  ]);

  // Construir secciones
  const sections = [];

  // Hero section
  sections.push({
    type: 'hero',
    data: heroSection
  });

  // Property carousel
  if (featuredProperties.length > 0) {
    sections.push({
      type: 'property-carousel',
      data: {
        title: getTranslatedText('Propiedades Destacadas', 'Featured Properties', 'Propriétés en Vedette', language),
        properties: featuredProperties
      }
    });
  }

  // Testimonials
  if (testimonials.length > 0) {
    sections.push({
      type: 'testimonials',
      data: {
        title: getTranslatedText('Lo que dicen nuestros clientes', 'What our clients say', 'Ce que disent nos clients', language),
        testimonials
      }
    });
  }

  // Advisors
  if (advisors.length > 0) {
    sections.push({
      type: 'advisors',
      data: {
        title: getTranslatedText('Nuestro Equipo', 'Our Team', 'Notre Équipe', language),
        advisors
      }
    });
  }

  // Content mix (articles + videos)
  if (recentContent.articles.length > 0 || recentContent.videos.length > 0) {
    sections.push({
      type: 'content-mix',
      data: {
        articles: recentContent.articles,
        videos: recentContent.videos
      }
    });
  }

  // FAQs
  const faqs = await db.getFAQs({ tenantId: tenant.id, context: 'general', limit: 6 });
  if (faqs.length > 0) {
    sections.push({
      type: 'faq',
      data: {
        title: getTranslatedText('Preguntas Frecuentes', 'Frequently Asked Questions', 'Questions Fréquentes', language),
        faqs: faqs.map(f => ({
          question: utils.getTranslatedField(f, 'question', language),
          answer: utils.getTranslatedField(f, 'answer', language)
        }))
      }
    });
  }

  // Generar SEO
  const seo = generateHomepageSEO(tenant, language);

  return {
    pageType: 'homepage',
    language,
    tenant,
    seo,
    trackingString,
    sections,
    searchTags,
    hotItems,
    quickStats
  };
}

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

async function getHeroSection(tenantId: number, language: string) {
  const sql = db.getSQL();

  // Obtener configuración del hero desde la BD o usar defaults
  const config = await sql`
    SELECT configuracion
    FROM tenants
    WHERE id = ${tenantId}
  `;

  const tenantConfig = config[0]?.configuracion || {};
  const heroConfig = tenantConfig.homepage?.hero || {};

  const titles = {
    es: heroConfig.title_es || 'Encuentra tu hogar ideal',
    en: heroConfig.title_en || 'Find your ideal home',
    fr: heroConfig.title_fr || 'Trouvez votre maison idéale'
  };

  const subtitles = {
    es: heroConfig.subtitle_es || 'Miles de propiedades te esperan',
    en: heroConfig.subtitle_en || 'Thousands of properties await you',
    fr: heroConfig.subtitle_fr || 'Des milliers de propriétés vous attendent'
  };

  return {
    title: titles[language as keyof typeof titles] || titles.es,
    subtitle: subtitles[language as keyof typeof subtitles] || subtitles.es,
    backgroundImage: heroConfig.background_image || 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=1920&h=1080&fit=crop&auto=format&q=80',
    showSearch: heroConfig.show_search !== false
  };
}

async function getFeaturedProperties(
  tenantId: number,
  language: string,
  trackingString: string
): Promise<PropertyCard[]> {
  const sql = db.getSQL();

  const properties = await sql`
    SELECT
      p.*,
      cp.nombre as categoria_nombre,
      cp.slug as categoria_slug,
      s.nombre as sector_nombre,
      s.slug as sector_slug,
      c.nombre as ciudad_nombre,
      c.slug as ciudad_slug
    FROM propiedades p
    LEFT JOIN categorias_propiedades cp ON p.categoria_id = cp.id
    LEFT JOIN ubicaciones s ON p.sector_id = s.id
    LEFT JOIN ubicaciones c ON p.ciudad_id = c.id
    WHERE p.tenant_id = ${tenantId}
      AND p.estado = 'disponible'
      AND p.destacada = true
    ORDER BY p.created_at DESC
    LIMIT 12
  `;

  return properties.map(p => utils.toPropertyCard(p, language, trackingString));
}

async function getHotItems(
  tenantId: number,
  language: string,
  trackingString: string
): Promise<HotItems> {
  const sql = db.getSQL();

  // Obtener ciudades populares
  const cities = await sql`
    SELECT
      u.slug,
      u.nombre as name,
      COUNT(p.id) as count
    FROM ubicaciones u
    JOIN propiedades p ON p.ciudad_id = u.id
    WHERE u.tenant_id = ${tenantId}
      AND u.activo = true
      AND u.tipo = 'ciudad'
      AND p.estado = 'disponible'
    GROUP BY u.id, u.slug, u.nombre
    HAVING COUNT(p.id) >= 3
    ORDER BY count DESC
    LIMIT 8
  `;

  // Obtener sectores populares
  const sectors = await sql`
    SELECT
      u.slug,
      u.nombre as name,
      COUNT(p.id) as count
    FROM ubicaciones u
    JOIN propiedades p ON p.sector_id = u.id
    WHERE u.tenant_id = ${tenantId}
      AND u.activo = true
      AND u.tipo = 'sector'
      AND p.estado = 'disponible'
    GROUP BY u.id, u.slug, u.nombre
    HAVING COUNT(p.id) >= 2
    ORDER BY count DESC
    LIMIT 8
  `;

  // Obtener agentes destacados
  const agents = await sql`
    SELECT
      u.slug,
      CONCAT(u.nombre, ' ', u.apellido) as name,
      u.avatar as photo_url
    FROM usuarios u
    LEFT JOIN perfiles_asesor pa ON u.id = pa.usuario_id
    WHERE u.tenant_id = ${tenantId}
      AND u.activo = true
      AND u.rol IN ('asesor', 'admin', 'gerente')
      AND pa.destacado = true
    ORDER BY u.nombre
    LIMIT 4
  `;

  // Obtener proyectos
  const projects = await sql`
    SELECT
      slug,
      nombre as name,
      imagen_principal as image
    FROM proyectos
    WHERE tenant_id = ${tenantId}
      AND activo = true
    ORDER BY destacado DESC, created_at DESC
    LIMIT 4
  `;

  // Obtener propiedades nuevas
  const newProperties = await sql`
    SELECT
      p.*,
      cp.nombre as categoria_nombre,
      cp.slug as categoria_slug,
      s.nombre as sector_nombre,
      s.slug as sector_slug,
      c.nombre as ciudad_nombre,
      c.slug as ciudad_slug
    FROM propiedades p
    LEFT JOIN categorias_propiedades cp ON p.categoria_id = cp.id
    LEFT JOIN ubicaciones s ON p.sector_id = s.id
    LEFT JOIN ubicaciones c ON p.ciudad_id = c.id
    WHERE p.tenant_id = ${tenantId}
      AND p.estado = 'disponible'
      AND p.created_at > NOW() - INTERVAL '30 days'
    ORDER BY p.created_at DESC
    LIMIT 6
  `;

  const operationSlugs = {
    es: 'comprar',
    en: 'buy',
    fr: 'acheter'
  };
  const opSlug = operationSlugs[language as keyof typeof operationSlugs] || 'comprar';

  return {
    cities: cities.map(c => ({
      slug: c.slug,
      title: c.name,
      url: utils.buildUrl(`/${opSlug}/${c.slug}`, language, trackingString),
      count: parseInt(c.count, 10)
    })),
    sectors: sectors.map(s => ({
      slug: s.slug,
      title: s.name,
      url: utils.buildUrl(`/${opSlug}/${s.slug}`, language, trackingString),
      count: parseInt(s.count, 10)
    })),
    properties: newProperties.map(p => utils.toPropertyCard(p, language, trackingString)),
    agents: agents.map(a => ({
      slug: a.slug,
      name: a.name,
      photo_url: a.photo_url,
      url: utils.buildUrl(`/asesores/${a.slug}`, language, trackingString)
    })),
    projects: projects.map(p => ({
      slug: p.slug,
      name: p.name,
      image: p.image,
      url: utils.buildUrl(`/proyectos/${p.slug}`, language, trackingString)
    }))
  };
}

async function getSearchTags(tenantId: number, language: string) {
  const sql = db.getSQL();

  // Obtener categorías de propiedades
  const categories = await sql`
    SELECT id, slug, nombre as name, nombre_en, nombre_fr
    FROM categorias_propiedades
    WHERE tenant_id = ${tenantId} AND activo = true
    ORDER BY nombre
  `;

  // Obtener ubicaciones jerárquicas
  const locations = await sql`
    SELECT id, slug, nombre as name, tipo as type, parent_id
    FROM ubicaciones
    WHERE tenant_id = ${tenantId} AND activo = true
    ORDER BY tipo, nombre
  `;

  // Organizar ubicaciones por tipo
  const provincias = locations.filter(l => l.type === 'provincia');
  const ciudades = locations.filter(l => l.type === 'ciudad');
  const sectores = locations.filter(l => l.type === 'sector');

  // Construir jerarquía
  const locationHierarchy = provincias.map(prov => ({
    ...prov,
    name: utils.getTranslatedField(prov, 'name', language),
    children: ciudades
      .filter(c => c.parent_id === prov.id)
      .map(city => ({
        ...city,
        name: utils.getTranslatedField(city, 'name', language),
        children: sectores.filter(s => s.parent_id === city.id).map(sector => ({
          ...sector,
          name: utils.getTranslatedField(sector, 'name', language)
        }))
      }))
  }));

  return {
    tags: {
      tipo: categories.map(c => ({
        id: c.id,
        slug: c.slug,
        name: utils.getTranslatedField(c, 'name', language)
      })),
      provincia: provincias.map(p => ({ id: p.id, slug: p.slug, name: p.name })),
      ciudad: ciudades.map(c => ({ id: c.id, slug: c.slug, name: c.name })),
      sector: sectores.map(s => ({ id: s.id, slug: s.slug, name: s.name }))
    },
    locationHierarchy,
    currencies: {
      available: ['USD', 'DOP'],
      default: 'USD'
    }
  };
}

async function getQuickStats(tenantId: number) {
  const sql = db.getSQL();

  const stats = await sql`
    SELECT
      COUNT(*) FILTER (WHERE estado = 'disponible') as total_properties,
      COUNT(*) FILTER (WHERE estado = 'disponible' AND precio_venta IS NOT NULL) as for_sale,
      COUNT(*) FILTER (WHERE estado = 'disponible' AND precio_alquiler IS NOT NULL) as for_rent,
      COUNT(*) FILTER (WHERE estado = 'disponible' AND created_at > NOW() - INTERVAL '30 days') as new_this_month
    FROM propiedades
    WHERE tenant_id = ${tenantId}
  `;

  const s = stats[0] || {};

  return {
    total_properties: parseInt(s.total_properties || '0', 10),
    for_sale: parseInt(s.for_sale || '0', 10),
    for_rent: parseInt(s.for_rent || '0', 10),
    new_this_month: parseInt(s.new_this_month || '0', 10)
  };
}

async function getFeaturedTestimonials(tenantId: number, language: string) {
  const sql = db.getSQL();

  const testimonials = await sql`
    SELECT
      t.id,
      t.contenido as content,
      t.calificacion as rating,
      t.nombre_cliente as client_name,
      t.foto_cliente as client_photo,
      t.ubicacion_cliente as client_location,
      u.nombre as advisor_name,
      u.avatar as advisor_photo
    FROM testimonios t
    LEFT JOIN usuarios u ON t.asesor_id = u.id
    WHERE t.tenant_id = ${tenantId}
      AND t.estado = 'aprobado'
      AND t.destacado = true
    ORDER BY t.created_at DESC
    LIMIT 6
  `;

  return testimonials.map(t => ({
    id: t.id,
    content: t.content,
    rating: t.rating || 5,
    client_name: t.client_name,
    client_photo: t.client_photo,
    client_location: t.client_location,
    advisor: t.advisor_name ? {
      name: t.advisor_name,
      photo_url: t.advisor_photo
    } : undefined
  }));
}

async function getFeaturedAdvisors(tenantId: number, language: string, trackingString: string) {
  const sql = db.getSQL();

  const advisors = await sql`
    SELECT
      u.slug,
      u.nombre as first_name,
      u.apellido as last_name,
      CONCAT(u.nombre, ' ', u.apellido) as name,
      u.avatar,
      pa.bio,
      pa.idiomas as languages,
      pa.especialidades as specialties
    FROM usuarios u
    LEFT JOIN perfiles_asesor pa ON u.id = pa.usuario_id
    WHERE u.tenant_id = ${tenantId}
      AND u.activo = true
      AND u.rol IN ('asesor', 'admin', 'gerente')
      AND pa.destacado = true
    ORDER BY u.nombre
    LIMIT 4
  `;

  return advisors.map(a => {
    let languages = a.languages;
    if (typeof languages === 'string') {
      try { languages = JSON.parse(languages); } catch { languages = []; }
    }

    let specialties = a.specialties;
    if (typeof specialties === 'string') {
      try { specialties = JSON.parse(specialties); } catch { specialties = []; }
    }

    return {
      slug: a.slug,
      name: a.name,
      avatar: a.avatar,
      bio: a.bio,
      languages: Array.isArray(languages) ? languages : [],
      specialties: Array.isArray(specialties) ? specialties : [],
      url: utils.buildUrl(`/asesores/${a.slug}`, language, trackingString)
    };
  });
}

async function getRecentContent(tenantId: number, language: string, trackingString: string) {
  const sql = db.getSQL();

  const [articles, videos] = await Promise.all([
    sql`
      SELECT
        id, slug, titulo as title, titulo_en, titulo_fr,
        extracto as excerpt, imagen_destacada as image,
        fecha_publicacion as published_at
      FROM articulos
      WHERE tenant_id = ${tenantId}
        AND estado = 'publicado'
      ORDER BY fecha_publicacion DESC
      LIMIT 3
    `,
    sql`
      SELECT
        id, slug, titulo as title, titulo_en, titulo_fr,
        thumbnail, video_url, duracion as duration
      FROM videos
      WHERE tenant_id = ${tenantId}
        AND estado = 'publicado'
      ORDER BY fecha_publicacion DESC
      LIMIT 3
    `
  ]);

  return {
    articles: articles.map(a => ({
      id: a.id,
      slug: a.slug,
      title: utils.getTranslatedField(a, 'title', language),
      excerpt: a.excerpt,
      image: a.image,
      published_at: a.published_at,
      url: utils.buildUrl(`/articulos/${a.slug}`, language, trackingString)
    })),
    videos: videos.map(v => ({
      id: v.id,
      slug: v.slug,
      title: utils.getTranslatedField(v, 'title', language),
      thumbnail: v.thumbnail,
      video_url: v.video_url,
      duration: v.duration,
      url: utils.buildUrl(`/videos/${v.slug}`, language, trackingString)
    }))
  };
}

function getTranslatedText(es: string, en: string, fr: string, language: string): string {
  switch (language) {
    case 'en': return en;
    case 'fr': return fr;
    default: return es;
  }
}

function generateHomepageSEO(tenant: TenantConfig, language: string): SEOData {
  const titles = {
    es: `${tenant.name} - Bienes Raíces y Propiedades`,
    en: `${tenant.name} - Real Estate and Properties`,
    fr: `${tenant.name} - Immobilier et Propriétés`
  };

  const descriptions = {
    es: `Encuentra tu hogar ideal con ${tenant.name}. Amplia selección de propiedades en venta y alquiler. Asesores expertos a tu servicio.`,
    en: `Find your ideal home with ${tenant.name}. Wide selection of properties for sale and rent. Expert advisors at your service.`,
    fr: `Trouvez votre maison idéale avec ${tenant.name}. Large sélection de propriétés à vendre et à louer. Des conseillers experts à votre service.`
  };

  return utils.generateSEO({
    title: titles[language as keyof typeof titles] || titles.es,
    description: descriptions[language as keyof typeof descriptions] || descriptions.es,
    keywords: 'bienes raíces, propiedades, casas, apartamentos, venta, alquiler, inmobiliaria',
    canonicalUrl: utils.buildUrl('/', language),
    language,
    siteName: tenant.name
  });
}

export default {
  handleHomepage
};
