// handlers/leads.ts - Handler para envío de leads desde formularios de contacto
import { getSQL } from '../lib/db';

interface LeadData {
  // Required fields
  cliente_nombre: string;
  cliente_email: string;
  cliente_telefono: string;

  // Optional fields
  cliente_celular?: string;
  mensaje?: string;
  acepta_terminos?: boolean | string;

  // Property context
  propiedad_id?: string;
  property_title?: string;

  // Agent assignment
  asignado?: string;

  // Tracking
  origen?: string;
  referidor_lead?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  ip_origen?: string;
  user_agent?: string;
  language?: string;
}

interface SubmitLeadParams {
  tenantId: string;
  leadData: LeadData;
  clientIP?: string;
}

// Validar email
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Sanitizar string para prevenir XSS
function sanitizeString(str: string | undefined | null): string {
  if (!str) return '';
  return str
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .trim()
    .substring(0, 2000); // Limit length
}

// Validar UUID
function isValidUUID(str: string | undefined | null): boolean {
  if (!str) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

export async function submitLead(params: SubmitLeadParams): Promise<{ success: boolean; leadId?: string; error?: string }> {
  const { tenantId, leadData, clientIP } = params;
  const sql = getSQL();

  console.log(`[Leads] Submitting lead for tenant: ${tenantId}`);

  try {
    // Validaciones
    if (!leadData.cliente_nombre || leadData.cliente_nombre.trim().length < 2) {
      return { success: false, error: 'El nombre es requerido (mínimo 2 caracteres)' };
    }

    if (!leadData.cliente_email || !isValidEmail(leadData.cliente_email)) {
      return { success: false, error: 'Por favor ingresa un email válido' };
    }

    if (!leadData.cliente_telefono || leadData.cliente_telefono.trim().length < 7) {
      return { success: false, error: 'El teléfono es requerido' };
    }

    // Sanitizar datos
    const sanitizedData = {
      cliente_nombre: sanitizeString(leadData.cliente_nombre),
      cliente_email: leadData.cliente_email.trim().toLowerCase(),
      cliente_telefono: sanitizeString(leadData.cliente_telefono),
      cliente_celular: sanitizeString(leadData.cliente_celular),
      mensaje: sanitizeString(leadData.mensaje),
      acepta_terminos: leadData.acepta_terminos === true || leadData.acepta_terminos === 'true' || leadData.acepta_terminos === 'on',
      propiedad_id: isValidUUID(leadData.propiedad_id) ? leadData.propiedad_id : null,
      property_title: sanitizeString(leadData.property_title)?.substring(0, 500),
      asignado: isValidUUID(leadData.asignado) ? leadData.asignado : null,
      origen: sanitizeString(leadData.origen) || 'web_formulario',
      referidor_lead: sanitizeString(leadData.referidor_lead)?.substring(0, 500),
      utm_source: sanitizeString(leadData.utm_source)?.substring(0, 255),
      utm_medium: sanitizeString(leadData.utm_medium)?.substring(0, 255),
      utm_campaign: sanitizeString(leadData.utm_campaign)?.substring(0, 255),
      ip_origen: clientIP?.substring(0, 45) || sanitizeString(leadData.ip_origen)?.substring(0, 45),
      user_agent: sanitizeString(leadData.user_agent)?.substring(0, 1000),
      language: sanitizeString(leadData.language)?.substring(0, 10) || 'es',
    };

    // Insertar lead en la base de datos
    const result = await sql`
      INSERT INTO leads (
        tenant_id,
        propiedad_id,
        property_title,
        asignado,
        cliente_nombre,
        cliente_telefono,
        cliente_celular,
        cliente_email,
        mensaje,
        acepta_terminos,
        origen,
        referidor_lead,
        utm_source,
        utm_medium,
        utm_campaign,
        ip_origen,
        user_agent,
        language,
        estado
      ) VALUES (
        ${tenantId},
        ${sanitizedData.propiedad_id},
        ${sanitizedData.property_title},
        ${sanitizedData.asignado},
        ${sanitizedData.cliente_nombre},
        ${sanitizedData.cliente_telefono},
        ${sanitizedData.cliente_celular},
        ${sanitizedData.cliente_email},
        ${sanitizedData.mensaje},
        ${sanitizedData.acepta_terminos},
        ${sanitizedData.origen},
        ${sanitizedData.referidor_lead},
        ${sanitizedData.utm_source},
        ${sanitizedData.utm_medium},
        ${sanitizedData.utm_campaign},
        ${sanitizedData.ip_origen},
        ${sanitizedData.user_agent},
        ${sanitizedData.language},
        'nuevo'
      )
      RETURNING id
    `;

    const leadId = result[0]?.id;

    console.log(`[Leads] Lead created successfully: ${leadId}`);

    return { success: true, leadId };

  } catch (error: any) {
    console.error('[Leads] Error submitting lead:', error);

    // Check for specific database errors
    if (error.code === '23503') {
      // Foreign key violation
      return { success: false, error: 'Referencia inválida a propiedad o asesor' };
    }

    return { success: false, error: 'Error al guardar la solicitud. Por favor intenta nuevamente.' };
  }
}

export default {
  submitLead,
};
