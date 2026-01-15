// api/handlers/content.ts
// Handler para contenido: testimonios, FAQs
// Adaptado al schema real de Neon

import db from '../lib/db';
import utils from '../lib/utils';
import type {
  TenantConfig,
  SEOData
} from '../types';

// ============================================================================
// CATEGORÍAS DE TESTIMONIOS (virtuales - no existen en DB)
// ============================================================================

const TESTIMONIAL_CATEGORIES = {
  compradores: {
    slug: 'compradores',
    name: { es: 'Compradores Exitosos', en: 'Successful Buyers', fr: 'Acheteurs Réussis' },
    description: {
      es: 'Historias reales de familias y personas que encontraron su hogar ideal.',
      en: 'Real stories of families and people who found their ideal home.',
      fr: 'Histoires réelles de familles qui ont trouvé leur maison idéale.'
    }
  },
  vendedores: {
    slug: 'vendedores',
    name: { es: 'Vendedores Satisfechos', en: 'Satisfied Sellers', fr: 'Vendeurs Satisfaits' },
    description: {
      es: 'Propietarios que vendieron sus propiedades de manera rápida y eficiente.',
      en: 'Owners who sold their properties quickly and efficiently.',
      fr: 'Propriétaires qui ont vendu leurs propriétés rapidement et efficacement.'
    }
  },
  inversionistas: {
    slug: 'inversionistas',
    name: { es: 'Inversionistas', en: 'Investors', fr: 'Investisseurs' },
    description: {
      es: 'Inversores que han multiplicado su capital con propiedades dominicanas.',
      en: 'Investors who have multiplied their capital with Dominican properties.',
      fr: 'Investisseurs qui ont multiplié leur capital avec des propriétés dominicaines.'
    }
  },
  inquilinos: {
    slug: 'inquilinos',
    name: { es: 'Inquilinos', en: 'Tenants', fr: 'Locataires' },
    description: {
      es: 'Personas que encontraron el alquiler perfecto con nuestra ayuda.',
      en: 'People who found the perfect rental with our help.',
      fr: 'Personnes qui ont trouvé la location parfaite avec notre aide.'
    }
  }
};

// Categoría por defecto para testimonios
const DEFAULT_CATEGORY = 'compradores';

// ============================================================================
// HANDLER: Testimonios (main, category, single)
// ============================================================================

export async function handleTestimonials(options: {
  tenant: TenantConfig;
  language: string;
  trackingString: string;
  page: number;
  limit: number;
  slug?: string;
  categorySlug?: string;
}): Promise<any> {
  const { tenant, language, trackingString, page, limit, slug, categorySlug } = options;

  // Determinar el tipo de vista
  if (slug && categorySlug) {
    // Vista de testimonio individual: /testimonios/categoria/slug
    return handleSingleTestimonial({ tenant, language, trackingString, slug, categorySlug });
  } else if (categorySlug) {
    // Vista de categoría: /testimonios/categoria
    return handleTestimonialsCategory({ tenant, language, trackingString, categorySlug, page, limit });
  } else {
    // Vista principal: /testimonios
    return handleTestimonialsMain({ tenant, language, trackingString, page, limit });
  }
}

// ============================================================================
// HANDLER: Testimonios Main
// ============================================================================

async function handleTestimonialsMain(options: {
  tenant: TenantConfig;
  language: string;
  trackingString: string;
  page: number;
  limit: number;
}): Promise<any> {
  const { tenant, language, trackingString, page, limit } = options;

  // Obtener testimonios usando la función de db.ts
  const testimonials = await db.getTestimonials(tenant.id, limit) as Record<string, any>[];

  // Procesar testimonios para el formato que espera el frontend
  const processedTestimonials = testimonials.map((item: Record<string, any>) => processTestimonial(item, language, trackingString));

  const total = testimonials.length;

  // Calcular estadísticas
  const featuredCount = testimonials.filter((t: Record<string, any>) => t.is_featured).length;
  const avgRating = testimonials.length > 0
    ? testimonials.reduce((sum: number, t: Record<string, any>) => sum + (parseFloat(t.rating) || 5), 0) / testimonials.length
    : 5;

  // Generar categorías para mostrar en la página principal
  const categories = Object.values(TESTIMONIAL_CATEGORIES).map(cat => ({
    slug: cat.slug,
    name: cat.name[language as keyof typeof cat.name] || cat.name.es,
    description: cat.description[language as keyof typeof cat.description] || cat.description.es,
    url: buildCategoryUrl(cat.slug, language, trackingString),
    count: Math.ceil(total / 4) // Distribuir testimonios entre categorías
  }));

  // Generar SEO
  const seo = generateTestimonialsSEO(language, tenant, total);

  return {
    type: 'testimonials-main',
    language,
    tenant,
    seo,
    trackingString,
    recentTestimonials: processedTestimonials,
    testimonials: processedTestimonials,
    categories,
    stats: {
      totalTestimonials: total,
      averageRating: Math.round(avgRating * 10) / 10,
      totalCategories: Object.keys(TESTIMONIAL_CATEGORIES).length,
      totalViews: 0,
      verifiedClients: featuredCount
    },
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
// HANDLER: Testimonios por Categoría
// ============================================================================

async function handleTestimonialsCategory(options: {
  tenant: TenantConfig;
  language: string;
  trackingString: string;
  categorySlug: string;
  page: number;
  limit: number;
}): Promise<any> {
  const { tenant, language, trackingString, categorySlug, page, limit } = options;

  // Verificar si la categoría existe
  const categoryConfig = TESTIMONIAL_CATEGORIES[categorySlug as keyof typeof TESTIMONIAL_CATEGORIES];

  if (!categoryConfig) {
    // Soft 404: devolver página de categoría con notFound para preservar SEO
    const seo = utils.generateSEO({
      title: `${categorySlug} | Testimonios | ${tenant.name}`,
      description: `Categoría de testimonios`,
      canonicalUrl: buildCategoryUrl(categorySlug, language, ''),
      language,
      siteName: tenant.name
    });

    const breadcrumbs = [
      { name: language === 'en' ? 'Home' : language === 'fr' ? 'Accueil' : 'Inicio', url: language === 'es' ? '/' : `/${language}/` },
      { name: language === 'en' ? 'Testimonials' : language === 'fr' ? 'Témoignages' : 'Testimonios', url: buildBaseUrl(language) },
      { name: categorySlug, url: buildCategoryUrl(categorySlug, language, '') }
    ];

    // Obtener todos los testimonios para mostrar contenido alternativo
    const testimonials = await db.getTestimonials(tenant.id, limit) as Record<string, any>[];
    const processedTestimonials = testimonials.map((item: Record<string, any>) =>
      processTestimonial(item, language, trackingString, DEFAULT_CATEGORY)
    );

    return {
      type: 'testimonials-category',
      notFound: true,
      notFoundMessage: language === 'en' ? 'Category not found' : language === 'fr' ? 'Catégorie non trouvée' : 'Categoría no encontrada',
      language,
      tenant,
      seo: { ...seo, breadcrumbs },
      trackingString,
      category: {
        slug: categorySlug,
        name: categorySlug,
        description: '',
        url: buildCategoryUrl(categorySlug, language, trackingString)
      },
      categorySlug,
      testimonials: processedTestimonials,
      suggestedCategories: Object.values(TESTIMONIAL_CATEGORIES).map(cat => ({
        slug: cat.slug,
        name: cat.name[language as keyof typeof cat.name] || cat.name.es,
        url: buildCategoryUrl(cat.slug, language, trackingString)
      })),
      stats: {
        totalTestimonials: processedTestimonials.length
      },
      pagination: {
        page,
        limit,
        total_items: processedTestimonials.length,
        total_pages: Math.ceil(processedTestimonials.length / limit),
        has_next: false,
        has_prev: false
      }
    };
  }

  // Obtener todos los testimonios
  const testimonials = await db.getTestimonials(tenant.id, 100) as Record<string, any>[];

  // Procesar testimonios para esta categoría
  const processedTestimonials = testimonials.map((item: Record<string, any>) =>
    processTestimonial(item, language, trackingString, categorySlug)
  );

  const total = processedTestimonials.length;

  // Generar SEO para categoría
  const categoryName = categoryConfig.name[language as keyof typeof categoryConfig.name] || categoryConfig.name.es;
  const categoryDescription = categoryConfig.description[language as keyof typeof categoryConfig.description] || categoryConfig.description.es;

  const seo = utils.generateSEO({
    title: `${categoryName} | Testimonios | ${tenant.name}`,
    description: categoryDescription,
    canonicalUrl: buildCategoryUrl(categorySlug, language, ''),
    language,
    siteName: tenant.name
  });

  // Breadcrumbs separados
  const breadcrumbs = [
    { name: language === 'en' ? 'Home' : language === 'fr' ? 'Accueil' : 'Inicio', url: language === 'es' ? '/' : `/${language}/` },
    { name: language === 'en' ? 'Testimonials' : language === 'fr' ? 'Témoignages' : 'Testimonios', url: buildBaseUrl(language) },
    { name: categoryName, url: buildCategoryUrl(categorySlug, language, '') }
  ];

  return {
    type: 'testimonials-category',
    language,
    tenant,
    seo: { ...seo, breadcrumbs },
    trackingString,
    category: {
      slug: categorySlug,
      name: categoryName,
      description: categoryDescription,
      url: buildCategoryUrl(categorySlug, language, trackingString)
    },
    categorySlug,
    testimonials: processedTestimonials,
    stats: {
      totalTestimonials: total
    },
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
// HANDLER: Testimonio Individual
// ============================================================================

async function handleSingleTestimonial(options: {
  tenant: TenantConfig;
  language: string;
  trackingString: string;
  slug: string;
  categorySlug: string;
}): Promise<any> {
  const { tenant, language, trackingString, slug, categorySlug } = options;

  // Obtener todos los testimonios y buscar el específico
  const testimonials = await db.getTestimonials(tenant.id, 100) as Record<string, any>[];

  const testimonialItem = testimonials.find((t: Record<string, any>) => {
    const itemSlug = t.slug || `testimonio-${t.id?.substring(0, 8) || 'default'}`;
    return itemSlug === slug;
  });

  // Verificar categoría
  const categoryConfig = TESTIMONIAL_CATEGORIES[categorySlug as keyof typeof TESTIMONIAL_CATEGORIES]
    || TESTIMONIAL_CATEGORIES[DEFAULT_CATEGORY];
  const categoryName = categoryConfig.name[language as keyof typeof categoryConfig.name] || categoryConfig.name.es;

  if (!testimonialItem) {
    // Soft 404: devolver página de testimonio individual con notFound para preservar SEO
    const testimonialUrl = buildTestimonialUrl(categorySlug, slug, language, trackingString);

    const seo = utils.generateSEO({
      title: `Testimonio | ${tenant.name}`,
      description: language === 'en' ? 'Testimonial not found' : language === 'fr' ? 'Témoignage non trouvé' : 'Testimonio no encontrado',
      canonicalUrl: testimonialUrl,
      language,
      siteName: tenant.name
    });

    const breadcrumbs = [
      { name: language === 'en' ? 'Home' : language === 'fr' ? 'Accueil' : 'Inicio', url: language === 'es' ? '/' : `/${language}/` },
      { name: language === 'en' ? 'Testimonials' : language === 'fr' ? 'Témoignages' : 'Testimonios', url: buildBaseUrl(language) },
      { name: categoryName, url: buildCategoryUrl(categorySlug, language, '') },
      { name: slug, url: testimonialUrl }
    ];

    // Obtener testimonios para mostrar como contenido alternativo
    const relatedTestimonials = testimonials
      .slice(0, 6)
      .map((t: Record<string, any>) => processTestimonial(t, language, trackingString, categorySlug));

    return {
      type: 'testimonials-single',
      notFound: true,
      notFoundMessage: language === 'en' ? 'Testimonial not found' : language === 'fr' ? 'Témoignage non trouvé' : 'Testimonio no encontrado',
      language,
      tenant,
      seo: { ...seo, breadcrumbs },
      trackingString,
      testimonial: {
        id: '',
        title: language === 'en' ? 'Testimonial not found' : language === 'fr' ? 'Témoignage non trouvé' : 'Testimonio no encontrado',
        excerpt: '',
        fullTestimonial: '',
        rating: 5,
        clientName: '',
        clientAvatar: '',
        clientLocation: '',
        clientVerified: false,
        url: testimonialUrl,
        slug: slug,
        agent: { name: '', avatar: '', slug: '', position: '' }
      },
      category: {
        slug: categorySlug,
        name: categoryName
      },
      relatedTestimonials,
      suggestedTestimonials: relatedTestimonials,
      crossContent: {
        testimonials: relatedTestimonials,
        videos: [],
        articles: [],
        properties: []
      }
    };
  }

  const processedTestimonial = processTestimonial(testimonialItem, language, trackingString, categorySlug);

  // Obtener contenido completo
  const fullTestimonial = typeof testimonialItem.content === 'string'
    ? testimonialItem.content
    : testimonialItem.content?.[language] || testimonialItem.content?.es || '';

  // Obtener testimonios relacionados (otros de la misma "categoría")
  const relatedTestimonials = testimonials
    .filter((t: Record<string, any>) => t.id !== testimonialItem.id)
    .slice(0, 6)
    .map((t: Record<string, any>) => processTestimonial(t, language, trackingString, categorySlug));

  // Generar SEO
  const seo = utils.generateSEO({
    title: `${processedTestimonial.title} - ${processedTestimonial.clientName} | ${tenant.name}`,
    description: processedTestimonial.excerpt,
    canonicalUrl: processedTestimonial.url,
    language,
    siteName: tenant.name
  });

  // Breadcrumbs separados
  const breadcrumbs = [
    { name: language === 'en' ? 'Home' : language === 'fr' ? 'Accueil' : 'Inicio', url: language === 'es' ? '/' : `/${language}/` },
    { name: language === 'en' ? 'Testimonials' : language === 'fr' ? 'Témoignages' : 'Testimonios', url: buildBaseUrl(language) },
    { name: categoryName, url: buildCategoryUrl(categorySlug, language, '') },
    { name: processedTestimonial.clientName, url: processedTestimonial.url }
  ];

  return {
    type: 'testimonials-single',
    language,
    tenant,
    seo: { ...seo, breadcrumbs },
    trackingString,
    testimonial: {
      ...processedTestimonial,
      fullTestimonial: fullTestimonial
    },
    category: {
      slug: categorySlug,
      name: categoryName
    },
    relatedTestimonials,
    crossContent: {
      testimonials: relatedTestimonials,
      videos: [],
      articles: [],
      properties: []
    }
  };
}

// ============================================================================
// HANDLER: FAQs (usando mock_faqs)
// ============================================================================

export async function handleFAQs(options: {
  tenant: TenantConfig;
  language: string;
  trackingString: string;
  limit?: number;
}): Promise<any> {
  const { tenant, language, trackingString, limit = 20 } = options;

  // Obtener FAQs usando la función de db.ts
  const faqs = await db.getFAQs({ tenantId: tenant.id, limit }) as Record<string, any>[];

  // Agrupar por categoría
  const categoriesMap = new Map<string, any[]>();
  faqs.forEach((faq: Record<string, any>) => {
    const category = faq.category || 'general';
    if (!categoriesMap.has(category)) {
      categoriesMap.set(category, []);
    }
    categoriesMap.get(category)!.push({
      id: faq.id,
      question: faq.question,
      answer: faq.answer,
      order: faq.order
    });
  });

  const groupedFaqs = Array.from(categoriesMap.entries()).map(([category, items]) => ({
    category,
    items
  }));

  // Generar SEO
  const seo = generateFAQsSEO(language, tenant, faqs.length);

  return {
    type: 'faqs',
    language,
    tenant,
    seo,
    trackingString,
    faqs: faqs.map((f: Record<string, any>) => ({
      id: f.id,
      question: f.question,
      answer: f.answer,
      category: f.category,
      order: f.order
    })),
    groupedFaqs
  };
}

// ============================================================================
// FUNCIONES AUXILIARES DE URL
// ============================================================================

function buildBaseUrl(language: string): string {
  if (language === 'en') return '/en/testimonials';
  if (language === 'fr') return '/fr/temoignages';
  return '/testimonios';
}

function buildCategoryUrl(categorySlug: string, language: string, trackingString: string): string {
  const base = buildBaseUrl(language);
  return `${base}/${categorySlug}${trackingString}`;
}

function buildTestimonialUrl(categorySlug: string, testimonialSlug: string, language: string, trackingString: string): string {
  const base = buildBaseUrl(language);
  return `${base}/${categorySlug}/${testimonialSlug}${trackingString}`;
}

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

// Función local que usa la utilidad unificada con opciones específicas para testimonios
function processTestimonial(
  item: Record<string, any>,
  language: string,
  trackingString: string = '',
  categorySlug: string = DEFAULT_CATEGORY
): any {
  return utils.formatTestimonial(item, language, { trackingString, categorySlug });
}

function generateTestimonialsSEO(
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

function generateFAQsSEO(
  language: string,
  tenant: TenantConfig,
  total: number
): SEOData {
  const titles = {
    es: 'Preguntas Frecuentes',
    en: 'Frequently Asked Questions',
    fr: 'Questions Fréquentes'
  };

  const descriptions = {
    es: `Encuentra respuestas a las ${total} preguntas más frecuentes sobre bienes raíces y nuestros servicios.`,
    en: `Find answers to the ${total} most frequently asked questions about real estate and our services.`,
    fr: `Trouvez des réponses aux ${total} questions les plus fréquemment posées sur l'immobilier et nos services.`
  };

  return utils.generateSEO({
    title: `${titles[language as keyof typeof titles]} | ${tenant.name}`,
    description: descriptions[language as keyof typeof descriptions],
    canonicalUrl: utils.buildUrl('/faqs', language),
    language,
    siteName: tenant.name
  });
}

export default {
  handleTestimonials,
  handleFAQs
};
