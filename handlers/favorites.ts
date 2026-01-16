// api/handlers/favorites.ts
// Handler para sistema de favoritos con compartir y reacciones

import { getSQL } from '../lib/db';

// ============================================================================
// TIPOS
// ============================================================================

interface FavoritesList {
  device_id: string;
  owner_name?: string;
  property_ids: string[];
  created_at: string;
  updated_at: string;
}

interface Visitor {
  id: number;
  list_id: string;
  visitor_device_id: string;
  visitor_alias: string;
  joined_at: string;
  last_seen: string;
}

interface Reaction {
  id: number;
  list_id: string;
  property_id: string;
  visitor_device_id: string;
  visitor_alias: string;
  reaction_type: 'like' | 'dislike' | 'comment';
  comment_text?: string;
  created_at: string;
}

// ============================================================================
// FUNCIONES DE BASE DE DATOS
// ============================================================================

// Obtener o crear lista de favoritos por device_id
async function getOrCreateFavoritesList(deviceId: string): Promise<FavoritesList> {
  const sql = getSQL();

  // Intentar obtener existente
  const existing = await sql`
    SELECT * FROM device_favorites WHERE device_id = ${deviceId}
  `;

  if (existing.length > 0) {
    return existing[0] as FavoritesList;
  }

  // Crear nueva
  const created = await sql`
    INSERT INTO device_favorites (device_id, property_ids)
    VALUES (${deviceId}, '{}')
    RETURNING *
  `;

  return created[0] as FavoritesList;
}

// Obtener lista de favoritos (sin crear)
async function getFavoritesList(deviceId: string): Promise<FavoritesList | null> {
  const sql = getSQL();
  const result = await sql`
    SELECT * FROM device_favorites WHERE device_id = ${deviceId}
  `;
  return result[0] as FavoritesList || null;
}

// Actualizar lista de favoritos
async function updateFavorites(deviceId: string, propertyIds: string[], ownerName?: string): Promise<FavoritesList> {
  const sql = getSQL();

  const result = await sql`
    INSERT INTO device_favorites (device_id, property_ids, owner_name)
    VALUES (${deviceId}, ${propertyIds}, ${ownerName || null})
    ON CONFLICT (device_id)
    DO UPDATE SET
      property_ids = ${propertyIds},
      owner_name = COALESCE(${ownerName}, device_favorites.owner_name),
      updated_at = NOW()
    RETURNING *
  `;

  return result[0] as FavoritesList;
}

// Agregar propiedad a favoritos
async function addToFavorites(deviceId: string, propertyId: string): Promise<FavoritesList> {
  const sql = getSQL();

  const result = await sql`
    INSERT INTO device_favorites (device_id, property_ids)
    VALUES (${deviceId}, ARRAY[${propertyId}])
    ON CONFLICT (device_id)
    DO UPDATE SET
      property_ids = array_append(
        array_remove(device_favorites.property_ids, ${propertyId}),
        ${propertyId}
      ),
      updated_at = NOW()
    RETURNING *
  `;

  return result[0] as FavoritesList;
}

// Quitar propiedad de favoritos
async function removeFromFavorites(deviceId: string, propertyId: string): Promise<FavoritesList> {
  const sql = getSQL();

  const result = await sql`
    UPDATE device_favorites
    SET property_ids = array_remove(property_ids, ${propertyId}),
        updated_at = NOW()
    WHERE device_id = ${deviceId}
    RETURNING *
  `;

  return result[0] as FavoritesList;
}

// Registrar visitante en lista compartida
async function registerVisitor(listId: string, visitorDeviceId: string, alias: string): Promise<Visitor> {
  const sql = getSQL();

  const result = await sql`
    INSERT INTO favorite_visitors (list_id, visitor_device_id, visitor_alias)
    VALUES (${listId}, ${visitorDeviceId}, ${alias})
    ON CONFLICT (list_id, visitor_device_id)
    DO UPDATE SET
      visitor_alias = ${alias},
      last_seen = NOW()
    RETURNING *
  `;

  return result[0] as Visitor;
}

// Obtener visitantes de una lista
async function getVisitors(listId: string): Promise<Visitor[]> {
  const sql = getSQL();

  const result = await sql`
    SELECT * FROM favorite_visitors
    WHERE list_id = ${listId}
    ORDER BY joined_at DESC
  `;

  return result as Visitor[];
}

// Agregar reacción (like/dislike)
async function addReaction(
  listId: string,
  propertyId: string,
  visitorDeviceId: string,
  visitorAlias: string,
  reactionType: 'like' | 'dislike'
): Promise<Reaction> {
  const sql = getSQL();

  // Primero eliminar la reacción opuesta si existe
  const oppositeType = reactionType === 'like' ? 'dislike' : 'like';
  await sql`
    DELETE FROM favorite_reactions
    WHERE list_id = ${listId}
      AND property_id = ${propertyId}
      AND visitor_device_id = ${visitorDeviceId}
      AND reaction_type = ${oppositeType}
  `;

  // Insertar o actualizar la reacción
  const result = await sql`
    INSERT INTO favorite_reactions (list_id, property_id, visitor_device_id, visitor_alias, reaction_type)
    VALUES (${listId}, ${propertyId}, ${visitorDeviceId}, ${visitorAlias}, ${reactionType})
    ON CONFLICT (list_id, property_id, visitor_device_id, reaction_type)
    DO UPDATE SET
      visitor_alias = ${visitorAlias},
      created_at = NOW()
    RETURNING *
  `;

  return result[0] as Reaction;
}

// Quitar reacción
async function removeReaction(
  listId: string,
  propertyId: string,
  visitorDeviceId: string,
  reactionType: 'like' | 'dislike'
): Promise<boolean> {
  const sql = getSQL();

  const result = await sql`
    DELETE FROM favorite_reactions
    WHERE list_id = ${listId}
      AND property_id = ${propertyId}
      AND visitor_device_id = ${visitorDeviceId}
      AND reaction_type = ${reactionType}
    RETURNING id
  `;

  return result.length > 0;
}

// Agregar comentario
async function addComment(
  listId: string,
  propertyId: string,
  visitorDeviceId: string,
  visitorAlias: string,
  commentText: string
): Promise<Reaction> {
  const sql = getSQL();

  const result = await sql`
    INSERT INTO favorite_reactions (list_id, property_id, visitor_device_id, visitor_alias, reaction_type, comment_text)
    VALUES (${listId}, ${propertyId}, ${visitorDeviceId}, ${visitorAlias}, 'comment', ${commentText})
    RETURNING *
  `;

  return result[0] as Reaction;
}

// Eliminar comentario
async function deleteComment(commentId: number, visitorDeviceId: string): Promise<boolean> {
  const sql = getSQL();

  const result = await sql`
    DELETE FROM favorite_reactions
    WHERE id = ${commentId}
      AND visitor_device_id = ${visitorDeviceId}
      AND reaction_type = 'comment'
    RETURNING id
  `;

  return result.length > 0;
}

// Obtener todas las reacciones de una lista
async function getReactions(listId: string): Promise<Reaction[]> {
  const sql = getSQL();

  const result = await sql`
    SELECT * FROM favorite_reactions
    WHERE list_id = ${listId}
    ORDER BY created_at DESC
  `;

  return result as Reaction[];
}

// Obtener reacciones de una propiedad específica
async function getPropertyReactions(listId: string, propertyId: string): Promise<{
  likes: Reaction[];
  dislikes: Reaction[];
  comments: Reaction[];
}> {
  const sql = getSQL();

  const result = await sql`
    SELECT * FROM favorite_reactions
    WHERE list_id = ${listId} AND property_id = ${propertyId}
    ORDER BY created_at DESC
  `;

  const reactions = result as Reaction[];

  return {
    likes: reactions.filter(r => r.reaction_type === 'like'),
    dislikes: reactions.filter(r => r.reaction_type === 'dislike'),
    comments: reactions.filter(r => r.reaction_type === 'comment')
  };
}

// Obtener resumen de reacciones por propiedad
async function getReactionsSummary(listId: string): Promise<Record<string, {
  likes: number;
  dislikes: number;
  comments: number;
  likedBy: string[];
  dislikedBy: string[];
}>> {
  const sql = getSQL();

  const result = await sql`
    SELECT
      property_id,
      reaction_type,
      visitor_alias
    FROM favorite_reactions
    WHERE list_id = ${listId}
  `;

  const summary: Record<string, any> = {};

  for (const row of result) {
    const propId = row.property_id as string;
    if (!summary[propId]) {
      summary[propId] = { likes: 0, dislikes: 0, comments: 0, likedBy: [], dislikedBy: [] };
    }

    if (row.reaction_type === 'like') {
      summary[propId].likes++;
      summary[propId].likedBy.push(row.visitor_alias);
    } else if (row.reaction_type === 'dislike') {
      summary[propId].dislikes++;
      summary[propId].dislikedBy.push(row.visitor_alias);
    } else if (row.reaction_type === 'comment') {
      summary[propId].comments++;
    }
  }

  return summary;
}

// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================

export async function handleFavorites(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // Estructura: /api/favorites/[action]/[params]
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
    // GET /api/favorites/:deviceId - Obtener favoritos
    if (method === 'GET' && action && !pathParts[3]) {
      const deviceId = action;
      const list = await getFavoritesList(deviceId);

      if (!list) {
        return new Response(JSON.stringify({
          success: true,
          data: { device_id: deviceId, property_ids: [], visitors: [], reactions: {} }
        }), { headers });
      }

      // Obtener visitantes y reacciones
      const [visitors, reactionsSummary] = await Promise.all([
        getVisitors(deviceId),
        getReactionsSummary(deviceId)
      ]);

      return new Response(JSON.stringify({
        success: true,
        data: {
          ...list,
          visitors,
          reactions: reactionsSummary
        }
      }), { headers });
    }

    // GET /api/favorites/details/:deviceId - Obtener favoritos con detalles de propiedades
    if (method === 'GET' && action === 'details' && pathParts[3]) {
      const deviceId = pathParts[3];
      const list = await getFavoritesList(deviceId);

      if (!list || !list.property_ids || list.property_ids.length === 0) {
        return new Response(JSON.stringify({
          success: true,
          data: { device_id: deviceId, properties: [] }
        }), { headers });
      }

      // Obtener detalles de las propiedades desde la tabla propiedades
      const sql = getSQL();
      const properties = await sql`
        SELECT
          p.id,
          p.slug,
          p.codigo,
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
          p.created_at
        FROM propiedades p
        WHERE p.id::text = ANY(${list.property_ids})
          OR p.slug = ANY(${list.property_ids})
        ORDER BY p.created_at DESC
      `;

      // Formatear propiedades para el frontend
      const formattedProperties = properties.map((prop: any) => ({
        id: prop.id,
        slug: prop.slug,
        code: prop.codigo,
        title: prop.titulo,
        description: prop.short_description || prop.descripcion,
        type: prop.tipo,
        operation: prop.operacion,
        price: prop.precio_venta || prop.precio_alquiler || prop.precio,
        currency: prop.moneda || 'USD',
        city: prop.ciudad,
        sector: prop.sector,
        province: prop.provincia,
        bedrooms: prop.habitaciones,
        bathrooms: prop.banos,
        parking: prop.estacionamientos,
        builtArea: prop.m2_construccion,
        landArea: prop.m2_terreno,
        mainImage: prop.imagen_principal,
        images: prop.imagenes,
        isProject: prop.is_project,
        createdAt: prop.created_at,
        // Campos adicionales para compatibilidad con el frontend
        location: `${prop.sector || ''}, ${prop.ciudad || ''}`.replace(/^, |, $/g, ''),
        url: `/${prop.operacion === 'alquiler' ? 'alquilar' : 'comprar'}/${prop.slug}`
      }));

      return new Response(JSON.stringify({
        success: true,
        data: {
          device_id: deviceId,
          properties: formattedProperties
        }
      }), { headers });
    }

    // POST /api/favorites/sync - Sincronizar favoritos completos
    if (method === 'POST' && action === 'sync') {
      const body = await request.json();
      const { device_id, property_ids, owner_name } = body;

      if (!device_id) {
        return new Response(JSON.stringify({ success: false, error: 'device_id requerido' }), {
          status: 400, headers
        });
      }

      const list = await updateFavorites(device_id, property_ids || [], owner_name);

      return new Response(JSON.stringify({ success: true, data: list }), { headers });
    }

    // POST /api/favorites/add - Agregar a favoritos
    if (method === 'POST' && action === 'add') {
      const body = await request.json();
      const { device_id, property_id } = body;

      if (!device_id || !property_id) {
        return new Response(JSON.stringify({ success: false, error: 'device_id y property_id requeridos' }), {
          status: 400, headers
        });
      }

      const list = await addToFavorites(device_id, property_id);

      return new Response(JSON.stringify({ success: true, data: list }), { headers });
    }

    // POST /api/favorites/remove - Quitar de favoritos
    if (method === 'POST' && action === 'remove') {
      const body = await request.json();
      const { device_id, property_id } = body;

      if (!device_id || !property_id) {
        return new Response(JSON.stringify({ success: false, error: 'device_id y property_id requeridos' }), {
          status: 400, headers
        });
      }

      const list = await removeFromFavorites(device_id, property_id);

      return new Response(JSON.stringify({ success: true, data: list }), { headers });
    }

    // POST /api/favorites/visitor - Registrar visitante
    if (method === 'POST' && action === 'visitor') {
      const body = await request.json();
      const { list_id, visitor_device_id, alias } = body;

      if (!list_id || !visitor_device_id || !alias) {
        return new Response(JSON.stringify({ success: false, error: 'list_id, visitor_device_id y alias requeridos' }), {
          status: 400, headers
        });
      }

      const visitor = await registerVisitor(list_id, visitor_device_id, alias);

      return new Response(JSON.stringify({ success: true, data: visitor }), { headers });
    }

    // GET /api/favorites/visitors/:listId - Obtener visitantes
    if (method === 'GET' && action === 'visitors' && pathParts[3]) {
      const listId = pathParts[3];
      const visitors = await getVisitors(listId);

      return new Response(JSON.stringify({ success: true, data: visitors }), { headers });
    }

    // POST /api/favorites/reaction - Agregar like/dislike
    if (method === 'POST' && action === 'reaction') {
      const body = await request.json();
      const { list_id, property_id, visitor_device_id, visitor_alias, reaction_type } = body;

      if (!list_id || !property_id || !visitor_device_id || !visitor_alias || !reaction_type) {
        return new Response(JSON.stringify({ success: false, error: 'Todos los campos son requeridos' }), {
          status: 400, headers
        });
      }

      if (reaction_type !== 'like' && reaction_type !== 'dislike') {
        return new Response(JSON.stringify({ success: false, error: 'reaction_type debe ser like o dislike' }), {
          status: 400, headers
        });
      }

      const reaction = await addReaction(list_id, property_id, visitor_device_id, visitor_alias, reaction_type);

      return new Response(JSON.stringify({ success: true, data: reaction }), { headers });
    }

    // DELETE /api/favorites/reaction - Quitar like/dislike
    if (method === 'DELETE' && action === 'reaction') {
      const body = await request.json();
      const { list_id, property_id, visitor_device_id, reaction_type } = body;

      if (!list_id || !property_id || !visitor_device_id || !reaction_type) {
        return new Response(JSON.stringify({ success: false, error: 'Todos los campos son requeridos' }), {
          status: 400, headers
        });
      }

      const removed = await removeReaction(list_id, property_id, visitor_device_id, reaction_type);

      return new Response(JSON.stringify({ success: true, removed }), { headers });
    }

    // POST /api/favorites/comment - Agregar comentario
    if (method === 'POST' && action === 'comment') {
      const body = await request.json();
      const { list_id, property_id, visitor_device_id, visitor_alias, comment_text } = body;

      if (!list_id || !property_id || !visitor_device_id || !visitor_alias || !comment_text) {
        return new Response(JSON.stringify({ success: false, error: 'Todos los campos son requeridos' }), {
          status: 400, headers
        });
      }

      const comment = await addComment(list_id, property_id, visitor_device_id, visitor_alias, comment_text);

      return new Response(JSON.stringify({ success: true, data: comment }), { headers });
    }

    // DELETE /api/favorites/comment/:id - Eliminar comentario
    if (method === 'DELETE' && action === 'comment' && pathParts[3]) {
      const commentId = parseInt(pathParts[3]);
      const visitorDeviceId = url.searchParams.get('visitor_device_id');

      if (!visitorDeviceId) {
        return new Response(JSON.stringify({ success: false, error: 'visitor_device_id requerido' }), {
          status: 400, headers
        });
      }

      const deleted = await deleteComment(commentId, visitorDeviceId);

      return new Response(JSON.stringify({ success: true, deleted }), { headers });
    }

    // GET /api/favorites/reactions/:listId - Obtener todas las reacciones
    if (method === 'GET' && action === 'reactions' && pathParts[3]) {
      const listId = pathParts[3];
      const propertyId = url.searchParams.get('property_id');

      if (propertyId) {
        const reactions = await getPropertyReactions(listId, propertyId);
        return new Response(JSON.stringify({ success: true, data: reactions }), { headers });
      }

      const reactions = await getReactions(listId);
      return new Response(JSON.stringify({ success: true, data: reactions }), { headers });
    }

    // GET /api/favorites/summary/:listId - Obtener resumen de reacciones
    if (method === 'GET' && action === 'summary' && pathParts[3]) {
      const listId = pathParts[3];
      const summary = await getReactionsSummary(listId);

      return new Response(JSON.stringify({ success: true, data: summary }), { headers });
    }

    // Ruta no encontrada
    return new Response(JSON.stringify({ success: false, error: 'Ruta no encontrada' }), {
      status: 404, headers
    });

  } catch (error) {
    console.error('[Favorites] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Error interno del servidor'
    }), { status: 500, headers });
  }
}

export default { handleFavorites };
