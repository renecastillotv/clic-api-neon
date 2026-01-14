// api/handlers/content.ts
// Handler para contenido: testimonios, FAQs
// Adaptado al schema real de Neon (usa mock_testimonios y mock_faqs)

import db from '../lib/db';
import utils from '../lib/utils';
import type {
  TestimonialsResponse,
  FAQsResponse,
  Testimonial,
  TenantConfig,
  SEOData
} from '../types';

// ============================================================================
// HANDLER: Testimonios (usando mock_testimonios)
// ============================================================================

export async function handleTestimonials(options: {
  tenant: TenantConfig;
  language: string;
  trackingString: string;
  page: number;
  limit: number;
}): Promise<TestimonialsResponse> {
  const { tenant, language, trackingString, page, limit } = options;

  // Obtener testimonios usando la función de db.ts
  const testimonials = await db.getTestimonials(tenant.id, limit);

  // Procesar testimonios
  const processedTestimonials = testimonials.map(item => processTestimonial(item, language));

  const total = testimonials.length;

  // Generar SEO
  const seo = generateTestimonialsSEO(language, tenant, total);

  return {
    type: 'testimonials-main',
    language,
    tenant,
    seo,
    trackingString,
    testimonials: processedTestimonials,
    categories: [],
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
// HANDLER: FAQs (usando mock_faqs)
// ============================================================================

export async function handleFAQs(options: {
  tenant: TenantConfig;
  language: string;
  trackingString: string;
  limit?: number;
}): Promise<FAQsResponse> {
  const { tenant, language, trackingString, limit = 20 } = options;

  // Obtener FAQs usando la función de db.ts
  const faqs = await db.getFAQs({ tenantId: tenant.id, limit });

  // Agrupar por categoría
  const categoriesMap = new Map<string, any[]>();
  faqs.forEach(faq => {
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
    faqs: faqs.map(f => ({
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
// FUNCIONES AUXILIARES
// ============================================================================

function processTestimonial(item: Record<string, any>, language: string): Testimonial {
  return {
    id: item.id,
    content: {
      es: item.content,
      en: item.content,
      fr: item.content
    },
    rating: item.rating || 5,
    client_name: item.client_name,
    client_photo: item.client_photo,
    client_location: item.client_location,
    transaction_type: undefined,
    property_type: item.property_type,
    status: 'approved' as const,
    is_featured: item.is_featured || false
  };
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
