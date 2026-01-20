// handlers/propertyTypes.ts
// Handler para la página de tipos de propiedades (/propiedades, /property-types, /types-de-proprietes)

import db from '../lib/db';
import utils from '../lib/utils';
import type { TenantConfig } from '../types';

// Iconos, colores e imágenes por tipo de propiedad
const TYPE_CONFIG: Record<string, { icon: string; color: string; image?: string }> = {
  apartamento: {
    icon: '🏢',
    color: '#3B82F6',
    image: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&q=80'
  },
  casa: {
    icon: '🏠',
    color: '#10B981',
    image: 'https://images.unsplash.com/photo-1613977257363-707ba9348227?w=800&q=80'
  },
  villa: {
    icon: '🏰',
    color: '#8B5CF6',
    image: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800&q=80'
  },
  penthouse: {
    icon: '🌆',
    color: '#F59E0B',
    image: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&q=80'
  },
  terreno: {
    icon: '🌳',
    color: '#22C55E',
    image: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&q=80'
  },
  'locales-comerciales': {
    icon: '🏪',
    color: '#EF4444',
    image: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&q=80'
  },
  'local-comercial': {
    icon: '🏪',
    color: '#EF4444',
    image: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&q=80'
  },
  local: {
    icon: '🏪',
    color: '#EF4444',
    image: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&q=80'
  },
  oficina: {
    icon: '🏛️',
    color: '#6366F1',
    image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80'
  },
  townhouse: {
    icon: '🏘️',
    color: '#14B8A6',
    image: 'https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?w=800&q=80'
  },
  loft: {
    icon: '🏙️',
    color: '#EC4899',
    image: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&q=80'
  },
  lofts: {
    icon: '🏙️',
    color: '#EC4899',
    image: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&q=80'
  },
  edificio: {
    icon: '🏗️',
    color: '#F97316',
    image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&q=80'
  },
  edificios: {
    icon: '🏗️',
    color: '#F97316',
    image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&q=80'
  },
  hotel: {
    icon: '🏨',
    color: '#0EA5E9',
    image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80'
  },
  hoteles: {
    icon: '🏨',
    color: '#0EA5E9',
    image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80'
  },
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
    es: 'Apartamentos modernos en las mejores zonas de República Dominicana. Desde estudios hasta unidades de lujo con amenidades premium.',
    en: 'Modern apartments in the best areas of Dominican Republic. From studios to luxury units with premium amenities.',
    fr: 'Appartements modernes dans les meilleures zones de République Dominicaine. Des studios aux unités de luxe.'
  },
  casa: {
    es: 'Casas familiares con espacios amplios, jardines y parqueos. Ideales para quienes buscan privacidad y comodidad.',
    en: 'Family homes with spacious layouts, gardens and parking. Ideal for those seeking privacy and comfort.',
    fr: 'Maisons familiales avec espaces généreux, jardins et parkings. Idéales pour ceux qui recherchent intimité et confort.'
  },
  villa: {
    es: 'Villas de lujo con piscina privada en Punta Cana, Cap Cana y Casa de Campo. Exclusividad y confort en el Caribe.',
    en: 'Luxury villas with private pool in Punta Cana, Cap Cana and Casa de Campo. Exclusivity and comfort in the Caribbean.',
    fr: 'Villas de luxe avec piscine privée à Punta Cana, Cap Cana et Casa de Campo. Exclusivité et confort dans les Caraïbes.'
  },
  penthouse: {
    es: 'Penthouses con vistas panorámicas y terrazas amplias. El máximo nivel de exclusividad en bienes raíces.',
    en: 'Penthouses with panoramic views and spacious terraces. The highest level of real estate exclusivity.',
    fr: 'Penthouses avec vues panoramiques et grandes terrasses. Le plus haut niveau d\'exclusivité immobilière.'
  },
  terreno: {
    es: 'Terrenos y solares para construcción o inversión. Oportunidades en zonas residenciales, turísticas y comerciales.',
    en: 'Land and lots for construction or investment. Opportunities in residential, tourist and commercial areas.',
    fr: 'Terrains et lots pour construction ou investissement. Opportunités dans des zones résidentielles, touristiques et commerciales.'
  },
  'locales-comerciales': {
    es: 'Locales comerciales en ubicaciones estratégicas con alto flujo peatonal. Perfectos para tu negocio.',
    en: 'Commercial spaces in strategic locations with high foot traffic. Perfect for your business.',
    fr: 'Locaux commerciaux dans des emplacements stratégiques avec fort trafic piéton. Parfaits pour votre entreprise.'
  },
  oficina: {
    es: 'Oficinas corporativas y espacios de coworking en torres empresariales de Santo Domingo y Santiago.',
    en: 'Corporate offices and coworking spaces in business towers in Santo Domingo and Santiago.',
    fr: 'Bureaux corporatifs et espaces de coworking dans des tours d\'affaires à Saint-Domingue et Santiago.'
  },
  townhouse: {
    es: 'Townhouses modernos con diseño inteligente. Combinan la privacidad de una casa con la seguridad de un condominio.',
    en: 'Modern townhouses with smart design. Combining the privacy of a house with the security of a condo.',
    fr: 'Maisons de ville modernes au design intelligent. Combinant l\'intimité d\'une maison avec la sécurité d\'un condo.'
  },
  loft: {
    es: 'Lofts con espacios abiertos y techos altos. Diseño contemporáneo para un estilo de vida urbano.',
    en: 'Lofts with open spaces and high ceilings. Contemporary design for an urban lifestyle.',
    fr: 'Lofts avec espaces ouverts et hauts plafonds. Design contemporain pour un style de vie urbain.'
  },
  lofts: {
    es: 'Lofts con espacios abiertos y techos altos. Diseño contemporáneo para un estilo de vida urbano.',
    en: 'Lofts with open spaces and high ceilings. Contemporary design for an urban lifestyle.',
    fr: 'Lofts avec espaces ouverts et hauts plafonds. Design contemporain pour un style de vie urbain.'
  },
  edificio: {
    es: 'Edificios completos para inversión o desarrollo inmobiliario. Oportunidades de alto rendimiento.',
    en: 'Complete buildings for investment or real estate development. High-yield opportunities.',
    fr: 'Bâtiments complets pour investissement ou développement immobilier. Opportunités à haut rendement.'
  },
  edificios: {
    es: 'Edificios completos para inversión o desarrollo inmobiliario. Oportunidades de alto rendimiento.',
    en: 'Complete buildings for investment or real estate development. High-yield opportunities.',
    fr: 'Bâtiments complets pour investissement ou développement immobilier. Opportunités à haut rendement.'
  },
  hotel: {
    es: 'Hoteles y proyectos hoteleros en zonas turísticas. Inversión con alta rentabilidad en el Caribe.',
    en: 'Hotels and hotel projects in tourist areas. High-yield investment in the Caribbean.',
    fr: 'Hôtels et projets hôteliers dans des zones touristiques. Investissement à haut rendement dans les Caraïbes.'
  },
  hoteles: {
    es: 'Hoteles y proyectos hoteleros en zonas turísticas. Inversión con alta rentabilidad en el Caribe.',
    en: 'Hotels and hotel projects in tourist areas. High-yield investment in the Caribbean.',
    fr: 'Hôtels et projets hôteliers dans des zones touristiques. Investissement à haut rendement dans les Caraïbes.'
  },
};

// Texto SEO para la página (contenido enriquecido)
const SEO_CONTENT: Record<string, { intro: string; benefits: string[]; cta: string }> = {
  es: {
    intro: 'En CLIC Inmobiliaria te ayudamos a encontrar la propiedad perfecta en República Dominicana. Contamos con un amplio catálogo de apartamentos, casas, villas, terrenos y locales comerciales en las mejores ubicaciones del país, incluyendo Santo Domingo, Punta Cana, Santiago, La Romana y más.',
    benefits: [
      'Más de 200 propiedades verificadas disponibles',
      'Asesoría personalizada con agentes certificados',
      'Opciones de financiamiento y facilidades de pago',
      'Propiedades en zonas exclusivas y de alta plusvalía',
      'Acompañamiento legal en todo el proceso de compra'
    ],
    cta: '¿Listo para encontrar tu próxima propiedad? Explora nuestras categorías o contáctanos para una asesoría personalizada.'
  },
  en: {
    intro: 'At CLIC Real Estate we help you find the perfect property in the Dominican Republic. We have a wide catalog of apartments, houses, villas, land and commercial spaces in the best locations in the country, including Santo Domingo, Punta Cana, Santiago, La Romana and more.',
    benefits: [
      'Over 200 verified properties available',
      'Personalized advice with certified agents',
      'Financing options and payment facilities',
      'Properties in exclusive and high-value areas',
      'Legal support throughout the buying process'
    ],
    cta: 'Ready to find your next property? Explore our categories or contact us for personalized advice.'
  },
  fr: {
    intro: 'Chez CLIC Immobilier, nous vous aidons à trouver la propriété parfaite en République Dominicaine. Nous disposons d\'un large catalogue d\'appartements, maisons, villas, terrains et locaux commerciaux dans les meilleurs emplacements du pays.',
    benefits: [
      'Plus de 200 propriétés vérifiées disponibles',
      'Conseils personnalisés avec des agents certifiés',
      'Options de financement et facilités de paiement',
      'Propriétés dans des zones exclusives à forte plus-value',
      'Accompagnement juridique tout au long du processus d\'achat'
    ],
    cta: 'Prêt à trouver votre prochaine propriété? Explorez nos catégories ou contactez-nous pour des conseils personnalisés.'
  }
};

// Títulos SEO descriptivos para los carruseles
function generateCarouselTitle(typeName: string, slug: string, language: string): { title: string; subtitle: string } {
  const titles: Record<string, Record<string, { title: string; subtitle: string }>> = {
    apartamento: {
      es: {
        title: `Descubre ${typeName} que destacan en República Dominicana`,
        subtitle: 'Espacios modernos en las mejores ubicaciones urbanas del país'
      },
      en: {
        title: `Discover Outstanding ${typeName} in Dominican Republic`,
        subtitle: 'Modern spaces in the best urban locations in the country'
      },
      fr: {
        title: `Découvrez des ${typeName} exceptionnels en République Dominicaine`,
        subtitle: 'Espaces modernes dans les meilleures emplacements urbains du pays'
      }
    },
    casa: {
      es: {
        title: `Explora ${typeName} que sobresalen por sus características`,
        subtitle: 'Hogares familiares con espacios amplios, jardines y comodidades'
      },
      en: {
        title: `Explore ${typeName} that stand out for their features`,
        subtitle: 'Family homes with spacious layouts, gardens and amenities'
      },
      fr: {
        title: `Explorez des ${typeName} qui se distinguent par leurs caractéristiques`,
        subtitle: 'Maisons familiales avec espaces généreux, jardins et commodités'
      }
    },
    villa: {
      es: {
        title: `${typeName} de lujo en destinos exclusivos del Caribe`,
        subtitle: 'Exclusividad y confort en Punta Cana, Cap Cana y Casa de Campo'
      },
      en: {
        title: `Luxury ${typeName} in exclusive Caribbean destinations`,
        subtitle: 'Exclusivity and comfort in Punta Cana, Cap Cana and Casa de Campo'
      },
      fr: {
        title: `${typeName} de luxe dans des destinations caribéennes exclusives`,
        subtitle: 'Exclusivité et confort à Punta Cana, Cap Cana et Casa de Campo'
      }
    },
    terreno: {
      es: {
        title: `${typeName} ideales para desarrollo de proyectos`,
        subtitle: 'Solares deslindados con potencial para construcción e inversión'
      },
      en: {
        title: `${typeName} ideal for project development`,
        subtitle: 'Surveyed lots with potential for construction and investment'
      },
      fr: {
        title: `${typeName} idéaux pour le développement de projets`,
        subtitle: 'Terrains délimités avec potentiel de construction et d\'investissement'
      }
    },
    penthouse: {
      es: {
        title: `${typeName} con vistas panorámicas impresionantes`,
        subtitle: 'El máximo nivel de exclusividad en bienes raíces dominicanos'
      },
      en: {
        title: `${typeName} with impressive panoramic views`,
        subtitle: 'The highest level of exclusivity in Dominican real estate'
      },
      fr: {
        title: `${typeName} avec des vues panoramiques impressionnantes`,
        subtitle: 'Le plus haut niveau d\'exclusivité dans l\'immobilier dominicain'
      }
    },
    'locales-comerciales': {
      es: {
        title: `${typeName} en ubicaciones estratégicas`,
        subtitle: 'Espacios comerciales con alto flujo peatonal para tu negocio'
      },
      en: {
        title: `${typeName} in strategic locations`,
        subtitle: 'Commercial spaces with high foot traffic for your business'
      },
      fr: {
        title: `${typeName} dans des emplacements stratégiques`,
        subtitle: 'Espaces commerciaux à fort trafic piétonnier pour votre entreprise'
      }
    },
    local: {
      es: {
        title: `${typeName} en ubicaciones estratégicas`,
        subtitle: 'Espacios comerciales con alto flujo peatonal para tu negocio'
      },
      en: {
        title: `${typeName} in strategic locations`,
        subtitle: 'Commercial spaces with high foot traffic for your business'
      },
      fr: {
        title: `${typeName} dans des emplacements stratégiques`,
        subtitle: 'Espaces commerciaux à fort trafic piétonnier pour votre entreprise'
      }
    },
    oficina: {
      es: {
        title: `${typeName} en torres empresariales de primer nivel`,
        subtitle: 'Espacios corporativos en Santo Domingo y Santiago'
      },
      en: {
        title: `${typeName} in first-class business towers`,
        subtitle: 'Corporate spaces in Santo Domingo and Santiago'
      },
      fr: {
        title: `${typeName} dans des tours d\'affaires de premier plan`,
        subtitle: 'Espaces corporatifs à Saint-Domingue et Santiago'
      }
    },
    townhouse: {
      es: {
        title: `${typeName} modernos con diseño inteligente`,
        subtitle: 'Privacidad de casa con la seguridad de un condominio'
      },
      en: {
        title: `Modern ${typeName} with smart design`,
        subtitle: 'Privacy of a house with the security of a condo'
      },
      fr: {
        title: `${typeName} modernes au design intelligent`,
        subtitle: 'Intimité d\'une maison avec la sécurité d\'un condo'
      }
    }
  };

  // Normalizar el slug para buscar en el objeto
  const normalizedSlug = slug.toLowerCase().replace(/-/g, '');
  const matchingKey = Object.keys(titles).find(key =>
    key.replace(/-/g, '') === normalizedSlug ||
    slug.toLowerCase().includes(key)
  ) || slug;

  const langTitles = titles[matchingKey]?.[language] || titles[matchingKey]?.es;

  if (langTitles) {
    return langTitles;
  }

  // Fallback genérico
  return {
    title: language === 'es'
      ? `Selección destacada de ${typeName}`
      : language === 'en'
      ? `Featured selection of ${typeName}`
      : `Sélection en vedette de ${typeName}`,
    subtitle: language === 'es'
      ? 'Propiedades seleccionadas por su calidad y ubicación'
      : language === 'en'
      ? 'Properties selected for their quality and location'
      : 'Propriétés sélectionnées pour leur qualité et leur emplacement'
  };
}

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
      hasEnrichedData: !!config.image,
      hero_image: config.image || null,
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

    // Formatear propiedades para el carousel (nombres en español como espera PropertyCarousel)
    const formattedProperties = properties.map((p: any) => {
      const operationType = p.operacion || 'venta';
      const price = operationType === 'venta'
        ? (p.precio_venta || p.precio || 0)
        : (p.precio_alquiler || p.precio || 0);

      // Parsear imágenes si es un string JSON
      let imagenes: string[] = [];
      if (p.imagenes) {
        try {
          imagenes = typeof p.imagenes === 'string' ? JSON.parse(p.imagenes) : p.imagenes;
        } catch {
          imagenes = [];
        }
      }
      if (p.imagen_principal && !imagenes.includes(p.imagen_principal)) {
        imagenes.unshift(p.imagen_principal);
      }

      return {
        id: p.id,
        slug: p.slug,
        url: `/${p.slug}`,
        // Nombres en español para PropertyCarousel
        titulo: p.titulo || '',
        precio: utils.formatPrice(price, p.moneda || 'USD', operationType, language),
        imagen: p.imagen_principal || '',
        imagenes: imagenes.length > 0 ? imagenes : (p.imagen_principal ? [p.imagen_principal] : []),
        sector: [p.sector, p.ciudad].filter(Boolean).join(', '),
        habitaciones: p.habitaciones || 0,
        banos: p.banos || 0,
        metros: p.m2_construccion || p.m2_terreno || 0,
        metros_terreno: p.m2_terreno || 0,
        parqueos: p.estacionamientos || 0,
        tipo: p.tipo || '',
        code: p.codigo_publico || '',
        destacado: p.destacada || false,
        is_project: p.is_project || false,
      };
    });

    return { type: typeData.type, slug: typeData.slug, properties: formattedProperties };
  });

  const featuredResults = await Promise.all(featuredPromises);
  featuredResults.forEach(({ type, slug, properties }) => {
    if (properties.length > 0) {
      // Generar título y subtítulo SEO descriptivo para cada tipo
      const carouselTitle = generateCarouselTitle(type, slug, language);
      featuredByType[type] = {
        properties,
        title: carouselTitle.title,
        subtitle: carouselTitle.subtitle,
        slug,
      };
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
    seoContent: SEO_CONTENT[language] || SEO_CONTENT.es,
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
