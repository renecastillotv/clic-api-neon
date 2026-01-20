// handlers/propertyTypes.ts
// Handler para la página de tipos de propiedades (/propiedades, /property-types, /types-de-proprietes)

import db from '../lib/db';
import utils from '../lib/utils';
import type { TenantConfig } from '../types';

// Iconos y colores por tipo de propiedad
const TYPE_CONFIG: Record<string, { icon: string; color: string }> = {
  apartamento: { icon: '🏢', color: '#3B82F6' },
  casa: { icon: '🏠', color: '#10B981' },
  villa: { icon: '🏰', color: '#8B5CF6' },
  penthouse: { icon: '🌆', color: '#F59E0B' },
  terreno: { icon: '🌳', color: '#22C55E' },
  'locales-comerciales': { icon: '🏪', color: '#EF4444' },
  'local-comercial': { icon: '🏪', color: '#EF4444' },
  local: { icon: '🏪', color: '#EF4444' },
  oficina: { icon: '🏛️', color: '#6366F1' },
  townhouse: { icon: '🏘️', color: '#14B8A6' },
  loft: { icon: '🏙️', color: '#EC4899' },
  lofts: { icon: '🏙️', color: '#EC4899' },
  edificio: { icon: '🏗️', color: '#F97316' },
  edificios: { icon: '🏗️', color: '#F97316' },
  hotel: { icon: '🏨', color: '#0EA5E9' },
  hoteles: { icon: '🏨', color: '#0EA5E9' },
};

// Traducciones de tipos de propiedad
const TYPE_TRANSLATIONS: Record<string, Record<string, string>> = {
  apartamento: { es: 'Apartamentos', en: 'Apartments', fr: 'Appartements' },
  casa: { es: 'Casas', en: 'Houses', fr: 'Maisons' },
  villa: { es: 'Villas', en: 'Villas', fr: 'Villas' },
  penthouse: { es: 'Penthouses', en: 'Penthouses', fr: 'Penthouses' },
  terreno: { es: 'Terrenos', en: 'Land', fr: 'Terrains' },
  'locales-comerciales': { es: 'Locales Comerciales', en: 'Commercial Spaces', fr: 'Locaux Commerciaux' },
  'local-comercial': { es: 'Locales Comerciales', en: 'Commercial Spaces', fr: 'Locaux Commerciaux' },
  local: { es: 'Locales', en: 'Locals', fr: 'Locaux' },
  oficina: { es: 'Oficinas', en: 'Offices', fr: 'Bureaux' },
  townhouse: { es: 'Townhouses', en: 'Townhouses', fr: 'Maisons de Ville' },
  loft: { es: 'Lofts', en: 'Lofts', fr: 'Lofts' },
  lofts: { es: 'Lofts', en: 'Lofts', fr: 'Lofts' },
  edificio: { es: 'Edificios', en: 'Buildings', fr: 'Bâtiments' },
  edificios: { es: 'Edificios', en: 'Buildings', fr: 'Bâtiments' },
  hotel: { es: 'Hoteles', en: 'Hotels', fr: 'Hôtels' },
  hoteles: { es: 'Hoteles', en: 'Hotels', fr: 'Hôtels' },
};

// Descripciones SEO por tipo
const TYPE_DESCRIPTIONS: Record<string, Record<string, string>> = {
  apartamento: {
    es: 'Modernos espacios urbanos con todas las comodidades',
    en: 'Modern urban spaces with all amenities',
    fr: 'Espaces urbains modernes avec toutes les commodités'
  },
  casa: {
    es: 'Espacios familiares amplios y confortables',
    en: 'Spacious and comfortable family homes',
    fr: 'Maisons familiales spacieuses et confortables'
  },
  villa: {
    es: 'Lujo y exclusividad en ubicaciones privilegiadas',
    en: 'Luxury and exclusivity in prime locations',
    fr: 'Luxe et exclusivité dans des emplacements privilégiés'
  },
  penthouse: {
    es: 'Vistas panorámicas únicas y acabados premium',
    en: 'Unique panoramic views and premium finishes',
    fr: 'Vues panoramiques uniques et finitions premium'
  },
  terreno: {
    es: 'Oportunidades de inversión y desarrollo',
    en: 'Investment and development opportunities',
    fr: 'Opportunités d\'investissement et de développement'
  },
  'locales-comerciales': {
    es: 'Espacios ideales para tu negocio',
    en: 'Ideal spaces for your business',
    fr: 'Espaces idéaux pour votre entreprise'
  },
};

interface PropertyTypesHandlerParams {
  tenant: TenantConfig;
  language: string;
  pathname: string;
  trackingString: string;
}

export async function handlePropertyTypes({
  tenant,
  language,
  pathname,
  trackingString
}: PropertyTypesHandlerParams) {
  const tenantId = tenant.id;

  // Obtener estadísticas de tipos desde stats_cache
  const typeStats = await db.getPropertyTypeStats(tenantId);

  if (!typeStats || typeStats.length === 0) {
    // Fallback si no hay datos
    return {
      type: 'property-types-main',
      language,
      tenant,
      propertyTypes: [],
      enrichedTypes: [],
      remainingTypes: [],
      featuredByType: {},
      seo: utils.generateSEO({
        title: language === 'es' ? 'Tipos de Propiedades' :
               language === 'en' ? 'Property Types' : 'Types de Propriétés',
        description: language === 'es' ? 'Explora propiedades por tipo' :
                     language === 'en' ? 'Explore properties by type' :
                     'Explorez les propriétés par type',
        language,
        canonicalUrl: pathname,
      }),
      trackingString,
    };
  }

  // Enriquecer los tipos con traducciones, iconos y colores
  const enrichedTypes = typeStats.map((stat: any) => {
    const slug = stat.slug;
    const config = TYPE_CONFIG[slug] || { icon: '🏠', color: '#6B7280' };
    const translation = TYPE_TRANSLATIONS[slug]?.[language] || stat.type;
    const description = TYPE_DESCRIPTIONS[slug]?.[language] || '';

    return {
      type: translation,
      slug: slug,
      count: stat.count,
      count_venta: stat.count_venta,
      count_alquiler: stat.count_alquiler,
      icon: config.icon,
      color: config.color,
      description: description,
      seo_description: description,
      hasEnrichedData: false, // No tenemos imágenes por ahora
      hero_image: null,
    };
  });

  // Separar en destacados (top 3) y resto
  const featuredTypes = enrichedTypes.slice(0, 3);
  const remainingTypes = enrichedTypes.slice(3);

  // Obtener propiedades destacadas para los top 3 tipos
  const featuredByType: Record<string, any[]> = {};

  // Obtener propiedades en paralelo para los tipos destacados
  const featuredPromises = featuredTypes.map(async (typeData: any) => {
    const properties = await db.getFeaturedPropertiesByType(tenantId, typeData.slug, 6);

    // Formatear propiedades para el carousel
    const formattedProperties = properties.map((p: any) => {
      const operationType = p.operacion || 'venta';
      const price = operationType === 'venta'
        ? (p.precio_venta || p.precio || 0)
        : (p.precio_alquiler || p.precio || 0);

      return {
        id: p.id,
        title: p.titulo,
        slug: p.slug,
        type: p.tipo,
        operation: operationType,
        price: price,
        currency: p.moneda || 'USD',
        bedrooms: p.habitaciones,
        bathrooms: p.banos,
        parking: p.estacionamientos,
        area: p.m2_construccion || p.m2_terreno,
        mainImage: p.imagen_principal,
        location: [p.sector, p.ciudad].filter(Boolean).join(', '),
        sector: p.sector,
        city: p.ciudad,
        province: p.provincia,
        featured: p.destacada,
        isProject: p.is_project,
        // Display strings
        title_display: p.titulo,
        price_display: utils.formatPrice(price, p.moneda || 'USD', language),
        location_display: [p.sector, p.ciudad].filter(Boolean).join(', '),
      };
    });

    return { type: typeData.type, properties: formattedProperties };
  });

  const featuredResults = await Promise.all(featuredPromises);
  featuredResults.forEach(({ type, properties }) => {
    if (properties.length > 0) {
      featuredByType[type] = properties;
    }
  });

  // Generar SEO
  const totalProperties = enrichedTypes.reduce((sum: number, t: any) => sum + t.count, 0);
  const topTypes = enrichedTypes.slice(0, 3).map((t: any) => t.type).join(', ');

  const seoTitle = language === 'es'
    ? `Tipos de Propiedades | ${totalProperties} Inmuebles Disponibles`
    : language === 'en'
    ? `Property Types | ${totalProperties} Properties Available`
    : `Types de Propriétés | ${totalProperties} Biens Disponibles`;

  const seoDescription = language === 'es'
    ? `Explora ${totalProperties} propiedades por tipo: ${topTypes} y más. Encuentra el inmueble perfecto para ti.`
    : language === 'en'
    ? `Explore ${totalProperties} properties by type: ${topTypes} and more. Find the perfect property for you.`
    : `Explorez ${totalProperties} propriétés par type : ${topTypes} et plus. Trouvez la propriété parfaite pour vous.`;

  // Structured data para SEO
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: seoTitle,
    description: seoDescription,
    numberOfItems: enrichedTypes.length,
    itemListElement: enrichedTypes.map((type: any, index: number) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: type.type,
      url: `${pathname.replace(/\/propiedades.*/, '')}/${type.slug}`,
      description: `${type.count} ${language === 'es' ? 'propiedades disponibles' : 'properties available'}`,
    })),
  };

  // Breadcrumbs
  const breadcrumbs = [
    {
      name: language === 'es' ? 'Inicio' : language === 'en' ? 'Home' : 'Accueil',
      url: '/',
    },
    {
      name: language === 'es' ? 'Tipos de Propiedades' :
            language === 'en' ? 'Property Types' : 'Types de Propriétés',
      url: pathname,
    },
  ];

  return {
    type: 'property-types-main',
    pageType: 'property-types-main',
    language,
    tenant,
    propertyTypes: enrichedTypes,
    enrichedTypes: featuredTypes,
    remainingTypes: remainingTypes,
    featuredByType,
    totalProperties,
    seo: {
      title: seoTitle,
      description: seoDescription,
      h1: language === 'es' ? 'Tipos de Propiedades' :
          language === 'en' ? 'Property Types' : 'Types de Propriétés',
      h2: language === 'es' ? 'Encuentra el inmueble perfecto para ti' :
          language === 'en' ? 'Find the perfect property for you' :
          'Trouvez la propriété parfaite pour vous',
      canonical_url: pathname,
      keywords: `${topTypes}, ${language === 'es' ? 'bienes raíces, propiedades, inmuebles' : 'real estate, properties'}`,
      breadcrumbs,
      structured_data: structuredData,
      open_graph: {
        title: seoTitle,
        description: seoDescription,
        type: 'website',
        url: pathname,
      },
      twitter_card: {
        card: 'summary_large_image',
        title: seoTitle,
        description: seoDescription,
      },
    },
    trackingString,
  };
}

export default {
  handlePropertyTypes,
};
