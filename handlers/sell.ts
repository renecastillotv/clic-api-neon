// handlers/sell.ts
// Handler para página de vender con estadísticas de ventas
// Usa la tabla 'ventas' para calcular estadísticas del mercado

import db from '../lib/db';
import utils from '../lib/utils';
import type { TenantConfig, SEOData } from '../types';

// ============================================================================
// TIPOS
// ============================================================================

interface MarketHighlights {
  totalVolume: string;
  averagePrice: string;
  daysOnMarket: number;
  totalSales: number;
  topCategory: string;
  topBedrooms: string;
  topLocation: string;
  yearTrend: string;
  projectsShare: string;
}

interface Service {
  icon: string;
  title: string;
  description: string;
  features: string[];
  included: boolean;
}

interface ProcessStep {
  step: number;
  title: string;
  duration: string;
  cost: string;
}

interface TopAgent {
  id: string;
  name: string;
  avatar: string;
  position: string;
  totalSales: number;
  totalVolume: number;
  url: string;
}

interface SuccessStory {
  id: string;
  propertyName: string;
  location: string;
  soldDate: string;
  price: string;
}

interface Testimonial {
  id: string;
  rating: number;
  title: string;
  excerpt: string;
  clientName: string;
  clientAvatar: string;
  clientProfession: string;
}

interface Guarantee {
  icon: string;
  title: string;
  description: string;
}

interface SellResponse {
  type: 'sell';
  language: string;
  tenant: TenantConfig;
  seo: SEOData;
  trackingString: string;
  marketHighlights: MarketHighlights;
  marketAnalysis: any;
  services: Service[];
  process: ProcessStep[];
  topAgents: TopAgent[];
  successStories: SuccessStory[];
  testimonials: Testimonial[];
  guarantees: Guarantee[];
  contactInfo: {
    phone: string;
    whatsapp: string;
    email: string;
  };
}

// ============================================================================
// TEXTOS POR IDIOMA
// ============================================================================

const TEXTS: Record<string, Record<string, any>> = {
  es: {
    seoTitle: 'Vende Tu Propiedad',
    seoDescription: 'Vende tu propiedad con los expertos inmobiliarios. Evaluación gratuita, asesoría personalizada y el mejor precio del mercado.',
    seoH1: 'Vende Tu Propiedad Con Los Expertos',
    services: [
      {
        icon: 'camera',
        title: 'Fotografía Profesional',
        description: 'Sesión fotográfica de alta calidad para destacar tu propiedad',
        features: ['Fotos HD profesionales', 'Tour virtual 360°', 'Video promocional', 'Edición profesional'],
        included: true
      },
      {
        icon: 'bullhorn',
        title: 'Marketing Digital',
        description: 'Promoción en las principales plataformas inmobiliarias',
        features: ['Portales inmobiliarios', 'Redes sociales', 'Email marketing', 'Google Ads'],
        included: true
      },
      {
        icon: 'file-contract',
        title: 'Asesoría Legal',
        description: 'Acompañamiento en todo el proceso legal de la venta',
        features: ['Revisión de documentos', 'Contratos seguros', 'Trámites notariales', 'Due diligence'],
        included: true
      },
      {
        icon: 'handshake',
        title: 'Negociación Experta',
        description: 'Obtenemos el mejor precio para tu propiedad',
        features: ['Análisis de mercado', 'Estrategia de precio', 'Negociación directa', 'Cierre exitoso'],
        included: true
      }
    ],
    process: [
      { step: 1, title: 'Evaluación de tu Propiedad', duration: '1-2 días', cost: 'Gratis' },
      { step: 2, title: 'Preparación y Fotografía', duration: '3-5 días', cost: 'Incluido' },
      { step: 3, title: 'Publicación y Marketing', duration: 'Inmediato', cost: 'Incluido' },
      { step: 4, title: 'Visitas y Negociación', duration: 'Variable', cost: 'Incluido' },
      { step: 5, title: 'Cierre de Venta', duration: '30-60 días', cost: 'Comisión al cierre' }
    ],
    guarantees: [
      { icon: 'shield-check', title: 'Transparencia Total', description: 'Sin costos ocultos ni sorpresas' },
      { icon: 'clock', title: 'Respuesta Rápida', description: 'Atención en menos de 24 horas' },
      { icon: 'award', title: 'Experiencia Comprobada', description: 'Más de 10 años en el mercado' },
      { icon: 'users', title: 'Equipo Dedicado', description: 'Un asesor exclusivo para ti' }
    ]
  },
  en: {
    seoTitle: 'Sell Your Property',
    seoDescription: 'Sell your property with real estate experts. Free evaluation, personalized advice and the best market price.',
    seoH1: 'Sell Your Property With The Experts',
    services: [
      {
        icon: 'camera',
        title: 'Professional Photography',
        description: 'High quality photo session to highlight your property',
        features: ['Professional HD photos', '360° virtual tour', 'Promotional video', 'Professional editing'],
        included: true
      },
      {
        icon: 'bullhorn',
        title: 'Digital Marketing',
        description: 'Promotion on major real estate platforms',
        features: ['Real estate portals', 'Social media', 'Email marketing', 'Google Ads'],
        included: true
      },
      {
        icon: 'file-contract',
        title: 'Legal Advisory',
        description: 'Support throughout the legal sales process',
        features: ['Document review', 'Secure contracts', 'Notarial procedures', 'Due diligence'],
        included: true
      },
      {
        icon: 'handshake',
        title: 'Expert Negotiation',
        description: 'We get the best price for your property',
        features: ['Market analysis', 'Pricing strategy', 'Direct negotiation', 'Successful closing'],
        included: true
      }
    ],
    process: [
      { step: 1, title: 'Property Evaluation', duration: '1-2 days', cost: 'Free' },
      { step: 2, title: 'Preparation and Photography', duration: '3-5 days', cost: 'Included' },
      { step: 3, title: 'Publication and Marketing', duration: 'Immediate', cost: 'Included' },
      { step: 4, title: 'Visits and Negotiation', duration: 'Variable', cost: 'Included' },
      { step: 5, title: 'Sale Closing', duration: '30-60 days', cost: 'Commission at closing' }
    ],
    guarantees: [
      { icon: 'shield-check', title: 'Total Transparency', description: 'No hidden costs or surprises' },
      { icon: 'clock', title: 'Quick Response', description: 'Attention in less than 24 hours' },
      { icon: 'award', title: 'Proven Experience', description: 'Over 10 years in the market' },
      { icon: 'users', title: 'Dedicated Team', description: 'An exclusive advisor for you' }
    ]
  },
  fr: {
    seoTitle: 'Vendez Votre Propriété',
    seoDescription: 'Vendez votre propriété avec des experts immobiliers. Évaluation gratuite, conseils personnalisés et le meilleur prix du marché.',
    seoH1: 'Vendez Votre Propriété Avec Les Experts',
    services: [
      {
        icon: 'camera',
        title: 'Photographie Professionnelle',
        description: 'Séance photo de haute qualité pour mettre en valeur votre propriété',
        features: ['Photos HD professionnelles', 'Visite virtuelle 360°', 'Vidéo promotionnelle', 'Édition professionnelle'],
        included: true
      },
      {
        icon: 'bullhorn',
        title: 'Marketing Digital',
        description: 'Promotion sur les principales plateformes immobilières',
        features: ['Portails immobiliers', 'Réseaux sociaux', 'Email marketing', 'Google Ads'],
        included: true
      },
      {
        icon: 'file-contract',
        title: 'Conseil Juridique',
        description: 'Accompagnement dans tout le processus juridique de vente',
        features: ['Révision des documents', 'Contrats sécurisés', 'Procédures notariales', 'Due diligence'],
        included: true
      },
      {
        icon: 'handshake',
        title: 'Négociation Experte',
        description: 'Nous obtenons le meilleur prix pour votre propriété',
        features: ['Analyse de marché', 'Stratégie de prix', 'Négociation directe', 'Clôture réussie'],
        included: true
      }
    ],
    process: [
      { step: 1, title: 'Évaluation de votre Propriété', duration: '1-2 jours', cost: 'Gratuit' },
      { step: 2, title: 'Préparation et Photographie', duration: '3-5 jours', cost: 'Inclus' },
      { step: 3, title: 'Publication et Marketing', duration: 'Immédiat', cost: 'Inclus' },
      { step: 4, title: 'Visites et Négociation', duration: 'Variable', cost: 'Inclus' },
      { step: 5, title: 'Clôture de Vente', duration: '30-60 jours', cost: 'Commission à la clôture' }
    ],
    guarantees: [
      { icon: 'shield-check', title: 'Transparence Totale', description: 'Pas de coûts cachés ni de surprises' },
      { icon: 'clock', title: 'Réponse Rapide', description: 'Attention en moins de 24 heures' },
      { icon: 'award', title: 'Expérience Prouvée', description: 'Plus de 10 ans sur le marché' },
      { icon: 'users', title: 'Équipe Dédiée', description: 'Un conseiller exclusif pour vous' }
    ]
  }
};

// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================

export async function handleSell(options: {
  tenant: TenantConfig;
  language: string;
  trackingString: string;
}): Promise<SellResponse> {
  const { tenant, language, trackingString } = options;
  const sql = db.getSQL();
  const texts = TEXTS[language] || TEXTS.es;

  // =========================================================================
  // QUERIES A LA TABLA VENTAS
  // =========================================================================

  // 1. Estadísticas generales de ventas
  let statsResult: any[] = [];
  try {
    statsResult = await sql`
      SELECT
        COUNT(*) as total_ventas,
        COALESCE(SUM(valor_cierre), 0) as volumen_total,
        COALESCE(AVG(valor_cierre), 0) as precio_promedio,
        COUNT(CASE WHEN completada = true THEN 1 END) as ventas_completadas
      FROM ventas
      WHERE tenant_id = ${tenant.id}
        AND activo = true
        AND cancelada = false
    ` as any[];
  } catch (err) {
    console.error('[Sell Handler] Error fetching stats:', err);
  }

  const stats = statsResult[0] || {};
  const totalSales = parseInt(stats.total_ventas || '0', 10);
  const totalVolume = parseFloat(stats.volumen_total || '0');
  const avgPrice = parseFloat(stats.precio_promedio || '0');

  // 2. Top ubicaciones (ciudad más vendida)
  let topLocationResult: any[] = [];
  try {
    topLocationResult = await sql`
      SELECT
        ciudad_propiedad as ciudad,
        COUNT(*) as total
      FROM ventas
      WHERE tenant_id = ${tenant.id}
        AND activo = true
        AND cancelada = false
        AND ciudad_propiedad IS NOT NULL
      GROUP BY ciudad_propiedad
      ORDER BY total DESC
      LIMIT 1
    ` as any[];
  } catch (err) {
    console.error('[Sell Handler] Error fetching top location:', err);
  }

  // 3. Top categoría (tipo de propiedad más vendida)
  let topCategoryResult: any[] = [];
  try {
    topCategoryResult = await sql`
      SELECT
        categoria_propiedad as categoria,
        COUNT(*) as total
      FROM ventas
      WHERE tenant_id = ${tenant.id}
        AND activo = true
        AND cancelada = false
        AND categoria_propiedad IS NOT NULL
      GROUP BY categoria_propiedad
      ORDER BY total DESC
      LIMIT 1
    ` as any[];
  } catch (err) {
    console.error('[Sell Handler] Error fetching top category:', err);
  }

  // 4. Top agentes por ventas (usando perfil_asesor_id)
  let topAgentsResult: any[] = [];
  try {
    topAgentsResult = await sql`
      SELECT
        v.perfil_asesor_id,
        pa.nombre,
        pa.apellido,
        pa.foto as avatar,
        pa.cargo as position,
        pa.slug,
        COUNT(*) as total_ventas,
        COALESCE(SUM(v.valor_cierre), 0) as volumen_total
      FROM ventas v
      INNER JOIN perfiles_asesor pa ON v.perfil_asesor_id = pa.id
      WHERE v.tenant_id = ${tenant.id}
        AND v.activo = true
        AND v.cancelada = false
        AND v.completada = true
        AND v.perfil_asesor_id IS NOT NULL
      GROUP BY v.perfil_asesor_id, pa.nombre, pa.apellido, pa.foto, pa.cargo, pa.slug
      ORDER BY total_ventas DESC, volumen_total DESC
      LIMIT 4
    ` as any[];
  } catch (err) {
    console.error('[Sell Handler] Error fetching top agents:', err);
  }

  // 5. Ventas recientes (success stories)
  let recentSalesResult: any[] = [];
  try {
    recentSalesResult = await sql`
      SELECT
        v.id,
        v.nombre_negocio,
        v.nombre_propiedad_externa,
        v.ciudad_propiedad,
        v.sector_propiedad,
        v.valor_cierre,
        v.moneda,
        v.fecha_cierre,
        p.titulo as propiedad_titulo,
        p.ciudad as propiedad_ciudad,
        p.sector as propiedad_sector
      FROM ventas v
      LEFT JOIN propiedades p ON v.propiedad_id = p.id
      WHERE v.tenant_id = ${tenant.id}
        AND v.activo = true
        AND v.cancelada = false
        AND v.completada = true
      ORDER BY v.fecha_cierre DESC NULLS LAST
      LIMIT 6
    ` as any[];
  } catch (err) {
    console.error('[Sell Handler] Error fetching recent sales:', err);
  }

  // 6. Comparación anual (tendencia)
  let yearTrendResult: any[] = [];
  try {
    const currentYear = new Date().getFullYear();
    const lastYear = currentYear - 1;

    yearTrendResult = await sql`
      SELECT
        EXTRACT(YEAR FROM fecha_cierre) as year,
        COUNT(*) as total,
        COALESCE(SUM(valor_cierre), 0) as volumen
      FROM ventas
      WHERE tenant_id = ${tenant.id}
        AND activo = true
        AND cancelada = false
        AND completada = true
        AND EXTRACT(YEAR FROM fecha_cierre) IN (${currentYear}, ${lastYear})
      GROUP BY EXTRACT(YEAR FROM fecha_cierre)
      ORDER BY year DESC
    ` as any[];
  } catch (err) {
    console.error('[Sell Handler] Error fetching year trend:', err);
  }

  // Calcular tendencia
  let yearTrendPercent = '+0%';
  if (yearTrendResult.length >= 2) {
    const currentYearData = yearTrendResult.find(r => parseInt(r.year) === new Date().getFullYear());
    const lastYearData = yearTrendResult.find(r => parseInt(r.year) === new Date().getFullYear() - 1);

    if (currentYearData && lastYearData && parseFloat(lastYearData.volumen) > 0) {
      const trend = ((parseFloat(currentYearData.volumen) - parseFloat(lastYearData.volumen)) / parseFloat(lastYearData.volumen)) * 100;
      yearTrendPercent = `${trend >= 0 ? '+' : ''}${trend.toFixed(1)}%`;
    }
  }

  // 7. Obtener testimonios
  const testimonials = await db.getTestimonials(tenant.id, 3) as any[];

  // =========================================================================
  // CONSTRUIR RESPUESTA
  // =========================================================================

  // Formatear volumen total
  const formatVolume = (vol: number): string => {
    if (vol >= 1000000000) return `$${(vol / 1000000000).toFixed(1)}B`;
    if (vol >= 1000000) return `$${(vol / 1000000).toFixed(1)}M`;
    if (vol >= 1000) return `$${(vol / 1000).toFixed(0)}K`;
    return `$${vol.toFixed(0)}`;
  };

  const formatPrice = (price: number, currency: string = 'USD'): string => {
    const symbol = currency === 'DOP' ? 'RD$' : 'US$';
    return `${symbol}${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(price)}`;
  };

  // Market Highlights
  const marketHighlights: MarketHighlights = {
    totalVolume: formatVolume(totalVolume),
    averagePrice: formatPrice(avgPrice),
    daysOnMarket: 45, // Valor por defecto, podría calcularse si se tiene fecha de inicio
    totalSales: totalSales,
    topCategory: topCategoryResult[0]?.categoria || 'Apartamentos',
    topBedrooms: '3', // Valor por defecto
    topLocation: topLocationResult[0]?.ciudad || 'Santo Domingo',
    yearTrend: yearTrendPercent,
    projectsShare: totalSales > 0 ? '75%' : '0%' // Valor aproximado
  };

  // Top Agents
  const topAgents: TopAgent[] = topAgentsResult.map((agent: any) => ({
    id: agent.perfil_asesor_id,
    name: `${agent.nombre || ''} ${agent.apellido || ''}`.trim() || 'Asesor',
    avatar: agent.avatar || '',
    position: agent.position || (language === 'en' ? 'Real Estate Advisor' : language === 'fr' ? 'Conseiller Immobilier' : 'Asesor Inmobiliario'),
    totalSales: parseInt(agent.total_ventas || '0', 10),
    totalVolume: parseFloat(agent.volumen_total || '0'),
    url: agent.slug ? `/${language === 'es' ? 'asesores' : language === 'en' ? 'en/advisors' : 'fr/conseillers'}/${agent.slug}${trackingString}` : '#'
  }));

  // Success Stories
  const successStories: SuccessStory[] = recentSalesResult.map((sale: any) => ({
    id: sale.id,
    propertyName: sale.propiedad_titulo || sale.nombre_propiedad_externa || sale.nombre_negocio || 'Propiedad Vendida',
    location: sale.propiedad_ciudad || sale.ciudad_propiedad || 'República Dominicana',
    soldDate: sale.fecha_cierre || new Date().toISOString(),
    price: formatPrice(parseFloat(sale.valor_cierre || '0'), sale.moneda || 'USD')
  }));

  // Testimonials - usando formato unificado
  const processedTestimonials = utils.formatTestimonials(testimonials, language, { trackingString });

  // Información de contacto del tenant
  const contactInfo = {
    phone: tenant.contact?.phone || '8094872542',
    whatsapp: tenant.contact?.whatsapp || '8295148080',
    email: tenant.contact?.email || 'info@clicinmobiliaria.com'
  };

  // SEO
  const canonicalUrl = utils.buildUrl('/vender', language);
  const seo = utils.generateSEO({
    title: `${texts.seoTitle} | ${tenant.name}`,
    description: texts.seoDescription,
    canonicalUrl,
    language,
    siteName: tenant.name,
    h1: texts.seoH1
  });

  return {
    type: 'sell',
    language,
    tenant,
    seo: {
      ...seo,
      h1: texts.seoH1
    },
    trackingString,
    marketHighlights,
    marketAnalysis: {
      topCategory: marketHighlights.topCategory,
      topLocation: marketHighlights.topLocation,
      yearTrend: marketHighlights.yearTrend
    },
    services: texts.services,
    process: texts.process,
    topAgents,
    successStories,
    testimonials: processedTestimonials,
    guarantees: texts.guarantees,
    contactInfo
  };
}

export default {
  handleSell
};
