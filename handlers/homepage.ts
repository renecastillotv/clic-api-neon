// api/handlers/homepage.ts
// Handler para la página de inicio
// Formato compatible con Supabase Edge Functions

import db from '../lib/db';
import utils from '../lib/utils';
import type { TenantConfig } from '../types';

// ============================================================================
// HANDLER: Homepage (Formato Supabase)
// ============================================================================

export async function handleHomepage(options: {
  tenant: TenantConfig;
  language: string;
  trackingString: string;
}): Promise<any> {
  const { tenant, language, trackingString } = options;

  // Obtener datos en paralelo usando las funciones de db.ts
  const [
    featuredProperties,
    popularLocations,
    quickStats,
    testimonials,
    advisors,
    faqs
  ] = await Promise.all([
    db.getFeaturedProperties(tenant.id, 12),
    db.getPopularLocations(tenant.id),
    db.getQuickStats(tenant.id),
    db.getTestimonials(tenant.id, 6),
    db.getAdvisors(tenant.id, 4),
    db.getFAQs({ tenantId: tenant.id, limit: 6 })
  ]);

  // Convertir propiedades al formato Supabase
  const properties = featuredProperties.map(p => toSupabasePropertyFormat(p, language, trackingString));

  // Construir searchTags en formato Supabase
  const searchTags = buildSearchTags(popularLocations, language);

  // Construir sections
  const sections = buildHomepageSections(tenant, featuredProperties, testimonials, advisors, faqs, language, trackingString);

  // Generar SEO
  const seo = generateHomepageSEO(tenant, language);

  // Generar breadcrumbs
  const breadcrumbs = [
    { name: 'Inicio', url: '/', is_active: true, is_current_page: true, position: 0 }
  ];

  // Respuesta en formato compatible con Supabase
  return {
    type: 'homepage',
    available: true,
    searchResults: {
      properties,
      tags: searchTags.tags,
      searchTerms: [],
      pagination: {
        currentPage: 1,
        totalCount: properties.length,
        itemsPerPage: 12,
        totalPages: 1,
        hasMore: false,
        hasNextPage: false,
        hasPreviousPage: false
      }
    },
    relatedContent: {
      articles: [],
      videos: [],
      testimonials: testimonials.map(t => ({
        id: t.id,
        content: t.content,
        rating: t.rating || 5,
        client_name: t.client_name,
        client_photo: t.client_photo,
        client_location: t.client_location,
        is_featured: t.is_featured
      })),
      faqs: faqs.map(f => ({
        id: f.id,
        question: f.question,
        answer: f.answer,
        category: f.category,
        order: f.order
      })),
      seo_content: [],
      content_source: 'neon_db',
      hierarchy_info: {
        specific_count: 0,
        tag_related_count: faqs.length + testimonials.length,
        default_count: 0
      },
      carousels: [{
        id: 'featured',
        title: language === 'en' ? 'Featured Properties' : language === 'fr' ? 'Propriétés en Vedette' : 'Propiedades Destacadas',
        properties: properties.slice(0, 6)
      }]
    },
    referralAgent: null,
    breadcrumbs,
    seo,
    countryInfo: {
      code: tenant.regional?.country_code || 'DO',
      name: 'República Dominicana',
      currency: tenant.regional?.currency_default || 'USD'
    },
    // Campos adicionales específicos del homepage
    sections,
    searchTags,
    hotItems: {
      cities: popularLocations.cities.map((c: any) => ({
        slug: c.slug,
        title: c.name,
        url: utils.buildUrl(`/comprar/${c.slug}`, language, trackingString),
        count: parseInt(c.count, 10)
      })),
      sectors: popularLocations.sectors.map((s: any) => ({
        slug: s.slug,
        title: s.name,
        url: utils.buildUrl(`/comprar/${s.slug}`, language, trackingString),
        count: parseInt(s.count, 10)
      })),
      properties: properties.slice(0, 6),
      agents: advisors.slice(0, 4).map((a: any) => ({
        slug: a.slug,
        name: `${a.nombre} ${a.apellido}`.trim(),
        photo_url: a.foto_url || a.avatar_url,
        url: utils.buildUrl(`/asesores/${a.slug}`, language, trackingString)
      })),
      projects: []
    },
    quickStats: {
      total_properties: quickStats.total_properties,
      for_sale: quickStats.for_sale,
      for_rent: quickStats.for_rent,
      new_this_month: quickStats.new_this_month
    },
    advisors: advisors.map((a: any) => ({
      id: a.perfil_id || a.usuario_id,
      slug: a.slug,
      name: `${a.nombre} ${a.apellido}`.trim(),
      photo_url: a.foto_url || a.avatar_url,
      titulo_profesional: a.titulo_profesional,
      biografia: a.biografia,
      properties_count: parseInt(a.propiedades_count || '0', 10),
      experiencia_anos: a.experiencia_anos,
      especialidades: a.especialidades,
      destacado: a.destacado,
      url: utils.buildUrl(`/asesores/${a.slug}`, language, trackingString)
    })),
    meta: {
      timestamp: new Date().toISOString(),
      source: 'neon_edge_function',
      tenant_id: tenant.id,
      language
    }
  };
}

// ============================================================================
// FUNCIONES DE CONVERSIÓN
// ============================================================================

function toSupabasePropertyFormat(prop: any, language: string, trackingString: string): any {
  const salePrice = prop.precio_venta ? parseFloat(prop.precio_venta) : null;
  const rentalPrice = prop.precio_alquiler ? parseFloat(prop.precio_alquiler) : null;
  const currency = prop.moneda_venta || prop.moneda_alquiler || prop.moneda || 'USD';
  const operationType = salePrice ? 'venta' : 'alquiler';
  const displayPrice = salePrice || rentalPrice || 0;

  const pricingUnified = {
    display_price: {
      formatted: utils.formatPrice(displayPrice, currency, operationType, language),
      amount: displayPrice,
      currency
    },
    operation_type: operationType,
    ...(salePrice && {
      sale: {
        price: salePrice,
        currency: prop.moneda_venta || currency,
        formatted: utils.formatPrice(salePrice, prop.moneda_venta || currency, 'venta', language)
      }
    }),
    ...(rentalPrice && {
      rental: {
        price: rentalPrice,
        currency: prop.moneda_alquiler || currency,
        formatted: utils.formatPrice(rentalPrice, prop.moneda_alquiler || currency, 'alquiler', language)
      }
    })
  };

  const mainImage = prop.imagen_principal || '';
  const slugUrl = buildPropertySlugUrl(prop, language);

  return {
    id: prop.id,
    code: prop.codigo || prop.id,
    name: prop.titulo || 'Propiedad sin nombre',
    description: prop.descripcion || prop.short_description || '',
    agent_id: prop.agente_id || prop.perfil_asesor_id,
    slug_url: slugUrl,
    sale_price: salePrice,
    sale_currency: prop.moneda_venta || currency,
    rental_price: rentalPrice,
    rental_currency: prop.moneda_alquiler || currency,
    temp_rental_price: null,
    temp_rental_currency: currency,
    furnished_rental_price: null,
    furnished_rental_currency: currency,
    bedrooms: prop.habitaciones || 0,
    bathrooms: prop.banos || 0,
    parking_spots: prop.estacionamientos || prop.parking || 0,
    built_area: prop.m2_construccion || prop.area_construida || null,
    land_area: prop.m2_terreno || prop.area_total || null,
    main_image_url: mainImage,
    gallery_images_url: '',
    property_status: prop.estado_propiedad || 'disponible',
    is_project: prop.is_project || false,
    delivery_date: null,
    project_detail_id: null,
    exact_coordinates: null,
    show_exact_location: false,
    property_categories: {
      name: formatPropertyType(prop.tipo, language),
      description: ''
    },
    cities: {
      name: prop.ciudad || '',
      coordinates: null,
      provinces: { name: prop.provincia || '', coordinates: null }
    },
    sectors: {
      name: prop.sector || '',
      coordinates: null
    },
    property_images: mainImage ? [{ url: mainImage, title: 'Imagen Principal', is_main: true, sort_order: 0 }] : [],
    pricing_unified: pricingUnified,
    main_image_optimized: mainImage,
    images_unified: mainImage ? [{ url: mainImage, optimized_url: mainImage, is_main: true, sort_order: 0, position: 0 }] : [],
    images_count: mainImage ? 1 : 0,
    location: {
      address: prop.direccion || '',
      sector: prop.sector,
      city: prop.ciudad,
      province: prop.provincia
    }
  };
}

function buildPropertySlugUrl(prop: any, language: string): string {
  const operation = prop.precio_venta ? 'comprar' : 'alquilar';
  const category = utils.slugify(prop.tipo || 'propiedad');
  const city = utils.slugify(prop.ciudad || '');
  const sector = utils.slugify(prop.sector || '');
  const slug = prop.slug;

  let url = `/${operation}`;
  if (category) url += `/${category}`;
  if (city) url += `/${city}`;
  if (sector) url += `/${sector}`;
  url += `/${slug}`;

  return utils.buildUrl(url, language);
}

function formatPropertyType(tipo: string, language: string): string {
  const types: Record<string, Record<string, string>> = {
    casa: { es: 'Casa', en: 'House', fr: 'Maison' },
    apartamento: { es: 'Apartamento', en: 'Apartment', fr: 'Appartement' },
    penthouse: { es: 'Penthouse', en: 'Penthouse', fr: 'Penthouse' },
    villa: { es: 'Villa', en: 'Villa', fr: 'Villa' },
    local: { es: 'Local Comercial', en: 'Commercial Space', fr: 'Local Commercial' },
    oficina: { es: 'Oficina', en: 'Office', fr: 'Bureau' },
    terreno: { es: 'Terreno', en: 'Land', fr: 'Terrain' }
  };

  const tipoLower = (tipo || '').toLowerCase();
  return types[tipoLower]?.[language] || types[tipoLower]?.es || tipo || 'Propiedad';
}

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

function buildHomepageSections(
  tenant: TenantConfig,
  featuredProperties: any[],
  testimonials: any[],
  advisors: any[],
  faqs: any[],
  language: string,
  trackingString: string
): any[] {
  const sections = [];

  // Hero section
  sections.push({
    type: 'hero',
    data: getHeroSection(tenant, language)
  });

  // Property carousel
  if (featuredProperties.length > 0) {
    sections.push({
      type: 'property-carousel',
      data: {
        title: getTranslatedText('Propiedades Destacadas', 'Featured Properties', 'Propriétés en Vedette', language),
        properties: featuredProperties.map(p => toSupabasePropertyFormat(p, language, trackingString))
      }
    });
  }

  // Testimonials
  if (testimonials.length > 0) {
    sections.push({
      type: 'testimonials',
      data: {
        title: getTranslatedText('Lo que dicen nuestros clientes', 'What our clients say', 'Ce que disent nos clients', language),
        testimonials: testimonials.map(t => ({
          id: t.id,
          content: t.content,
          rating: t.rating || 5,
          client_name: t.client_name,
          client_photo: t.client_photo,
          client_location: t.client_location
        }))
      }
    });
  }

  // Advisors
  if (advisors.length > 0) {
    sections.push({
      type: 'advisors',
      data: {
        title: getTranslatedText('Nuestro Equipo', 'Our Team', 'Notre Équipe', language),
        advisors: advisors.map((a: any) => ({
          slug: a.slug,
          name: `${a.nombre} ${a.apellido}`.trim(),
          avatar: a.foto_url || a.avatar_url,
          bio: a.biografia,
          properties_count: parseInt(a.propiedades_count || '0', 10),
          url: utils.buildUrl(`/asesores/${a.slug}`, language, trackingString)
        }))
      }
    });
  }

  // FAQs
  if (faqs.length > 0) {
    sections.push({
      type: 'faq',
      data: {
        title: getTranslatedText('Preguntas Frecuentes', 'Frequently Asked Questions', 'Questions Fréquentes', language),
        faqs: faqs.map(f => ({
          question: f.question,
          answer: f.answer,
          category: f.category
        }))
      }
    });
  }

  return sections;
}

function getHeroSection(tenant: TenantConfig, language: string): any {
  const titles = {
    es: 'Encuentra tu hogar ideal',
    en: 'Find your ideal home',
    fr: 'Trouvez votre maison idéale'
  };

  const subtitles = {
    es: 'Miles de propiedades te esperan',
    en: 'Thousands of properties await you',
    fr: 'Des milliers de propriétés vous attendent'
  };

  return {
    title: titles[language as keyof typeof titles] || titles.es,
    subtitle: subtitles[language as keyof typeof subtitles] || subtitles.es,
    backgroundImage: 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=1920&h=1080&fit=crop&auto=format&q=80',
    showSearch: true
  };
}

function buildSearchTags(popularLocations: { cities: any[]; sectors: any[] }, language: string): any {
  const propertyTypes = [
    { id: 1, slug: 'casa', name: language === 'en' ? 'House' : 'Casa' },
    { id: 2, slug: 'apartamento', name: language === 'en' ? 'Apartment' : 'Apartamento' },
    { id: 3, slug: 'local', name: language === 'en' ? 'Commercial' : 'Local' },
    { id: 4, slug: 'terreno', name: language === 'en' ? 'Land' : 'Terreno' },
    { id: 5, slug: 'oficina', name: language === 'en' ? 'Office' : 'Oficina' },
    { id: 6, slug: 'penthouse', name: 'Penthouse' },
    { id: 7, slug: 'villa', name: 'Villa' }
  ];

  return {
    tags: {
      tipo: propertyTypes,
      ciudad: popularLocations.cities.map((c: any, index: number) => ({
        id: index + 1,
        slug: c.slug,
        name: c.name
      })),
      sector: popularLocations.sectors.map((s: any, index: number) => ({
        id: index + 1,
        slug: s.slug,
        name: s.name
      }))
    },
    locationHierarchy: [],
    currencies: {
      available: ['USD', 'DOP'],
      default: 'USD'
    }
  };
}

function getTranslatedText(es: string, en: string, fr: string, language: string): string {
  switch (language) {
    case 'en': return en;
    case 'fr': return fr;
    default: return es;
  }
}

function generateHomepageSEO(tenant: TenantConfig, language: string): any {
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

  const title = titles[language as keyof typeof titles] || titles.es;
  const description = descriptions[language as keyof typeof descriptions] || descriptions.es;

  return {
    title,
    description,
    h1: title,
    keywords: 'bienes raíces, propiedades, casas, apartamentos, venta, alquiler, inmobiliaria',
    og: {
      title,
      description,
      type: 'website'
    }
  };
}

export default {
  handleHomepage
};
