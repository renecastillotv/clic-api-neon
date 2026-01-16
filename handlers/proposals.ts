// api/handlers/proposals.ts
// Handler para sistema de propuestas públicas

import { getSQL } from '../lib/db';

// ============================================================================
// TIPOS
// ============================================================================

interface Proposal {
  id: string;
  tenant_id: string;
  titulo: string;
  descripcion: string | null;
  estado: string;
  contacto_id: string | null;
  usuario_creador_id: string | null;
  url_publica: string;
  fecha_expiracion: string | null;
  fecha_enviada: string | null;
  fecha_vista: string | null;
  veces_vista: number;
  datos_extra: Record<string, any>;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

interface ProposalProperty {
  id: string;
  propuesta_id: string;
  propiedad_id: string;
  orden: number;
  notas: string | null;
  precio_especial: number | null;
}

interface PropertyDetails {
  id: string;
  slug: string;
  codigo_publico: string;
  titulo: string;
  descripcion: string;
  short_description: string;
  tipo: string;
  operacion: string;
  precio: number;
  precio_venta: number | null;
  precio_alquiler: number | null;
  moneda: string;
  ciudad: string;
  sector: string;
  provincia: string;
  habitaciones: number;
  banos: number;
  estacionamientos: number;
  m2_construccion: number;
  m2_terreno: number;
  imagen_principal: string;
  imagenes: string[];
  is_project: boolean;
  created_at: string;
  // Campos adicionales de la propuesta
  orden?: number;
  notas_propuesta?: string;
  precio_especial?: number;
}

interface ProposalReaction {
  id: string;
  propuesta_id: string;
  propiedad_id: string;
  tipo_reaccion: 'like' | 'dislike' | 'maybe' | 'comment';
  comentario: string | null;
  created_at: string;
}

// ============================================================================
// FUNCIONES DE BASE DE DATOS
// ============================================================================

// Obtener propuesta por URL pública
async function getProposalByUrl(urlPublica: string): Promise<Proposal | null> {
  const sql = getSQL();

  const result = await sql`
    SELECT * FROM propuestas
    WHERE url_publica = ${urlPublica}
      AND activo = true
  `;

  return result[0] as Proposal || null;
}

// Incrementar contador de vistas y registrar fecha de primera vista
async function incrementViewCount(proposalId: string): Promise<void> {
  const sql = getSQL();

  await sql`
    UPDATE propuestas
    SET veces_vista = veces_vista + 1,
        fecha_vista = COALESCE(fecha_vista, NOW()),
        updated_at = NOW()
    WHERE id = ${proposalId}
  `;
}

// Obtener propiedades de una propuesta con detalles
async function getProposalProperties(proposalId: string): Promise<PropertyDetails[]> {
  const sql = getSQL();

  const result = await sql`
    SELECT
      p.id,
      p.slug,
      p.codigo_publico,
      p.titulo,
      p.descripcion,
      p.short_description,
      p.tipo,
      p.operacion,
      p.precio,
      p.precio_venta,
      p.precio_alquiler,
      p.moneda,
      p.ciudad,
      p.sector,
      p.provincia,
      p.habitaciones,
      p.banos,
      p.estacionamientos,
      p.m2_construccion,
      p.m2_terreno,
      p.imagen_principal,
      p.imagenes,
      p.is_project,
      p.created_at,
      pp.orden,
      pp.notas as notas_propuesta,
      pp.precio_especial
    FROM propuestas_propiedades pp
    INNER JOIN propiedades p ON p.id = pp.propiedad_id
    WHERE pp.propuesta_id = ${proposalId}
    ORDER BY pp.orden ASC, p.created_at DESC
  `;

  return result as PropertyDetails[];
}

// Obtener información del asesor creador (desde usuarios y perfiles_asesor)
async function getAdvisorInfo(userId: string | null, tenantId: string): Promise<any | null> {
  if (!userId) return null;

  const sql = getSQL();

  try {
    // Columnas de usuarios: id, nombre, apellido, email, telefono, avatar_url
    // Columnas de perfiles_asesor: id, slug, codigo, foto_url, titulo_profesional, biografia,
    //                              whatsapp, telefono_directo, idiomas, especialidades, redes_sociales
    const result = await sql`
      SELECT
        u.id as usuario_id,
        u.nombre,
        u.apellido,
        u.email,
        u.telefono as usuario_telefono,
        u.avatar_url,
        pa.id as perfil_id,
        pa.codigo,
        pa.slug,
        pa.foto_url,
        pa.titulo_profesional,
        pa.biografia,
        pa.whatsapp,
        pa.telefono_directo,
        pa.idiomas,
        pa.especialidades,
        pa.redes_sociales
      FROM usuarios u
      LEFT JOIN perfiles_asesor pa ON pa.usuario_id = u.id AND pa.tenant_id = ${tenantId}
      WHERE u.id = ${userId}
    `;

    if (result.length === 0) return null;

    const row = result[0];
    const nombre = row.nombre || '';
    const apellido = row.apellido || '';
    const email = row.email || '';
    const telefono = row.telefono_directo || row.usuario_telefono || '';
    const whatsapp = row.whatsapp || row.telefono_directo || row.usuario_telefono || '';
    const foto = row.foto_url || row.avatar_url || '';

    return {
      id: row.perfil_id || row.usuario_id,
      usuario_id: row.usuario_id,
      codigo: row.codigo,
      slug: row.slug,
      nombre: nombre,
      apellido: apellido,
      nombre_completo: `${nombre} ${apellido}`.trim(),
      email: email,
      telefono: telefono,
      whatsapp: whatsapp,
      foto: foto,
      cargo: row.titulo_profesional || 'Asesor Inmobiliario',
      bio: row.biografia,
      idiomas: row.idiomas,
      especialidades: row.especialidades,
      redes_sociales: row.redes_sociales
    };
  } catch (error) {
    console.error('[getAdvisorInfo] Error:', error);
    return null;
  }
}

// Obtener información del contacto (cliente)
async function getContactInfo(contactId: string | null): Promise<any | null> {
  if (!contactId) return null;

  const sql = getSQL();

  const result = await sql`
    SELECT
      c.id,
      c.nombre,
      c.apellido,
      c.email,
      c.telefono,
      c.whatsapp,
      c.tipo_contacto,
      c.fuente,
      c.datos_extra
    FROM contactos c
    WHERE c.id = ${contactId}
  `;

  if (result.length === 0) return null;

  const contact = result[0];
  return {
    id: contact.id,
    nombre: contact.nombre,
    apellido: contact.apellido,
    nombre_completo: `${contact.nombre || ''} ${contact.apellido || ''}`.trim(),
    email: contact.email,
    telefono: contact.telefono,
    whatsapp: contact.whatsapp,
    tipo: contact.tipo_contacto,
    fuente: contact.fuente
  };
}

// Obtener reacciones de una propuesta
async function getProposalReactions(proposalId: string): Promise<Record<string, any>> {
  const sql = getSQL();

  const result = await sql`
    SELECT * FROM propuesta_reacciones
    WHERE propuesta_id = ${proposalId}
    ORDER BY created_at DESC
  `;

  // Agrupar por propiedad
  const reactions: Record<string, any> = {};

  for (const row of result) {
    const propId = row.propiedad_id as string;
    if (!reactions[propId]) {
      reactions[propId] = {
        like: false,
        dislike: false,
        maybe: false,
        comments: []
      };
    }

    if (row.tipo_reaccion === 'like') {
      reactions[propId].like = true;
    } else if (row.tipo_reaccion === 'dislike') {
      reactions[propId].dislike = true;
    } else if (row.tipo_reaccion === 'maybe') {
      reactions[propId].maybe = true;
    } else if (row.tipo_reaccion === 'comment') {
      reactions[propId].comments.push({
        id: row.id,
        text: row.comentario,
        created_at: row.created_at
      });
    }
  }

  return reactions;
}

// Agregar o actualizar reacción
async function addReaction(
  proposalId: string,
  propertyId: string,
  reactionType: 'like' | 'dislike' | 'maybe'
): Promise<void> {
  const sql = getSQL();

  // Primero eliminar reacciones opuestas (no comentarios)
  const oppositeTypes = ['like', 'dislike', 'maybe'].filter(t => t !== reactionType);

  await sql`
    DELETE FROM propuesta_reacciones
    WHERE propuesta_id = ${proposalId}
      AND propiedad_id = ${propertyId}
      AND tipo_reaccion = ANY(${oppositeTypes})
  `;

  // Verificar si ya existe la reacción
  const existing = await sql`
    SELECT id FROM propuesta_reacciones
    WHERE propuesta_id = ${proposalId}
      AND propiedad_id = ${propertyId}
      AND tipo_reaccion = ${reactionType}
  `;

  if (existing.length > 0) {
    // Actualizar timestamp
    await sql`
      UPDATE propuesta_reacciones
      SET updated_at = NOW()
      WHERE id = ${existing[0].id}
    `;
  } else {
    // Insertar nueva reacción
    await sql`
      INSERT INTO propuesta_reacciones (propuesta_id, propiedad_id, tipo_reaccion)
      VALUES (${proposalId}, ${propertyId}, ${reactionType})
    `;
  }
}

// Eliminar reacción
async function removeReaction(
  proposalId: string,
  propertyId: string,
  reactionType: 'like' | 'dislike' | 'maybe'
): Promise<void> {
  const sql = getSQL();

  await sql`
    DELETE FROM propuesta_reacciones
    WHERE propuesta_id = ${proposalId}
      AND propiedad_id = ${propertyId}
      AND tipo_reaccion = ${reactionType}
  `;
}

// Agregar comentario
async function addComment(
  proposalId: string,
  propertyId: string,
  commentText: string
): Promise<ProposalReaction> {
  const sql = getSQL();

  const result = await sql`
    INSERT INTO propuesta_reacciones (propuesta_id, propiedad_id, tipo_reaccion, comentario)
    VALUES (${proposalId}, ${propertyId}, 'comment', ${commentText})
    RETURNING *
  `;

  return result[0] as ProposalReaction;
}

// Eliminar comentario
async function deleteComment(commentId: string): Promise<boolean> {
  const sql = getSQL();

  const result = await sql`
    DELETE FROM propuesta_reacciones
    WHERE id = ${commentId}
      AND tipo_reaccion = 'comment'
    RETURNING id
  `;

  return result.length > 0;
}

// Formatear propiedad para el frontend
function formatProperty(prop: PropertyDetails): any {
  const precio = prop.precio_especial || prop.precio_venta || prop.precio_alquiler || prop.precio || 0;
  const moneda = prop.moneda || 'USD';
  const precioFormateado = precio > 0
    ? `${moneda === 'USD' ? 'US$' : 'RD$'}${precio.toLocaleString()}`
    : 'Precio a consultar';

  return {
    id: prop.id,
    slug: prop.slug,
    code: prop.codigo_publico,
    titulo: prop.titulo,
    name: prop.titulo,
    descripcion: prop.descripcion,
    short_description: prop.short_description,
    tipo: prop.tipo,
    operacion: prop.operacion,
    sector: prop.sector,
    ciudad: prop.ciudad,
    provincia: prop.provincia,
    precio: precioFormateado,
    precio_valor: precio,
    precios: {
      venta: prop.precio_venta ? {
        valor: prop.precio_venta,
        formateado: `${moneda === 'USD' ? 'US$' : 'RD$'}${prop.precio_venta.toLocaleString()}`
      } : null,
      alquiler: prop.precio_alquiler ? {
        valor: prop.precio_alquiler,
        formateado: `${moneda === 'USD' ? 'US$' : 'RD$'}${prop.precio_alquiler.toLocaleString()}`
      } : null,
      especial: prop.precio_especial ? {
        valor: prop.precio_especial,
        formateado: `${moneda === 'USD' ? 'US$' : 'RD$'}${prop.precio_especial.toLocaleString()}`
      } : null
    },
    habitaciones: prop.habitaciones || 0,
    banos: prop.banos || 0,
    estacionamientos: prop.estacionamientos || 0,
    metros: prop.m2_construccion || 0,
    metros_terreno: prop.m2_terreno || 0,
    imagen: prop.imagen_principal,
    imagenes: prop.imagenes || [],
    is_project: prop.is_project || false,
    url: `/${prop.operacion === 'alquiler' ? 'alquilar' : 'comprar'}/${prop.slug}`,
    // Datos específicos de la propuesta
    orden: prop.orden,
    notas_propuesta: prop.notas_propuesta,
    tiene_precio_especial: !!prop.precio_especial
  };
}

// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================

export async function handleProposals(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // Estructura: /api/proposals/[action]/[params]
  const action = pathParts[2] || '';
  const method = request.method;

  // Headers CORS
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  // Handle OPTIONS (CORS preflight)
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  try {
    // GET /api/proposals/:urlPublica - Obtener propuesta por URL pública
    if (method === 'GET' && action && !['reaction', 'comment'].includes(action)) {
      const urlPublica = action;
      const proposal = await getProposalByUrl(urlPublica);

      if (!proposal) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Propuesta no encontrada o ha expirado'
        }), { status: 404, headers });
      }

      // Verificar si ha expirado
      if (proposal.fecha_expiracion) {
        const expDate = new Date(proposal.fecha_expiracion);
        if (expDate < new Date()) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Esta propuesta ha expirado'
          }), { status: 410, headers });
        }
      }

      // Incrementar contador de vistas
      await incrementViewCount(proposal.id);

      // Obtener propiedades, reacciones e información adicional
      const [properties, reactions, advisor, contact] = await Promise.all([
        getProposalProperties(proposal.id),
        getProposalReactions(proposal.id),
        getAdvisorInfo(proposal.usuario_creador_id, proposal.tenant_id),
        getContactInfo(proposal.contacto_id)
      ]);

      // Formatear propiedades
      const formattedProperties = properties.map(formatProperty);

      return new Response(JSON.stringify({
        success: true,
        data: {
          id: proposal.id,
          titulo: proposal.titulo,
          descripcion: proposal.descripcion,
          estado: proposal.estado,
          url_publica: proposal.url_publica,
          fecha_expiracion: proposal.fecha_expiracion,
          fecha_enviada: proposal.fecha_enviada,
          veces_vista: proposal.veces_vista + 1, // +1 por la vista actual
          datos_extra: proposal.datos_extra,
          created_at: proposal.created_at,
          properties: formattedProperties,
          reactions,
          advisor: advisor ? {
            id: advisor.id,
            codigo: advisor.codigo,
            slug: advisor.slug,
            nombre: advisor.nombre,
            apellido: advisor.apellido,
            nombre_completo: advisor.nombre_completo,
            email: advisor.email,
            telefono: advisor.telefono,
            whatsapp: advisor.whatsapp,
            foto: advisor.foto,
            cargo: advisor.cargo,
            bio: advisor.bio,
            redes_sociales: advisor.redes_sociales
          } : null,
          contact: contact ? {
            id: contact.id,
            nombre: contact.nombre,
            apellido: contact.apellido,
            nombre_completo: contact.nombre_completo,
            email: contact.email,
            telefono: contact.telefono
          } : null
        }
      }), { headers });
    }

    // POST /api/proposals/reaction - Agregar/quitar reacción
    if (method === 'POST' && action === 'reaction') {
      const body = await request.json();
      const { proposal_id, property_id, reaction_type, remove } = body;

      if (!proposal_id || !property_id || !reaction_type) {
        return new Response(JSON.stringify({
          success: false,
          error: 'proposal_id, property_id y reaction_type son requeridos'
        }), { status: 400, headers });
      }

      if (!['like', 'dislike', 'maybe'].includes(reaction_type)) {
        return new Response(JSON.stringify({
          success: false,
          error: 'reaction_type debe ser like, dislike o maybe'
        }), { status: 400, headers });
      }

      if (remove) {
        await removeReaction(proposal_id, property_id, reaction_type);
      } else {
        await addReaction(proposal_id, property_id, reaction_type);
      }

      // Obtener reacciones actualizadas
      const reactions = await getProposalReactions(proposal_id);

      return new Response(JSON.stringify({
        success: true,
        data: { reactions }
      }), { headers });
    }

    // POST /api/proposals/comment - Agregar comentario
    if (method === 'POST' && action === 'comment') {
      const body = await request.json();
      const { proposal_id, property_id, comment_text } = body;

      if (!proposal_id || !property_id || !comment_text) {
        return new Response(JSON.stringify({
          success: false,
          error: 'proposal_id, property_id y comment_text son requeridos'
        }), { status: 400, headers });
      }

      const comment = await addComment(proposal_id, property_id, comment_text);

      // Obtener reacciones actualizadas
      const reactions = await getProposalReactions(proposal_id);

      return new Response(JSON.stringify({
        success: true,
        data: { comment, reactions }
      }), { headers });
    }

    // DELETE /api/proposals/comment/:commentId - Eliminar comentario
    if (method === 'DELETE' && action === 'comment' && pathParts[3]) {
      const commentId = pathParts[3];

      const deleted = await deleteComment(commentId);

      return new Response(JSON.stringify({
        success: true,
        deleted
      }), { headers });
    }

    // GET /api/proposals/reactions/:proposalId - Obtener reacciones
    if (method === 'GET' && action === 'reactions' && pathParts[3]) {
      const proposalId = pathParts[3];
      const reactions = await getProposalReactions(proposalId);

      return new Response(JSON.stringify({
        success: true,
        data: reactions
      }), { headers });
    }

    // Ruta no encontrada
    return new Response(JSON.stringify({ success: false, error: 'Ruta no encontrada' }), {
      status: 404, headers
    });

  } catch (error) {
    console.error('[Proposals] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Error interno del servidor'
    }), { status: 500, headers });
  }
}

export default { handleProposals };
