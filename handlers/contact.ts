// handlers/contact.ts - Handler para la página de contacto
import { getSQL } from '../lib/db';
import * as utils from '../lib/utils';

interface ContactHandlerParams {
  tenant: any;
  language: string;
  trackingString: string;
}

interface AdvisorProfile {
  id: string;
  nombre: string;
  apellido: string;
  nombre_completo: string;
  titulo_profesional: string;
  foto_url: string;
  telefono: string;
  email: string;
  whatsapp: string;
  especialidades: string[];
  slug: string;
}

// Obtener asesores activos del tenant
async function getActiveAdvisors(tenantId: string, limit: number = 6): Promise<AdvisorProfile[]> {
  const sql = getSQL();

  try {
    const result = await sql`
      SELECT
        pa.id,
        u.nombre,
        u.apellido,
        pa.titulo_profesional,
        pa.foto_url,
        u.avatar_url,
        pa.telefono_directo,
        u.telefono as usuario_telefono,
        u.email,
        pa.whatsapp,
        pa.especialidades,
        pa.slug
      FROM perfiles_asesor pa
      INNER JOIN usuarios u ON u.id = pa.usuario_id
      WHERE pa.tenant_id = ${tenantId}
        AND pa.activo = true
        AND u.active = true
      ORDER BY pa.orden_listado ASC NULLS LAST, pa.created_at ASC
      LIMIT ${limit}
    `;

    return result.map((row: any) => ({
      id: row.id,
      nombre: row.nombre || '',
      apellido: row.apellido || '',
      nombre_completo: `${row.nombre || ''} ${row.apellido || ''}`.trim(),
      titulo_profesional: row.titulo_profesional || 'Asesor Inmobiliario',
      foto_url: row.foto_url || row.avatar_url || '',
      telefono: row.telefono_directo || row.usuario_telefono || '',
      email: row.email || '',
      whatsapp: row.whatsapp || row.telefono_directo || row.usuario_telefono || '',
      especialidades: row.especialidades || [],
      slug: row.slug || ''
    }));
  } catch (error) {
    console.error('[getActiveAdvisors] Error:', error);
    return [];
  }
}

// Textos por idioma para SEO
const SEO_TEXTS = {
  es: {
    title: 'Contacto - CLIC Inmobiliaria',
    description: 'Contáctanos para vender tu propiedad, desarrollar tu proyecto o encontrar tu hogar ideal en República Dominicana. Respuesta en menos de 24 horas.',
    h1: 'Hablemos de tu proyecto',
    h2: 'Estamos aquí para ayudarte. Conversemos sin compromiso sobre cómo podemos trabajar juntos.'
  },
  en: {
    title: 'Contact - CLIC Real Estate',
    description: 'Contact us to sell your property, develop your project or find your ideal home in Dominican Republic. Response within 24 hours.',
    h1: 'Let\'s talk about your project',
    h2: 'We are here to help you. Let\'s talk without commitment about how we can work together.'
  },
  fr: {
    title: 'Contact - CLIC Immobilier',
    description: 'Contactez-nous pour vendre votre propriété, développer votre projet ou trouver votre maison idéale en République Dominicaine. Réponse en moins de 24 heures.',
    h1: 'Parlons de votre projet',
    h2: 'Nous sommes là pour vous aider. Parlons sans engagement de la façon dont nous pouvons travailler ensemble.'
  }
};

export async function handleContact(params: ContactHandlerParams) {
  const { tenant, language, trackingString } = params;
  const tenantId = tenant.id;

  console.log(`[Contact] Building contact page for tenant: ${tenantId}, language: ${language}`);

  // Cargar asesores reales
  const advisors = await getActiveAdvisors(tenantId, 6);
  console.log(`[Contact] Loaded ${advisors.length} active advisors`);

  // Formatear asesores para el frontend
  const teamMembers = advisors.map(advisor => ({
    id: advisor.id,
    name: advisor.nombre_completo,
    title: advisor.titulo_profesional,
    phone: advisor.telefono,
    email: advisor.email,
    whatsapp: advisor.whatsapp,
    avatar: advisor.foto_url,
    specialties: Array.isArray(advisor.especialidades) ? advisor.especialidades : [],
    slug: advisor.slug
  }));

  // Obtener textos según idioma
  const seoTexts = SEO_TEXTS[language as keyof typeof SEO_TEXTS] || SEO_TEXTS.es;

  // Información de contacto de la oficina
  // Coordenadas exactas de la oficina CLIC en Santo Domingo
  const officeInfo = {
    main: {
      phone: tenant.contact?.phone || '+1 809 487 2542',
      whatsapp: tenant.contact?.whatsapp || '8295148080',
      email: tenant.contact?.email || 'info@clicinmobiliaria.com',
      address: tenant.contact?.address || 'Calle Erik Leonard Ekman No. 34, Edificio The Box Working Space',
    },
    offices: [
      {
        name: 'Oficina Principal - Santo Domingo',
        address: tenant.contact?.address || 'Calle Erik Leonard Ekman No. 34, Edificio The Box Working Space',
        city: 'Santo Domingo, República Dominicana',
        phone: tenant.contact?.phone || '+1 809 487 2542',
        // Coordenadas exactas de "The Box Working Space" en Santo Domingo
        // Calle Erik Leonard Ekman #34, Viejo Arroyo Hondo
        // Verificadas en Google Maps: https://www.google.com/maps/place/The+Box+Working+Space
        coordinates: {
          lat: 18.4958553,
          lng: -69.9454147
        }
      }
    ],
    hours: {
      weekdays: language === 'es' ? 'Lunes - Viernes: 8:00 AM - 6:00 PM' :
                language === 'en' ? 'Monday - Friday: 8:00 AM - 6:00 PM' :
                'Lundi - Vendredi: 8:00 AM - 6:00 PM',
      saturday: language === 'es' ? 'Sábado: 9:00 AM - 2:00 PM' :
                language === 'en' ? 'Saturday: 9:00 AM - 2:00 PM' :
                'Samedi: 9:00 AM - 2:00 PM',
      sunday: language === 'es' ? 'Domingo: Cerrado' :
              language === 'en' ? 'Sunday: Closed' :
              'Dimanche: Fermé'
    }
  };

  // Servicios disponibles
  const services = [
    {
      value: 'asesor',
      label: language === 'es' ? 'Quiero ser parte de CLIC como asesor' :
             language === 'en' ? 'I want to be part of CLIC as an advisor' :
             'Je veux faire partie de CLIC en tant que conseiller'
    },
    {
      value: 'vender',
      label: language === 'es' ? 'Quiero vender mi propiedad' :
             language === 'en' ? 'I want to sell my property' :
             'Je veux vendre ma propriété'
    },
    {
      value: 'desarrollo',
      label: language === 'es' ? 'Quiero que vendan mi proyecto' :
             language === 'en' ? 'I want you to sell my project' :
             'Je veux que vous vendiez mon projet'
    },
    {
      value: 'comprar',
      label: language === 'es' ? 'Quiero comprar' :
             language === 'en' ? 'I want to buy' :
             'Je veux acheter'
    },
    {
      value: 'otro',
      label: language === 'es' ? 'Quiero otro servicio' :
             language === 'en' ? 'I want another service' :
             'Je veux un autre service'
    }
  ];

  // Generar URLs de hreflang
  const hreflangUrls = {
    es: '/contacto',
    en: '/en/contact',
    fr: '/fr/contact',
    'x-default': '/contacto'
  };

  // Breadcrumbs
  const breadcrumbs = [
    {
      name: language === 'es' ? 'Inicio' : language === 'en' ? 'Home' : 'Accueil',
      url: language === 'es' ? '/' : `/${language}`
    },
    {
      name: language === 'es' ? 'Contacto' : language === 'en' ? 'Contact' : 'Contact',
      url: language === 'es' ? '/contacto' : `/${language}/contact`
    }
  ];

  return {
    type: 'contact',
    language,
    trackingString,

    // Información de contacto estructurada
    contactInfo: officeInfo,

    // Equipo de asesores (reales de la BD)
    team: teamMembers,

    // Servicios disponibles
    services,

    // SEO optimizado
    seo: {
      title: seoTexts.title,
      description: seoTexts.description,
      h1: seoTexts.h1,
      h2: seoTexts.h2,
      hreflang: hreflangUrls,
      breadcrumbs,
      canonical_url: language === 'es' ? '/contacto' : `/${language}/contact`,
      open_graph: {
        type: 'website',
        title: seoTexts.title,
        description: seoTexts.description,
        image: '/og-contact.jpg',
        locale: language === 'es' ? 'es_DO' : language === 'en' ? 'en_US' : 'fr_FR'
      },
      structured_data: {
        '@context': 'https://schema.org',
        '@type': 'ContactPage',
        name: seoTexts.title,
        description: seoTexts.description,
        mainEntity: {
          '@type': 'RealEstateAgent',
          name: 'CLIC Inmobiliaria',
          telephone: officeInfo.main.phone,
          email: officeInfo.main.email,
          address: {
            '@type': 'PostalAddress',
            streetAddress: officeInfo.offices[0].address,
            addressLocality: 'Santo Domingo',
            addressCountry: 'DO'
          },
          geo: {
            '@type': 'GeoCoordinates',
            latitude: officeInfo.offices[0].coordinates.lat,
            longitude: officeInfo.offices[0].coordinates.lng
          }
        }
      }
    }
  };
}

export default { handleContact };
