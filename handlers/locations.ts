// handlers/locations.ts
// Handler para la página de ubicaciones (/ubicaciones, /locations, /emplacements)

import db from '../lib/db';
import utils from '../lib/utils';
import type { TenantConfig } from '../types';

// Configuración de ciudades principales con imágenes y colores
const CITY_CONFIG: Record<string, { icon: string; color: string; image?: string }> = {
  'santo-domingo': {
    icon: '🏙️',
    color: '#3B82F6',
    image: 'https://images.unsplash.com/photo-1569025690938-a00729c9e1f9?w=800&q=80'
  },
  'distrito-nacional': {
    icon: '🏛️',
    color: '#3B82F6',
    image: 'https://images.unsplash.com/photo-1569025690938-a00729c9e1f9?w=800&q=80'
  },
  santiago: {
    icon: '🌄',
    color: '#10B981',
    image: 'https://images.unsplash.com/photo-1596436889106-be35e843f974?w=800&q=80'
  },
  'punta-cana': {
    icon: '🏖️',
    color: '#F59E0B',
    image: 'https://images.unsplash.com/photo-1582610116397-edb318620f90?w=800&q=80'
  },
  bavaro: {
    icon: '🌴',
    color: '#F59E0B',
    image: 'https://images.unsplash.com/photo-1582610116397-edb318620f90?w=800&q=80'
  },
  'la-romana': {
    icon: '⛳',
    color: '#8B5CF6',
    image: 'https://images.unsplash.com/photo-1535139262971-c51845709a48?w=800&q=80'
  },
  'cap-cana': {
    icon: '🏰',
    color: '#EC4899',
    image: 'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=800&q=80'
  },
  'puerto-plata': {
    icon: '🚢',
    color: '#06B6D4',
    image: 'https://images.unsplash.com/photo-1590523741831-ab7e8b8f9c7f?w=800&q=80'
  },
  samana: {
    icon: '🐋',
    color: '#14B8A6',
    image: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&q=80'
  },
  'las-terrenas': {
    icon: '🏄',
    color: '#14B8A6',
    image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80'
  },
  sosua: {
    icon: '🤿',
    color: '#06B6D4',
    image: 'https://images.unsplash.com/photo-1544551763-77ef2d0cfc6c?w=800&q=80'
  },
  cabarete: {
    icon: '🪁',
    color: '#22C55E',
    image: 'https://images.unsplash.com/photo-1530053969600-caed2596d242?w=800&q=80'
  },
  jarabacoa: {
    icon: '🏔️',
    color: '#22C55E',
    image: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&q=80'
  },
  constanza: {
    icon: '🌲',
    color: '#16A34A',
    image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80'
  }
};

// Descripciones SEO por ciudad
const CITY_DESCRIPTIONS: Record<string, Record<string, string>> = {
  'santo-domingo': {
    es: 'Capital de República Dominicana con una mezcla única de historia colonial y modernidad. Apartamentos de lujo, casas familiares y oportunidades de inversión.',
    en: 'Capital of Dominican Republic with a unique mix of colonial history and modernity. Luxury apartments, family homes and investment opportunities.',
    fr: 'Capitale de la République Dominicaine avec un mélange unique d\'histoire coloniale et de modernité. Appartements de luxe, maisons familiales et opportunités d\'investissement.'
  },
  'distrito-nacional': {
    es: 'El corazón financiero y cultural de Santo Domingo. Zonas exclusivas como Piantini, Naco y Bella Vista con propiedades premium.',
    en: 'The financial and cultural heart of Santo Domingo. Exclusive areas like Piantini, Naco and Bella Vista with premium properties.',
    fr: 'Le cœur financier et culturel de Saint-Domingue. Zones exclusives comme Piantini, Naco et Bella Vista avec des propriétés premium.'
  },
  santiago: {
    es: 'Segunda ciudad más grande del país, centro económico del Cibao. Ideal para inversiones comerciales y residenciales.',
    en: 'Second largest city in the country, economic center of Cibao. Ideal for commercial and residential investments.',
    fr: 'Deuxième plus grande ville du pays, centre économique du Cibao. Idéal pour les investissements commerciaux et résidentiels.'
  },
  'punta-cana': {
    es: 'Destino turístico de clase mundial con playas de arena blanca. Villas de lujo, condominios frente al mar y alta rentabilidad por alquiler.',
    en: 'World-class tourist destination with white sand beaches. Luxury villas, oceanfront condos and high rental yield.',
    fr: 'Destination touristique de classe mondiale avec des plages de sable blanc. Villas de luxe, condos en bord de mer et rendement locatif élevé.'
  },
  bavaro: {
    es: 'Zona más desarrollada de Punta Cana con infraestructura completa. Resorts, apartamentos y terrenos para desarrollo.',
    en: 'Most developed area of Punta Cana with complete infrastructure. Resorts, apartments and land for development.',
    fr: 'Zone la plus développée de Punta Cana avec infrastructure complète. Resorts, appartements et terrains à développer.'
  },
  'la-romana': {
    es: 'Casa de Campo y playas paradisíacas. Propiedades de lujo en uno de los destinos más exclusivos del Caribe.',
    en: 'Casa de Campo and pristine beaches. Luxury properties in one of the most exclusive Caribbean destinations.',
    fr: 'Casa de Campo et plages paradisiaques. Propriétés de luxe dans l\'une des destinations les plus exclusives des Caraïbes.'
  },
  'cap-cana': {
    es: 'El desarrollo de lujo más exclusivo del Caribe. Marina, campos de golf y residencias de alto nivel.',
    en: 'The most exclusive luxury development in the Caribbean. Marina, golf courses and high-end residences.',
    fr: 'Le développement de luxe le plus exclusif des Caraïbes. Marina, terrains de golf et résidences haut de gamme.'
  },
  'puerto-plata': {
    es: 'Costa norte con historia y cultura. Precios accesibles y gran potencial de valorización.',
    en: 'North coast with history and culture. Affordable prices and great appreciation potential.',
    fr: 'Côte nord avec histoire et culture. Prix abordables et grand potentiel de valorisation.'
  },
  samana: {
    es: 'Península de belleza natural única. Ideal para eco-turismo y propiedades boutique.',
    en: 'Peninsula of unique natural beauty. Ideal for eco-tourism and boutique properties.',
    fr: 'Péninsule d\'une beauté naturelle unique. Idéal pour l\'écotourisme et les propriétés boutique.'
  },
  'las-terrenas': {
    es: 'Pueblo cosmopolita con influencia europea. Propiedades con encanto y estilo de vida relajado.',
    en: 'Cosmopolitan town with European influence. Charming properties and relaxed lifestyle.',
    fr: 'Ville cosmopolite avec influence européenne. Propriétés de charme et style de vie détendu.'
  },
  sosua: {
    es: 'Comunidad diversa con excelente vida nocturna. Apartamentos asequibles y alta demanda de alquiler.',
    en: 'Diverse community with excellent nightlife. Affordable apartments and high rental demand.',
    fr: 'Communauté diversifiée avec excellente vie nocturne. Appartements abordables et forte demande locative.'
  },
  cabarete: {
    es: 'Capital mundial del kitesurf. Propiedades frente a la playa para amantes de deportes acuáticos.',
    en: 'World capital of kitesurfing. Beachfront properties for water sports enthusiasts.',
    fr: 'Capitale mondiale du kitesurf. Propriétés en bord de mer pour les amateurs de sports nautiques.'
  },
  jarabacoa: {
    es: 'Clima de montaña y naturaleza exuberante. Fincas, villas y propiedades de descanso.',
    en: 'Mountain climate and lush nature. Farms, villas and vacation properties.',
    fr: 'Climat de montagne et nature luxuriante. Fermes, villas et propriétés de vacances.'
  },
  constanza: {
    es: 'El valle más alto del Caribe con clima fresco todo el año. Ideal para agricultura y retiro.',
    en: 'The highest valley in the Caribbean with cool weather year-round. Ideal for agriculture and retirement.',
    fr: 'La plus haute vallée des Caraïbes avec un climat frais toute l\'année. Idéal pour l\'agriculture et la retraite.'
  }
};

// Texto SEO para la página de ubicaciones
const SEO_CONTENT: Record<string, { intro: string; benefits: string[]; cta: string }> = {
  es: {
    intro: 'Descubre las mejores ubicaciones para invertir en bienes raíces en República Dominicana. Desde la vibrante capital Santo Domingo hasta las paradisíacas playas de Punta Cana, te ayudamos a encontrar la propiedad perfecta en la zona que mejor se adapte a tu estilo de vida.',
    benefits: [
      'Presencia en las principales ciudades y destinos turísticos',
      'Propiedades en zonas de alta plusvalía y rentabilidad',
      'Conocimiento local de cada mercado inmobiliario',
      'Asesoría sobre regulaciones y zonificación por área',
      'Información actualizada sobre desarrollo urbano y proyectos'
    ],
    cta: '¿Buscas una ubicación específica? Nuestros asesores conocen cada zona y pueden ayudarte a encontrar la propiedad ideal.'
  },
  en: {
    intro: 'Discover the best locations to invest in real estate in the Dominican Republic. From the vibrant capital Santo Domingo to the pristine beaches of Punta Cana, we help you find the perfect property in the area that best suits your lifestyle.',
    benefits: [
      'Presence in major cities and tourist destinations',
      'Properties in high-value and high-yield areas',
      'Local knowledge of each real estate market',
      'Advice on regulations and zoning by area',
      'Updated information on urban development and projects'
    ],
    cta: 'Looking for a specific location? Our advisors know each area and can help you find the ideal property.'
  },
  fr: {
    intro: 'Découvrez les meilleurs emplacements pour investir dans l\'immobilier en République Dominicaine. De la vibrante capitale Saint-Domingue aux plages paradisiaques de Punta Cana, nous vous aidons à trouver la propriété parfaite dans la zone qui correspond le mieux à votre style de vie.',
    benefits: [
      'Présence dans les principales villes et destinations touristiques',
      'Propriétés dans des zones à forte plus-value et rentabilité',
      'Connaissance locale de chaque marché immobilier',
      'Conseils sur les réglementations et le zonage par zone',
      'Informations actualisées sur le développement urbain et les projets'
    ],
    cta: 'Vous cherchez un emplacement spécifique? Nos conseillers connaissent chaque zone et peuvent vous aider à trouver la propriété idéale.'
  }
};

// Títulos SEO descriptivos para los carruseles de ubicaciones
function generateLocationCarouselTitle(locationName: string, slug: string, language: string): { title: string; subtitle: string } {
  const titles: Record<string, Record<string, { title: string; subtitle: string }>> = {
    'santo-domingo': {
      es: {
        title: `Propiedades destacadas en ${locationName}`,
        subtitle: 'La capital dominicana ofrece las mejores oportunidades de inversión urbana'
      },
      en: {
        title: `Featured properties in ${locationName}`,
        subtitle: 'The Dominican capital offers the best urban investment opportunities'
      },
      fr: {
        title: `Propriétés en vedette à ${locationName}`,
        subtitle: 'La capitale dominicaine offre les meilleures opportunités d\'investissement urbain'
      }
    },
    'punta-cana': {
      es: {
        title: `Descubre propiedades en ${locationName}`,
        subtitle: 'Villas y apartamentos frente al mar con alta rentabilidad turística'
      },
      en: {
        title: `Discover properties in ${locationName}`,
        subtitle: 'Oceanfront villas and apartments with high tourist rental yield'
      },
      fr: {
        title: `Découvrez des propriétés à ${locationName}`,
        subtitle: 'Villas et appartements en bord de mer avec rendement locatif touristique élevé'
      }
    },
    santiago: {
      es: {
        title: `Oportunidades inmobiliarias en ${locationName}`,
        subtitle: 'El centro económico del Cibao con propiedades para todos los presupuestos'
      },
      en: {
        title: `Real estate opportunities in ${locationName}`,
        subtitle: 'The economic center of Cibao with properties for all budgets'
      },
      fr: {
        title: `Opportunités immobilières à ${locationName}`,
        subtitle: 'Le centre économique du Cibao avec des propriétés pour tous les budgets'
      }
    },
    'la-romana': {
      es: {
        title: `Propiedades exclusivas en ${locationName}`,
        subtitle: 'Casa de Campo y las mejores residencias del sureste dominicano'
      },
      en: {
        title: `Exclusive properties in ${locationName}`,
        subtitle: 'Casa de Campo and the best residences in southeastern Dominican Republic'
      },
      fr: {
        title: `Propriétés exclusives à ${locationName}`,
        subtitle: 'Casa de Campo et les meilleures résidences du sud-est dominicain'
      }
    },
    'cap-cana': {
      es: {
        title: `Lujo sin igual en ${locationName}`,
        subtitle: 'El desarrollo más exclusivo del Caribe con marina y campos de golf'
      },
      en: {
        title: `Unparalleled luxury in ${locationName}`,
        subtitle: 'The most exclusive Caribbean development with marina and golf courses'
      },
      fr: {
        title: `Luxe sans pareil à ${locationName}`,
        subtitle: 'Le développement caribéen le plus exclusif avec marina et terrains de golf'
      }
    }
  };

  const langTitles = titles[slug]?.[language] || titles[slug]?.es;

  if (langTitles) {
    return langTitles;
  }

  // Fallback genérico
  return {
    title: language === 'es'
      ? `Propiedades disponibles en ${locationName}`
      : language === 'en'
      ? `Available properties in ${locationName}`
      : `Propriétés disponibles à ${locationName}`,
    subtitle: language === 'es'
      ? 'Encuentra tu próxima inversión en esta ubicación privilegiada'
      : language === 'en'
      ? 'Find your next investment in this prime location'
      : 'Trouvez votre prochain investissement dans cet emplacement privilégié'
  };
}

interface LocationsHandlerParams {
  tenant: TenantConfig;
  language: string;
  pathname: string;
  trackingString: string;
}

export async function handleLocations({
  tenant,
  language,
  pathname,
  trackingString
}: LocationsHandlerParams) {
  try {
    const tenantId = tenant.id;

    // Usar getPopularLocations que sabemos que funciona
    console.log('[Locations] Llamando getPopularLocations con tenantId:', tenantId);
    const popularLocations = await db.getPopularLocations(tenantId);
    console.log('[Locations] Resultado getPopularLocations:', JSON.stringify(popularLocations).substring(0, 500));

    // Adaptar formato al esperado por el handler
    const ciudades = (popularLocations.cities || []).map((c: any) => ({
      name: c.name,
      slug: c.slug,
      count: parseInt(c.count, 10) || 0,
      count_venta: 0, // No disponible en getPopularLocations
      count_alquiler: 0,
      parent_slug: null
    }));

    const sectores = (popularLocations.sectors || []).map((s: any) => ({
      name: s.name,
      slug: s.slug,
      count: parseInt(s.count, 10) || 0,
      count_venta: 0,
      count_alquiler: 0,
      parent_slug: s.city ? s.city.toLowerCase().replace(/ /g, '-') : null
    }));

    const provincias: any[] = []; // Por ahora vacío

  if ((!ciudades || ciudades.length === 0) && (!sectores || sectores.length === 0)) {
    console.log('[Locations] No hay datos de ubicaciones, retornando fallback');
    // Fallback si no hay datos
    return {
      type: 'locations-main',
      language,
      tenant,
      locations: {
        provinces: [],
        cities: [],
        sectors: [],
        enrichedCities: []
      },
      stats: {
        totalCities: 0,
        totalSectors: 0,
        totalProperties: 0
      },
      featuredByLocation: {},
      seoContent: SEO_CONTENT[language] || SEO_CONTENT.es,
      seo: utils.generateSEO({
        title: language === 'es' ? 'Ubicaciones' :
               language === 'en' ? 'Locations' : 'Emplacements',
        description: language === 'es' ? 'Explora propiedades por ubicación' :
                     language === 'en' ? 'Explore properties by location' :
                     'Explorez les propriétés par emplacement',
        language,
        canonicalUrl: pathname,
      }),
      trackingString,
    };
  }

  // Enriquecer las ciudades con imágenes, iconos y descripciones
  const enrichedCities = (ciudades || []).map((city: any) => {
    const config = CITY_CONFIG[city.slug] || { icon: '📍', color: '#6B7280' };
    const description = CITY_DESCRIPTIONS[city.slug]?.[language] || '';

    return {
      name: city.name,
      slug: city.slug,
      count: city.count,
      count_venta: city.count_venta,
      count_alquiler: city.count_alquiler,
      parent_slug: city.parent_slug,
      icon: config.icon,
      color: config.color,
      hasEnrichedData: !!config.image,
      hero_image: config.image || null,
      seo_description: description,
    };
  });

  // Enriquecer sectores
  const enrichedSectors = (sectores || []).map((sector: any) => ({
    name: sector.name,
    slug: sector.slug,
    count: sector.count,
    count_venta: sector.count_venta,
    count_alquiler: sector.count_alquiler,
    parent_slug: sector.parent_slug,
  }));

  // Ciudades destacadas (top 4 con más propiedades)
  const featuredCities = enrichedCities.slice(0, 4);

  // Sectores destacados (top 12)
  const featuredSectors = enrichedSectors.slice(0, 12);

  // Obtener propiedades destacadas para las top 4 ciudades
  const featuredByLocation: Record<string, any> = {};

  const featuredPromises = featuredCities.map(async (city: any) => {
    const properties = await db.getFeaturedPropertiesByLocation(tenantId, city.slug, 'ciudad', 6);

    // Formatear propiedades para el carousel
    const formattedProperties = properties.map((p: any) => {
      const operationType = p.operacion || 'venta';
      const price = operationType === 'venta'
        ? (p.precio_venta || p.precio || 0)
        : (p.precio_alquiler || p.precio || 0);

      // Parsear imágenes
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

    return { name: city.name, slug: city.slug, properties: formattedProperties };
  });

  const featuredResults = await Promise.all(featuredPromises);
  featuredResults.forEach(({ name, slug, properties }) => {
    if (properties.length > 0) {
      const carouselTitle = generateLocationCarouselTitle(name, slug, language);
      featuredByLocation[name] = {
        properties,
        title: carouselTitle.title,
        subtitle: carouselTitle.subtitle,
        slug,
      };
    }
  });

  // Calcular totales
  const totalCities = ciudades?.length || 0;
  const totalSectors = sectores?.length || 0;
  const totalProperties = (ciudades || []).reduce((sum: number, c: any) => sum + (c.count || 0), 0);

  // Generar SEO
  const topCities = enrichedCities.slice(0, 3).map((c: any) => c.name).join(', ');

  const seoTitle = language === 'es'
    ? `Ubicaciones | Propiedades en ${topCities} y más`
    : language === 'en'
    ? `Locations | Properties in ${topCities} and more`
    : `Emplacements | Propriétés à ${topCities} et plus`;

  const seoDescription = language === 'es'
    ? `Explora ${totalProperties} propiedades en ${totalCities} ciudades de República Dominicana. Encuentra casas, apartamentos y villas en ${topCities}.`
    : language === 'en'
    ? `Explore ${totalProperties} properties in ${totalCities} cities in the Dominican Republic. Find houses, apartments and villas in ${topCities}.`
    : `Explorez ${totalProperties} propriétés dans ${totalCities} villes en République Dominicaine. Trouvez maisons, appartements et villas à ${topCities}.`;

  // Structured data
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: seoTitle,
    description: seoDescription,
    numberOfItems: totalCities,
    itemListElement: enrichedCities.slice(0, 10).map((city: any, index: number) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: city.name,
      url: `${pathname.replace(/\/ubicaciones.*/, '')}/${city.slug}`,
      description: `${city.count} ${language === 'es' ? 'propiedades disponibles' : 'properties available'}`,
    })),
  };

  // Breadcrumbs
  const breadcrumbs = [
    {
      name: language === 'es' ? 'Inicio' : language === 'en' ? 'Home' : 'Accueil',
      url: '/',
    },
    {
      name: language === 'es' ? 'Ubicaciones' :
            language === 'en' ? 'Locations' : 'Emplacements',
      url: pathname,
    },
  ];

  return {
    type: 'locations-main',
    pageType: 'locations-main',
    language,
    tenant,
    locations: {
      provinces: provincias || [],
      cities: enrichedCities,
      sectors: enrichedSectors,
      enrichedCities: featuredCities,
    },
    stats: {
      totalCities,
      totalSectors,
      totalProperties,
    },
    featuredByLocation,
    seoContent: SEO_CONTENT[language] || SEO_CONTENT.es,
    seo: {
      title: seoTitle,
      description: seoDescription,
      h1: language === 'es' ? 'Explora Ubicaciones' :
          language === 'en' ? 'Explore Locations' : 'Explorer les Emplacements',
      h2: language === 'es' ? 'Encuentra propiedades en las mejores zonas de República Dominicana' :
          language === 'en' ? 'Find properties in the best areas of the Dominican Republic' :
          'Trouvez des propriétés dans les meilleures zones de la République Dominicaine',
      canonical_url: pathname,
      keywords: `${topCities}, ${language === 'es' ? 'bienes raíces, propiedades, inmuebles, República Dominicana' : 'real estate, properties, Dominican Republic'}`,
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
  } catch (error) {
    console.error('[Locations Handler] Error:', error);
    // Devolver respuesta de fallback en caso de error
    return {
      type: 'locations-main',
      pageType: 'locations-main',
      language,
      tenant,
      locations: {
        provinces: [],
        cities: [],
        sectors: [],
        enrichedCities: []
      },
      stats: {
        totalCities: 0,
        totalSectors: 0,
        totalProperties: 0
      },
      featuredByLocation: {},
      seoContent: SEO_CONTENT[language] || SEO_CONTENT.es,
      seo: {
        title: language === 'es' ? 'Ubicaciones | CLIC' :
              language === 'en' ? 'Locations | CLIC' : 'Emplacements | CLIC',
        description: language === 'es' ? 'Explora propiedades por ubicación en República Dominicana' :
                    language === 'en' ? 'Explore properties by location in Dominican Republic' :
                    'Explorez les propriétés par emplacement en République Dominicaine',
        h1: language === 'es' ? 'Explora Ubicaciones' :
            language === 'en' ? 'Explore Locations' : 'Explorer les Emplacements',
        h2: language === 'es' ? 'Encuentra propiedades en las mejores zonas' :
            language === 'en' ? 'Find properties in the best areas' :
            'Trouvez des propriétés dans les meilleures zones',
        canonical_url: pathname,
        breadcrumbs: [],
      },
      trackingString,
    };
  }
}

export default {
  handleLocations,
};
