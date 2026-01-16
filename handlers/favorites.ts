// api/handlers/favorites.ts
// Handler para sistema de favoritos con compartir y reacciones

import { getSQL } from '../lib/db';

// ============================================================================
// TIPOS
// ============================================================================

interface FavoritesList {
  device_id: string;
  public_code?: string;
  owner_name?: string;
  owner_email?: string;
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

// Generar código público único (CLIC-XXXX)
async function generatePublicCode(): Promise<string> {
  const sql = getSQL();
  let code: string;
  let attempts = 0;

  do {
    const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    code = `CLIC-${randomNum}`;

    // Verificar que no existe
    const existing = await sql`
      SELECT 1 FROM device_favorites WHERE public_code = ${code}
    `;

    if (existing.length === 0) {
      return code;
    }
    attempts++;
  } while (attempts < 10);

  // Si después de 10 intentos no encontramos uno único, usar timestamp
  return `CLIC-${Date.now().toString().slice(-6)}`;
}

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

  // Generar código público para nueva lista
  const publicCode = await generatePublicCode();

  // Crear nueva
  const created = await sql`
    INSERT INTO device_favorites (device_id, public_code, property_ids)
    VALUES (${deviceId}, ${publicCode}, '{}')
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
async function addToFavorites(deviceId: string, propertyId: string): Promise<{ list: FavoritesList; isNewList: boolean }> {
  const sql = getSQL();

  // Verificar si ya existe la lista
  const existing = await sql`SELECT 1 FROM device_favorites WHERE device_id = ${deviceId}`;
  const isNewList = existing.length === 0;

  // Si es nueva lista, generar código público
  let publicCode: string | null = null;
  if (isNewList) {
    publicCode = await generatePublicCode();
  }

  const result = await sql`
    INSERT INTO device_favorites (device_id, property_ids, public_code)
    VALUES (${deviceId}, ARRAY[${propertyId}], ${publicCode})
    ON CONFLICT (device_id)
    DO UPDATE SET
      property_ids = array_append(
        array_remove(device_favorites.property_ids, ${propertyId}),
        ${propertyId}
      ),
      updated_at = NOW()
    RETURNING *
  `;

  return { list: result[0] as FavoritesList, isNewList };
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

// Vincular email a una lista de favoritos
async function linkEmail(deviceId: string, email: string, ownerName?: string): Promise<FavoritesList> {
  const sql = getSQL();

  const result = await sql`
    UPDATE device_favorites
    SET owner_email = ${email.toLowerCase()},
        owner_name = COALESCE(${ownerName || null}, owner_name),
        updated_at = NOW()
    WHERE device_id = ${deviceId}
    RETURNING *
  `;

  if (result.length === 0) {
    throw new Error('Lista no encontrada');
  }

  return result[0] as FavoritesList;
}

// Buscar lista por email (para recuperación)
async function findByEmail(email: string): Promise<FavoritesList | null> {
  const sql = getSQL();

  const result = await sql`
    SELECT * FROM device_favorites
    WHERE owner_email = ${email.toLowerCase()}
    ORDER BY updated_at DESC
    LIMIT 1
  `;

  return result[0] as FavoritesList || null;
}

// Buscar lista por código público
async function findByPublicCode(publicCode: string): Promise<FavoritesList | null> {
  const sql = getSQL();

  const result = await sql`
    SELECT * FROM device_favorites
    WHERE public_code = ${publicCode.toUpperCase()}
  `;

  return result[0] as FavoritesList || null;
}

// Transferir favoritos de una lista a otra (para recuperación)
async function transferFavorites(fromDeviceId: string, toDeviceId: string): Promise<FavoritesList> {
  const sql = getSQL();

  // Obtener lista origen
  const fromList = await getFavoritesList(fromDeviceId);
  if (!fromList) {
    throw new Error('Lista origen no encontrada');
  }

  // Obtener o crear lista destino
  const toList = await getOrCreateFavoritesList(toDeviceId);

  // Combinar property_ids sin duplicados
  const combinedIds = [...new Set([...toList.property_ids, ...fromList.property_ids])];

  // Actualizar lista destino
  const result = await sql`
    UPDATE device_favorites
    SET property_ids = ${combinedIds},
        owner_name = COALESCE(${fromList.owner_name}, device_favorites.owner_name),
        owner_email = COALESCE(${fromList.owner_email}, device_favorites.owner_email),
        updated_at = NOW()
    WHERE device_id = ${toDeviceId}
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
  likes: { visitor_device_id: string; visitor_alias: string }[];
  dislikes: { visitor_device_id: string; visitor_alias: string }[];
  comments: { visitor_device_id: string; visitor_alias: string; comment_text: string; created_at: string }[];
}>> {
  const sql = getSQL();

  const result = await sql`
    SELECT
      property_id,
      reaction_type,
      visitor_device_id,
      visitor_alias,
      comment_text,
      created_at
    FROM favorite_reactions
    WHERE list_id = ${listId}
    ORDER BY created_at DESC
  `;

  const summary: Record<string, any> = {};

  for (const row of result) {
    const propId = row.property_id as string;
    if (!summary[propId]) {
      summary[propId] = { likes: [], dislikes: [], comments: [] };
    }

    const reactionInfo = {
      visitor_device_id: row.visitor_device_id,
      visitor_alias: row.visitor_alias
    };

    if (row.reaction_type === 'like') {
      summary[propId].likes.push(reactionInfo);
    } else if (row.reaction_type === 'dislike') {
      summary[propId].dislikes.push(reactionInfo);
    } else if (row.reaction_type === 'comment') {
      summary[propId].comments.push({
        ...reactionInfo,
        comment_text: row.comment_text,
        created_at: row.created_at
      });
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
          p.created_at
        FROM propiedades p
        WHERE p.id::text = ANY(${list.property_ids})
          OR p.slug = ANY(${list.property_ids})
        ORDER BY p.created_at DESC
      `;

      // Formatear propiedades para el frontend (nombres compatibles con FavoritesLayout)
      const formattedProperties = properties.map((prop: any) => {
        // Formatear precio
        const precio = prop.precio_venta || prop.precio_alquiler || prop.precio || 0;
        const moneda = prop.moneda || 'USD';
        const precioFormateado = precio > 0
          ? `${moneda === 'USD' ? 'US$' : 'RD$'}${precio.toLocaleString()}`
          : 'Precio a consultar';

        return {
          // Identificadores
          id: prop.id,
          slug: prop.slug,
          code: prop.codigo_publico,

          // Campos que espera FavoritesLayout
          titulo: prop.titulo,
          name: prop.titulo,
          tipo: prop.tipo,
          sector: prop.sector,
          ciudad: prop.ciudad,
          provincia: prop.provincia,

          // Precio formateado como espera el frontend
          precio: precioFormateado,
          precios: {
            venta: prop.precio_venta ? {
              valor: prop.precio_venta,
              formateado: `${moneda === 'USD' ? 'US$' : 'RD$'}${prop.precio_venta.toLocaleString()}`
            } : null,
            alquiler: prop.precio_alquiler ? {
              valor: prop.precio_alquiler,
              formateado: `${moneda === 'USD' ? 'US$' : 'RD$'}${prop.precio_alquiler.toLocaleString()}`
            } : null
          },

          // Características
          habitaciones: prop.habitaciones || 0,
          banos: prop.banos || 0,
          estacionamientos: prop.estacionamientos || 0,
          metros: prop.m2_construccion || 0,
          metros_construidos: prop.m2_construccion || 0,
          metros_terreno: prop.m2_terreno || 0,

          // Imágenes
          imagen: prop.imagen_principal,
          imagenes: prop.imagenes || [],

          // Metadatos
          is_project: prop.is_project || false,
          operacion: prop.operacion,
          estado: 'disponible',

          // URL de la propiedad
          url: `/${prop.operacion === 'alquiler' ? 'alquilar' : 'comprar'}/${prop.slug}`,

          // Fecha de creación
          created_at: prop.created_at
        };
      });

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

      const { list, isNewList } = await addToFavorites(device_id, property_id);

      return new Response(JSON.stringify({
        success: true,
        data: list,
        isNewList,  // El frontend puede usar esto para mostrar el modal de bienvenida
        message: isNewList
          ? 'Lista de favoritos creada. Vincula tu email para no perderla.'
          : 'Propiedad agregada a favoritos'
      }), { headers });
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

    // POST /api/favorites/link-email - Vincular email a una lista
    if (method === 'POST' && action === 'link-email') {
      const body = await request.json();
      const { device_id, email, owner_name } = body;

      if (!device_id || !email) {
        return new Response(JSON.stringify({ success: false, error: 'device_id y email son requeridos' }), {
          status: 400, headers
        });
      }

      // Validar formato de email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return new Response(JSON.stringify({ success: false, error: 'Formato de email inválido' }), {
          status: 400, headers
        });
      }

      // Verificar si el email ya está vinculado a otra lista
      const existingList = await findByEmail(email);
      if (existingList && existingList.device_id !== device_id) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Este email ya está vinculado a otra lista de favoritos',
          existing_list: {
            public_code: existingList.public_code,
            property_count: existingList.property_ids?.length || 0
          }
        }), { status: 409, headers });
      }

      const list = await linkEmail(device_id, email, owner_name);

      return new Response(JSON.stringify({
        success: true,
        data: list,
        message: 'Email vinculado correctamente'
      }), { headers });
    }

    // POST /api/favorites/recover - Recuperar lista por email o código público
    if (method === 'POST' && action === 'recover') {
      const body = await request.json();
      const { current_device_id, email, public_code } = body;

      if (!current_device_id) {
        return new Response(JSON.stringify({ success: false, error: 'current_device_id es requerido' }), {
          status: 400, headers
        });
      }

      if (!email && !public_code) {
        return new Response(JSON.stringify({ success: false, error: 'email o public_code es requerido' }), {
          status: 400, headers
        });
      }

      // Buscar la lista a recuperar
      let listToRecover: FavoritesList | null = null;

      if (email) {
        listToRecover = await findByEmail(email);
      } else if (public_code) {
        listToRecover = await findByPublicCode(public_code);
      }

      if (!listToRecover) {
        return new Response(JSON.stringify({
          success: false,
          error: email
            ? 'No se encontró ninguna lista vinculada a este email'
            : 'Código de lista no encontrado'
        }), { status: 404, headers });
      }

      // Si la lista encontrada es del mismo dispositivo, solo retornarla
      if (listToRecover.device_id === current_device_id) {
        return new Response(JSON.stringify({
          success: true,
          data: listToRecover,
          message: 'Ya tienes acceso a esta lista'
        }), { headers });
      }

      // Transferir favoritos a la lista actual
      const mergedList = await transferFavorites(listToRecover.device_id, current_device_id);

      return new Response(JSON.stringify({
        success: true,
        data: mergedList,
        recovered_from: {
          device_id: listToRecover.device_id,
          public_code: listToRecover.public_code,
          property_count: listToRecover.property_ids?.length || 0
        },
        message: 'Lista recuperada y fusionada correctamente'
      }), { headers });
    }

    // GET /api/favorites/find-by-email/:email - Buscar lista por email (sin transferir)
    if (method === 'GET' && action === 'find-by-email' && pathParts[3]) {
      const email = decodeURIComponent(pathParts[3]);

      const list = await findByEmail(email);

      if (!list) {
        return new Response(JSON.stringify({
          success: false,
          error: 'No se encontró ninguna lista vinculada a este email'
        }), { status: 404, headers });
      }

      // Retornar solo información pública (no el device_id completo)
      return new Response(JSON.stringify({
        success: true,
        data: {
          public_code: list.public_code,
          owner_name: list.owner_name,
          property_count: list.property_ids?.length || 0,
          created_at: list.created_at
        }
      }), { headers });
    }

    // GET /api/favorites/find-by-code/:code - Buscar lista por código público
    if (method === 'GET' && action === 'find-by-code' && pathParts[3]) {
      const publicCode = pathParts[3].toUpperCase();

      const list = await findByPublicCode(publicCode);

      if (!list) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Código de lista no encontrado'
        }), { status: 404, headers });
      }

      // Retornar información pública
      return new Response(JSON.stringify({
        success: true,
        data: {
          public_code: list.public_code,
          owner_name: list.owner_name,
          property_count: list.property_ids?.length || 0,
          created_at: list.created_at
        }
      }), { headers });
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
