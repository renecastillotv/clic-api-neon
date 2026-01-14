# Plan de Migración: API Videos de Supabase a Neon

## Estado Actual

### Problema Identificado
- El frontend Astro espera datos de videos con estructura específica
- La API de Supabase devuelve `pageType: "property-list"` para videos (NO es una entidad separada)
- En Neon, creé datos hardcodeados con `pageType: "videos-main"` que NO coincide con lo que Supabase devuelve
- **Los videos en Supabase son en realidad propiedades/proyectos taggeados como "videos"**

---

## ANÁLISIS DETALLADO

### 1. Frontend - Qué Esperan los Layouts

#### 1.1 VideosMainLayout.astro (Página Principal `/videos`)
**Campos requeridos en `data`:**
```typescript
{
  language: string;
  featuredVideos: Video[];      // Videos destacados
  recentVideos: Video[];        // Videos recientes
  categories: Category[];       // Categorías con conteo
  stats: {
    totalVideos: number;
    totalCategories: number;
    totalViews: number;
  };
  seo: SEOData;
  globalConfig: object;
}
```

**Estructura de cada Video:**
```typescript
{
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  slug: string;
  videoSlug: string;
  duration: string;             // Ej: "10:30"
  publishedAt: string;          // ISO date
  views: number;
  featured: boolean;
  url: string;
  author: {
    name: string;
    avatar: string;
    slug: string;
    position: string;
  };
  category: {
    id: string;
    name: string;
    slug: string;
  };
}
```

**Estructura de cada Categoría:**
```typescript
{
  id: string;
  name: string;
  slug: string;                 // Mapea a iconos FA: lanzamientos, recorridos, decoracion, etc.
  url: string;
  videoCount: number;
  featured: boolean;
}
```

#### 1.2 VideosCategoryLayout.astro (Página de Categoría `/videos/{categoria}`)
**Campos requeridos:**
```typescript
{
  language: string;
  category: {
    slug: string;
    name: string;
    description: string;
  };
  videos: Video[];              // Misma estructura que arriba
  seo: SEOData;
  globalConfig: object;
}
```

**Funcionalidades client-side:**
- Búsqueda por título
- Ordenamiento: reciente, más vistas, más antiguo
- Paginación: 12 videos por página

#### 1.3 VideosSingleLayout.astro (Página Individual `/videos/{categoria}/{slug}`)
**Campos requeridos:**
```typescript
{
  language: string;
  video: {
    id: string;
    title: string;
    subtitle?: string;
    description: string;        // HTML permitido
    thumbnail: string;
    videoId: string;            // ID de YouTube para embed
    platform: string;           // 'youtube'
    duration: string;
    publishedAt: string;
    views: number;
    url: string;
    author: {
      name: string;
      avatar: string;
      position: string;
      bio?: string;
      whatsapp?: string;
      email?: string;
    };
  };
  category: {
    id: string;
    name: string;
    slug: string;
  };
  crossContent?: {
    videos?: Video[];           // Máx 4
    articles?: Article[];       // Máx 6
    properties?: Property[];    // Máx 8
    testimonials?: Testimonial[]; // Máx 6
  };
  seo: SEOData;
}
```

---

### 2. API Supabase - Qué Devuelve Actualmente

**IMPORTANTE:** Supabase NO tiene endpoint de videos separado. Los "videos" son **propiedades/proyectos etiquetados**.

#### 2.1 Endpoint `/backend/videos` devuelve:
```json
{
  "pageType": "property-list",
  "totalProperties": 571,
  "properties": [...],
  "videos": [
    {
      "id": "uuid",
      "content_type": "video",
      "title": "Recorrido Villa Oceánica en Cap Cana",
      "author": {
        "name": "René Castillo",
        "avatar": "https://...",
        "slug": "rene-castillo",
        "position": "Agente Inmobiliario"
      },
      "category": "Recorridos",
      "description": "Tour completo...",
      "thumbnail": "https://img.youtube.com/vi/example1/maxresdefault.jpg",
      "video_slug": "videos/proyectos/recorrido-villa-oceanica-cap-cana",
      "videoSlug": "videos/proyectos/recorrido-villa-oceanica-cap-cana",
      "duration": "8:45",
      "views": 9,
      "publishedAt": "2025-06-20T00:02:56.197089+00:00",
      "featured": false,
      "url": "/videos/proyectos/recorrido-villa-oceanica-cap-cana",
      "slug": "videos/proyectos/recorrido-villa-oceanica-cap-cana"
    }
  ],
  "seo": {...},
  "globalConfig": {...},
  "country": {...}
}
```

---

### 3. Base de Datos Neon - Qué Tenemos

#### 3.1 Tablas Existentes
- `tenants` - Configuración multi-tenant
- `propiedades` - Propiedades inmobiliarias
- `perfiles_asesor` + `usuarios` - Asesores
- `testimonios` - Testimonios
- `faqs` - Preguntas frecuentes
- `ubicaciones` - Ubicaciones geográficas
- `categorias` - Categorías de propiedades

#### 3.2 Tablas que NO Existen
- ❌ `videos` - No existe
- ❌ `articulos` - No existe
- ❌ `video_categorias` - No existe

---

## PLAN DE TRABAJO

### Fase 1: Decisión Arquitectónica

**Opción A: Crear tablas de videos en Neon**
- Crear tabla `videos` y `video_categorias`
- Migrar datos de Supabase
- Crear funciones en db.ts
- Crear handler completo

**Opción B: Usar datos hardcodeados (temporal)**
- Mantener videos como datos estáticos en código
- Mapear estructura correctamente
- Funcional pero no escalable

**Opción C: Sincronizar con CRM existente**
- Si el CRM ya tiene videos, conectar a esa fuente
- Crear queries para leer esos datos

**RECOMENDACIÓN:** Opción A para producción, pero primero validar si existe data en el CRM.

---

### Fase 2: Mapeo de Campos (Compatibilidad)

#### Videos Main Page (`/videos`)
| Frontend Espera | Supabase Devuelve | Neon Debe Devolver |
|-----------------|-------------------|-------------------|
| `featuredVideos` | `videos.filter(featured)` | Query con `destacado=true` |
| `recentVideos` | `videos` ordenado | Query con `ORDER BY created_at DESC` |
| `categories` | Extraído de videos | Query a `video_categorias` |
| `stats.totalVideos` | `videos.length` | `COUNT(*)` |
| `stats.totalViews` | `SUM(views)` | `SUM(vistas)` |

#### Video Individual
| Frontend Espera | Supabase Devuelve | Neon Debe Devolver |
|-----------------|-------------------|-------------------|
| `video.videoId` | Extraído de URL | Campo `youtube_id` |
| `video.author` | Objeto completo | JOIN con `perfiles_asesor` |
| `crossContent.videos` | Videos relacionados | Query con misma categoría |
| `crossContent.properties` | Propiedades relacionadas | Query a `propiedades` |

---

### Fase 3: Tareas de Implementación

#### 3.1 Si se crean tablas nuevas:

**Tarea 1: Crear estructura de BD**
```sql
-- Categorías de videos
CREATE TABLE video_categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  slug VARCHAR(100) UNIQUE NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  nombre_en VARCHAR(255),
  nombre_fr VARCHAR(255),
  descripcion TEXT,
  icono VARCHAR(50),           -- fa-rocket, fa-video, etc.
  destacada BOOLEAN DEFAULT false,
  orden INT DEFAULT 0,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Videos
CREATE TABLE videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  categoria_id UUID REFERENCES video_categorias(id),
  autor_id UUID REFERENCES perfiles_asesor(id),

  slug VARCHAR(255) UNIQUE NOT NULL,
  titulo VARCHAR(500) NOT NULL,
  titulo_en VARCHAR(500),
  titulo_fr VARCHAR(500),
  descripcion TEXT,
  descripcion_en TEXT,
  descripcion_fr TEXT,

  youtube_id VARCHAR(50),
  youtube_url VARCHAR(500),
  thumbnail_url VARCHAR(500),
  duracion VARCHAR(10),        -- "10:30"

  vistas INT DEFAULT 0,
  destacado BOOLEAN DEFAULT false,
  publicado BOOLEAN DEFAULT true,
  fecha_publicacion TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Tarea 2: Funciones en db.ts**
- `getVideos(tenantId, limit, featured?)` - Lista de videos
- `getVideoBySlug(slug, tenantId)` - Video individual
- `getVideoCategories(tenantId)` - Categorías
- `getVideosByCategory(categorySlug, tenantId)` - Videos por categoría
- `getRelatedVideos(videoId, limit)` - Videos relacionados

**Tarea 3: Handler de videos**
- Crear `handlers/videos.ts` con:
  - `handleVideosList()` - Página principal
  - `handleVideosCategory()` - Página de categoría
  - `handleVideoSingle()` - Página individual

**Tarea 4: Routing en api/index.ts**
- Agregar casos para:
  - `/videos` → `handleVideosList`
  - `/videos/{categoria}` → `handleVideosCategory`
  - `/videos/{categoria}/{slug}` → `handleVideoSingle`

**Tarea 5: Migración de datos**
- Script para importar videos de Supabase
- O: Ingresar datos desde CRM

---

### Fase 4: PageTypes Correctos

Para que el frontend seleccione el layout correcto:

| Ruta | PageType Esperado |
|------|-------------------|
| `/videos` | `videos-main` |
| `/videos/{categoria}` | `videos-category` |
| `/videos/{categoria}/{slug}` | `videos-single` |

Verificar en `[...slug].astro`:
```javascript
const showVideosMain = pageType === 'videos-main';
const showVideosCategory = pageType === 'videos-category';
const showVideosSingle = pageType === 'videos-single';
```

---

## ARCHIVOS A MODIFICAR/CREAR

### En clic-api-neon:
1. `lib/db.ts` - Agregar funciones de videos
2. `handlers/videos.ts` - CREAR nuevo handler
3. `api/index.ts` - Agregar routing
4. `types.ts` - Actualizar tipos si necesario

### Migraciones SQL:
1. `migrations/001_video_categorias.sql`
2. `migrations/002_videos.sql`

### NO modificar en frontend:
- Los layouts de Astro ya están listos
- Solo asegurar que la API devuelva la estructura correcta

---

## PRIORIDAD DE ENDPOINTS

1. **ALTA** - `/videos` (página principal)
2. **MEDIA** - `/videos/{categoria}` (categorías)
3. **BAJA** - `/videos/{categoria}/{slug}` (individual)

---

## PRÓXIMOS PASOS INMEDIATOS

1. [ ] Confirmar si hay tabla de videos en el CRM/Neon
2. [ ] Decidir entre Opción A, B o C
3. [ ] Si Opción A: Crear tablas SQL
4. [ ] Crear handler de videos
5. [ ] Probar endpoint principal
6. [ ] Probar categorías
7. [ ] Probar página individual

---

## NOTAS IMPORTANTES

1. **Supabase usa propiedades como videos** - Los videos no son entidad separada
2. **Frontend ya tiene validación defensiva** - Usa `safeGet`, `safeArray`, etc.
3. **Multiidioma** - Campos deben soportar es/en/fr
4. **YouTube embed** - Necesita `videoId` para funcionar
5. **Iconos por categoría** - El frontend mapea slugs a iconos Font Awesome

---

*Documento creado: 2026-01-14*
*Última actualización: Pendiente*
