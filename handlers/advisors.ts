// api/handlers/advisors.ts
// Handler para asesores inmobiliarios

import db from '../lib/db';
import utils from '../lib/utils';
import type {
  AdvisorsListResponse,
  SingleAdvisorResponse,
  Advisor,
  PropertyCard,
  TenantConfig,
  SEOData
} from '../types';

// ============================================================================
// HANDLER: Lista de Asesores
// ============================================================================

export async function handleAdvisorsList(options: {
  tenant: TenantConfig;
  language: string;
  trackingString: string;
  page: number;
  limit: number;
}): Promise<AdvisorsListResponse> {
  const { tenant, language, trackingString, page, limit } = options;
  const sql = db.getSQL();
  const offset = (page - 1) * limit;

  // Obtener asesores activos
  const advisors = await sql`
    SELECT
      u.id,
      u.slug,
      u.nombre as first_name,
      u.apellido as last_name,
      CONCAT(u.nombre, ' ', u.apellido) as full_name,
      u.email,
      u.telefono as phone,
      u.whatsapp,
      u.avatar as photo_url,
      u.activo as active,
      pa.bio,
      pa.especialidades as specialties,
      pa.idiomas as languages,
      pa.certificaciones as certifications,
      pa.redes_sociales as social,
      pa.estadisticas as stats,
      pa.destacado as is_featured,
      (
        SELECT COUNT(*)
        FROM propiedad_asesores pas
        JOIN propiedades p ON pas.propiedad_id = p.id
        WHERE pas.asesor_id = u.id AND p.estado = 'disponible'
      ) as properties_count
    FROM usuarios u
    LEFT JOIN perfiles_asesor pa ON u.id = pa.usuario_id
    WHERE u.tenant_id = ${tenant.id}
      AND u.activo = true
      AND u.rol IN ('asesor', 'admin', 'gerente')
    ORDER BY pa.destacado DESC NULLS LAST, properties_count DESC, u.nombre
    LIMIT ${limit} OFFSET ${offset}
  `;

  // Contar total
  const countResult = await sql`
    SELECT COUNT(*) as total
    FROM usuarios u
    WHERE u.tenant_id = ${tenant.id}
      AND u.activo = true
      AND u.rol IN ('asesor', 'admin', 'gerente')
  `;

  const total = parseInt(countResult[0]?.total || '0', 10);

  // Procesar asesores
  const processedAdvisors = advisors.map(a => processAdvisor(a, language, trackingString));

  // Generar SEO
  const seo = generateAdvisorsListSEO(language, tenant, total);

  return {
    pageType: 'advisors-list',
    language,
    tenant,
    seo,
    trackingString,
    advisors: processedAdvisors,
    totalAdvisors: total,
    pagination: {
      page,
      limit,
      total_items: total,
      total_pages: Math.ceil(total / limit),
      has_next: page * limit < total,
      has_prev: page > 1
    }
  };
}

// ============================================================================
// HANDLER: Asesor Individual
// ============================================================================

export async function handleSingleAdvisor(options: {
  tenant: TenantConfig;
  advisorSlug: string;
  language: string;
  trackingString: string;
}): Promise<SingleAdvisorResponse | null> {
  const { tenant, advisorSlug, language, trackingString } = options;
  const sql = db.getSQL();

  // Obtener asesor
  const rawAdvisor = await db.getAdvisorBySlug(advisorSlug, tenant.id);

  if (!rawAdvisor) {
    return null;
  }

  // Procesar asesor
  const advisor = processAdvisor(rawAdvisor, language, trackingString);

  // Obtener propiedades del asesor
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
    JOIN propiedad_asesores pa ON p.id = pa.propiedad_id
    LEFT JOIN categorias_propiedades cp ON p.categoria_id = cp.id
    LEFT JOIN ubicaciones s ON p.sector_id = s.id
    LEFT JOIN ubicaciones c ON p.ciudad_id = c.id
    WHERE pa.asesor_id = ${rawAdvisor.id}
      AND p.tenant_id = ${tenant.id}
      AND p.estado = 'disponible'
    ORDER BY p.destacada DESC, p.created_at DESC
    LIMIT 12
  `;

  const propertyCards: PropertyCard[] = properties.map(p =>
    utils.toPropertyCard(p, language, trackingString)
  );

  // Obtener testimonios del asesor
  const testimonials = await sql`
    SELECT
      t.id,
      t.slug,
      t.contenido as content,
      t.calificacion as rating,
      t.nombre_cliente as client_name,
      t.foto_cliente as client_photo,
      t.ubicacion_cliente as client_location,
      t.tipo_transaccion as transaction_type,
      t.destacado as is_featured,
      t.created_at
    FROM testimonios t
    WHERE t.asesor_id = ${rawAdvisor.id}
      AND t.tenant_id = ${tenant.id}
      AND t.estado = 'aprobado'
    ORDER BY t.destacado DESC, t.created_at DESC
    LIMIT 6
  `;

  // Obtener contenido relacionado (artículos del asesor)
  const relatedArticles = await sql`
    SELECT
      a.id,
      a.slug,
      a.titulo as title,
      a.titulo_en,
      a.titulo_fr,
      a.extracto as excerpt,
      a.imagen_destacada as featured_image,
      a.fecha_publicacion as published_at
    FROM articulos a
    WHERE a.autor_id = ${rawAdvisor.id}
      AND a.tenant_id = ${tenant.id}
      AND a.estado = 'publicado'
    ORDER BY a.fecha_publicacion DESC
    LIMIT 3
  `;

  // Generar SEO
  const seo = generateSingleAdvisorSEO(advisor, language, tenant, propertyCards.length);

  return {
    pageType: 'advisor-single',
    language,
    tenant,
    seo,
    trackingString,
    advisor,
    properties: propertyCards,
    testimonials: testimonials.map(t => ({
      id: t.id,
      slug: t.slug,
      created_at: t.created_at,
      updated_at: t.created_at,
      content: { es: t.content },
      rating: t.rating || 5,
      client_name: t.client_name,
      client_photo: t.client_photo,
      client_location: t.client_location,
      transaction_type: t.transaction_type,
      status: 'approved' as const,
      is_featured: t.is_featured || false
    })),
    relatedContent: {
      articles: relatedArticles.map(a => ({
        id: a.id,
        slug: a.slug,
        title: utils.getTranslatedField(a, 'title', language),
        excerpt: a.excerpt,
        featured_image: a.featured_image,
        published_at: a.published_at,
        url: utils.buildUrl(`/articulos/${a.slug}`, language, trackingString)
      })),
      videos: []
    }
  };
}

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

function processAdvisor(
  raw: Record<string, any>,
  language: string,
  trackingString: string
): Advisor {
  // Procesar bio multilingüe
  let bio = raw.bio;
  if (typeof bio === 'object' && bio !== null) {
    // Ya es un objeto con traducciones
  } else if (typeof bio === 'string') {
    bio = { es: bio };
  } else {
    bio = { es: '' };
  }

  // Procesar estadísticas
  let stats = raw.stats || raw.estadisticas;
  if (typeof stats === 'string') {
    try {
      stats = JSON.parse(stats);
    } catch {
      stats = {};
    }
  }

  // Procesar redes sociales
  let social = raw.social || raw.redes_sociales;
  if (typeof social === 'string') {
    try {
      social = JSON.parse(social);
    } catch {
      social = {};
    }
  }

  // Procesar arrays
  const parseArray = (value: any): string[] => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return value.split(',').map(s => s.trim()).filter(Boolean);
      }
    }
    return [];
  };

  return {
    id: raw.id,
    slug: raw.slug,
    created_at: raw.created_at,
    updated_at: raw.updated_at,

    first_name: raw.first_name || raw.nombre,
    last_name: raw.last_name || raw.apellido,
    full_name: raw.full_name || `${raw.nombre} ${raw.apellido}`.trim(),

    email: raw.email,
    phone: raw.phone || raw.telefono,
    whatsapp: raw.whatsapp,

    photo_url: raw.photo_url || raw.avatar,
    bio,

    specialties: parseArray(raw.specialties || raw.especialidades),
    languages: parseArray(raw.languages || raw.idiomas),
    certifications: parseArray(raw.certifications || raw.certificaciones),

    stats: {
      properties_count: parseInt(raw.properties_count || stats?.properties_count || '0', 10),
      sales_count: stats?.sales_count || stats?.ventas_count || 0,
      years_experience: stats?.years_experience || stats?.anos_experiencia || 0,
      rating: stats?.rating || stats?.calificacion
    },

    social: {
      instagram: social?.instagram,
      facebook: social?.facebook,
      linkedin: social?.linkedin,
      twitter: social?.twitter,
      youtube: social?.youtube
    },

    active: raw.active !== false && raw.activo !== false,
    is_featured: raw.is_featured || raw.destacado || false,

    url: utils.buildUrl(`/asesores/${raw.slug}`, language, trackingString)
  };
}

function generateAdvisorsListSEO(
  language: string,
  tenant: TenantConfig,
  total: number
): SEOData {
  const titles = {
    es: 'Nuestros Asesores Inmobiliarios',
    en: 'Our Real Estate Advisors',
    fr: 'Nos Conseillers Immobiliers'
  };

  const descriptions = {
    es: `Conoce a nuestro equipo de ${total} asesores inmobiliarios profesionales. Expertos en bienes raíces listos para ayudarte.`,
    en: `Meet our team of ${total} professional real estate advisors. Real estate experts ready to help you.`,
    fr: `Découvrez notre équipe de ${total} conseillers immobiliers professionnels. Des experts prêts à vous aider.`
  };

  const slugs = {
    es: 'asesores',
    en: 'advisors',
    fr: 'conseillers'
  };

  return utils.generateSEO({
    title: `${titles[language as keyof typeof titles]} | ${tenant.name}`,
    description: descriptions[language as keyof typeof descriptions],
    keywords: 'asesores inmobiliarios, agentes de bienes raíces, expertos inmobiliarios',
    canonicalUrl: utils.buildUrl(`/${slugs[language as keyof typeof slugs]}`, language),
    language,
    siteName: tenant.name
  });
}

function generateSingleAdvisorSEO(
  advisor: Advisor,
  language: string,
  tenant: TenantConfig,
  propertiesCount: number
): SEOData {
  const bioText = utils.getLocalizedText(advisor.bio, language);
  const specialtiesText = advisor.specialties.slice(0, 3).join(', ');

  const titles = {
    es: `${advisor.full_name} - Asesor Inmobiliario`,
    en: `${advisor.full_name} - Real Estate Advisor`,
    fr: `${advisor.full_name} - Conseiller Immobilier`
  };

  const descriptions = {
    es: bioText
      ? bioText.substring(0, 150)
      : `${advisor.full_name}, asesor inmobiliario con ${propertiesCount} propiedades activas. ${specialtiesText ? `Especializado en: ${specialtiesText}` : ''}`,
    en: bioText
      ? bioText.substring(0, 150)
      : `${advisor.full_name}, real estate advisor with ${propertiesCount} active properties. ${specialtiesText ? `Specialized in: ${specialtiesText}` : ''}`,
    fr: bioText
      ? bioText.substring(0, 150)
      : `${advisor.full_name}, conseiller immobilier avec ${propertiesCount} propriétés actives. ${specialtiesText ? `Spécialisé en: ${specialtiesText}` : ''}`
  };

  return utils.generateSEO({
    title: `${titles[language as keyof typeof titles]} | ${tenant.name}`,
    description: descriptions[language as keyof typeof descriptions],
    keywords: `${advisor.full_name}, asesor inmobiliario, ${specialtiesText}`,
    canonicalUrl: advisor.url,
    ogImage: advisor.photo_url,
    language,
    siteName: tenant.name
  });
}

export default {
  handleAdvisorsList,
  handleSingleAdvisor
};
