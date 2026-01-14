// api/handlers/homepage.ts
// Handler para la página de inicio
// Adaptado al schema real de Neon

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

  // Construir secciones
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
        properties: featuredProperties.map(p => toPropertyCard(p, language, trackingString))
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
          client_location: t.client_location,
          property_type: t.property_type
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
          avatar: a.avatar,
          bio: a.bio,
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

  // Construir hotItems
  const hotItems: HotItems = {
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
    properties: featuredProperties.slice(0, 6).map(p => toPropertyCard(p, language, trackingString)),
    agents: advisors.slice(0, 4).map((a: any) => ({
      slug: a.slug,
      name: `${a.nombre} ${a.apellido}`.trim(),
      photo_url: a.avatar,
      url: utils.buildUrl(`/asesores/${a.slug}`, language, trackingString)
    })),
    projects: [] // No hay tabla de proyectos en el schema actual
  };

  // Construir searchTags
  const searchTags = buildSearchTags(popularLocations, language);

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

function getHeroSection(tenant: TenantConfig, language: string) {
  const config = tenant.config || {};
  const heroConfig = config.homepage?.hero || {};

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

function toPropertyCard(prop: any, language: string, trackingString: string): PropertyCard {
  const price = prop.precio_venta || prop.precio_alquiler || prop.precio || 0;
  const currency = prop.moneda || 'USD';
  const operationType = prop.operacion || (prop.precio_venta ? 'venta' : 'alquiler');

  return {
    id: prop.id,
    slug: prop.slug,
    code: prop.codigo,
    title: prop.titulo,
    location: {
      city: prop.ciudad,
      sector: prop.sector,
      address: prop.direccion
    },
    price: {
      amount: price,
      currency: currency,
      display: utils.formatPrice(price, currency, operationType, language)
    },
    operation_type: operationType,
    features: {
      bedrooms: prop.habitaciones || 0,
      bathrooms: prop.banos || 0,
      half_bathrooms: prop.medios_banos || 0,
      parking_spaces: prop.estacionamientos || 0,
      area_construction: prop.m2_construccion || 0,
      area_total: prop.m2_terreno || 0
    },
    main_image: prop.imagen_principal || '',
    is_featured: prop.destacada || false,
    is_new: prop.created_at ? new Date(prop.created_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) : false,
    url: utils.buildPropertyUrl(prop, language, trackingString),
    amenity_badges: []
  };
}

function buildSearchTags(popularLocations: { cities: any[]; sectors: any[] }, language: string) {
  // Tipos de propiedad estáticos
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
    locationHierarchy: [], // Simplificado - no hay jerarquía en el schema actual
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
