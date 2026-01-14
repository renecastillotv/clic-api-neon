# Documentación de Layouts de Videos - Frontend Astro

Este documento detalla cada layout de videos, sus componentes visuales y los datos que requiere cada uno.

---

## 1. VideosMainLayout.astro

**Ruta:** `/videos`
**Archivo:** `src/layouts/VideosMainLayout.astro`
**PageType esperado:** `videos-main`

### Componentes Visuales

| # | Componente | Descripción |
|---|------------|-------------|
| 1 | **Hero Section** | Header oscuro con gradiente, título, subtítulo y estadísticas |
| 2 | **Breadcrumbs** | Navegación: Inicio > Videos |
| 3 | **Stats Bar** | Muestra: Total Videos, Total Vistas, Total Categorías |
| 4 | **Categories Pills** | Botones de categorías con iconos Font Awesome |
| 5 | **Hero Video** | Video destacado principal con thumbnail grande |
| 6 | **Videos Grid** | Grid de hasta 11 videos en tarjetas |
| 7 | **CTA Section** | Call-to-action para suscribirse a YouTube |

### Datos Requeridos en `data`

```typescript
{
  // OBLIGATORIO
  language: string;                    // 'es' | 'en' | 'fr'

  // ARRAYS DE VIDEOS
  featuredVideos: Video[];             // Videos destacados (featured=true)
  recentVideos: Video[];               // Todos los videos ordenados por fecha

  // CATEGORÍAS
  categories: Category[];              // Lista de categorías

  // ESTADÍSTICAS (opcional, se calculan si no vienen)
  stats?: {
    totalVideos: number;
    totalCategories: number;
    totalViews: number;
  };

  // SEO
  seo?: {
    title: string;
    description: string;
    h1: string;
    h2: string;
    canonical_url: string;
    ogImage: string;
    hreflang: Record<string, string>;
    breadcrumbs: Breadcrumb[];
  };

  // CONFIG GLOBAL
  globalConfig?: object;
  trackingString?: string;
}
```

### Estructura de Video

```typescript
interface Video {
  id: string;                          // ID único
  title: string;                       // Título del video
  description: string;                 // Descripción (puede tener HTML)
  thumbnail: string;                   // URL de imagen miniatura
  slug: string;                        // Slug para URL
  videoSlug?: string;                  // Slug completo con categoría
  duration: string;                    // Formato "10:30"
  publishedAt: string;                 // ISO 8601: "2025-01-10T12:00:00Z"
  views: number;                       // Número de visualizaciones
  featured: boolean;                   // Si es destacado
  url: string;                         // URL completa del video

  author: {
    name: string;                      // Nombre del autor
    avatar: string;                    // URL del avatar
    slug: string;                      // Slug del perfil
    position: string;                  // Cargo: "Fundador", "Asesor", etc.
  };

  category?: {
    id: string;
    name: string;                      // "Lanzamientos", "Recorridos", etc.
    slug: string;                      // "lanzamientos", "recorridos", etc.
  };
}
```

### Estructura de Categoría

```typescript
interface Category {
  id: string;
  name: string;                        // Nombre visible
  slug: string;                        // Slug para URL y mapeo de icono
  url: string;                         // URL completa: "/videos/lanzamientos"
  videoCount: number;                  // Cantidad de videos
  featured: boolean;                   // Si mostrar destacada
}
```

### Mapeo de Iconos por Slug

```javascript
{
  'lanzamientos': 'fa-rocket',
  'consejos': 'fa-lightbulb',
  'diseno-y-decoracion': 'fa-palette',
  'la-casa-de-los-famosos': 'fa-star',
  'entrevistas': 'fa-microphone',
  'recorridos': 'fa-video'
}
// Default: 'fa-play-circle'
```

### Valores por Defecto

| Campo | Valor Default |
|-------|---------------|
| `video.thumbnail` | `https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=800&h=600&fit=crop` |
| `video.duration` | `'0:00'` |
| `video.views` | `0` |
| `video.author.name` | `'Equipo CLIC'` |
| `video.author.avatar` | `'/images/team/clic-experts.jpg'` |
| `video.author.position` | `'Especialista Inmobiliario'` |

---

## 2. VideosCategoryLayout.astro

**Ruta:** `/videos/{categoria}`
**Archivo:** `src/layouts/VideosCategoryLayout.astro`
**PageType esperado:** `videos-category`

### Componentes Visuales

| # | Componente | Descripción |
|---|------------|-------------|
| 1 | **Hero Section** | Header con icono de categoría, título y descripción |
| 2 | **Breadcrumbs** | Navegación: Inicio > Videos > {Categoría} |
| 3 | **Stats** | Contador de videos en la categoría |
| 4 | **Search Box** | Buscador de videos (si hay más de 3) |
| 5 | **Sort Dropdown** | Ordenar por: Más recientes, Más vistos, Más antiguos |
| 6 | **Videos Grid** | Grid de videos con paginación |
| 7 | **Pagination** | Paginación client-side (12 por página) |
| 8 | **Empty State** | Estado vacío si no hay videos |

### Datos Requeridos en `data`

```typescript
{
  // OBLIGATORIO
  language: string;                    // 'es' | 'en' | 'fr'

  // CATEGORÍA
  category?: {
    slug: string;                      // "lanzamientos"
    name: string;                      // "Lanzamientos"
    description: string;               // Descripción de la categoría
    id?: string;
    url?: string;
  };
  // Alternativas si no viene category:
  categorySlug?: string;
  title?: string;
  description?: string;
  slug?: string;

  // VIDEOS
  videos: Video[];                     // Array de videos de la categoría

  // SEO
  seo?: {
    title: string;
    description: string;
    hreflang: Record<string, string>;
    breadcrumbs: Breadcrumb[];
    ogImage: string;
    canonical_url: string;
    keywords: string;
  };

  // CONFIG GLOBAL
  globalConfig?: object;
  trackingString?: string;
}
```

### Estructura de Video (igual que VideosMainLayout)

```typescript
interface Video {
  id: string;
  slug: string;
  title: string;
  description: string;                 // Se trunca a 100 caracteres
  thumbnail: string;
  duration: string;
  publishedAt: string;                 // IMPORTANTE: usado para ordenar
  views: number;                       // IMPORTANTE: usado para ordenar
  featured: boolean;
  url: string;

  author: {
    name: string;
    avatar: string;
    position?: string;
  };
}
```

### Data Attributes en Tarjetas (para JS)

Cada tarjeta de video tiene estos atributos para búsqueda/ordenamiento:

```html
<article
  data-published="{video.publishedAt}"      <!-- ISO date para ordenar -->
  data-views="{video.views}"                <!-- número para ordenar -->
  data-video-title="{video.title.toLowerCase()}"  <!-- para búsqueda -->
>
```

### Configuración de Paginación

```javascript
const ITEMS_PER_PAGE = 12;
```

### Categorías Predefinidas con Descripciones

| Slug | Título (ES) | Icono |
|------|-------------|-------|
| `lanzamientos` | Lanzamientos | `fa-rocket` |
| `consejos` | Consejos y Tips | `fa-lightbulb` |
| `diseno-y-decoracion` | Diseño y Decoración | `fa-palette` |
| `la-casa-de-los-famosos` | La Casa de Los Famosos | `fa-star` |
| `entrevistas` | Entrevistas Exclusivas | `fa-microphone` |
| `recorridos` | Recorridos de Propiedades | `fa-video` |

---

## 3. VideosSingleLayout.astro

**Ruta:** `/videos/{categoria}/{slug}`
**Archivo:** `src/layouts/VideosSingleLayout.astro`
**PageType esperado:** `videos-single`

### Componentes Visuales

| # | Componente | Descripción |
|---|------------|-------------|
| 1 | **Hero Section** | Header con título, subtítulo y metadata del video |
| 2 | **Breadcrumbs** | Inicio > Videos > {Categoría} > {Título} |
| 3 | **Video Meta** | Avatar autor, fecha, duración, vistas |
| 4 | **Video Player** | iframe de YouTube embebido |
| 5 | **Description** | Descripción con HTML renderizado |
| 6 | **Share Buttons** | Facebook, Twitter, LinkedIn |
| 7 | **Related Properties** | Grid de hasta 8 propiedades |
| 8 | **Related Articles** | Grid de hasta 6 artículos |
| 9 | **Related Videos** | Grid de hasta 4 videos |
| 10 | **Testimonials** | Grid de hasta 6 testimonios |
| 11 | **Author Bio** | Sección del autor con contacto |
| 12 | **Schema.org** | JSON-LD VideoObject |

### Datos Requeridos en `data`

```typescript
{
  // OBLIGATORIO
  language: string;

  // VIDEO PRINCIPAL
  video: {
    id: string;
    title: string;
    subtitle?: string;                 // Subtítulo opcional
    description: string;               // HTML permitido
    thumbnail: string;
    slug: string;
    videoSlug?: string;
    videoId: string;                   // ⚠️ CRÍTICO: ID de YouTube para embed
    platform?: string;                 // 'youtube' (default)
    duration: string;
    publishedAt: string;
    views: number;
    featured: boolean;
    url: string;

    author: {
      name: string;
      avatar: string;
      slug?: string;
      position: string;
      bio?: string;                    // HTML permitido
      whatsapp?: string;               // Para botón WhatsApp
      email?: string;                  // Para botón email
      phone?: string;                  // Para botón llamar
    };
  };

  // CATEGORÍA
  category?: {
    id: string;
    name: string;
    slug: string;
  };

  // CONTENIDO CRUZADO (opcional)
  crossContent?: {
    videos?: RelatedVideo[];           // Máx 4
    articles?: RelatedArticle[];       // Máx 6
    properties?: RelatedProperty[];    // Máx 8
    testimonials?: RelatedTestimonial[]; // Máx 6
  };

  // Alternativas a crossContent:
  relatedVideos?: RelatedVideo[];
  relatedArticles?: RelatedArticle[];
  relatedProperties?: RelatedProperty[];
  relatedTestimonials?: RelatedTestimonial[];

  // SEO
  seo?: {
    title: string;
    description: string;
    breadcrumbs: Breadcrumb[];
    ogImage: string;
    canonical_url: string;
    keywords: string;
    structured_data: object;
    hreflang: Record<string, string>;
  };

  // DOMINIO
  domainInfo?: {
    realDomain: string;                // Para URLs absolutas en OG
  };

  globalConfig?: object;
  trackingString?: string;
}
```

### Estructura de Video Relacionado

```typescript
interface RelatedVideo {
  id: string;
  title: string;
  thumbnail: string;
  duration: string;
  views: number;
  url: string;
  slug: string;
  author?: {
    name: string;
    avatar: string;
  };
}
```

### Estructura de Artículo Relacionado

```typescript
interface RelatedArticle {
  id: string;
  title: string;
  excerpt: string;
  featuredImage: string;               // o 'image'
  url: string;
  publishedAt: string;
  readTime: string;                    // "5 min"
  views: number;
  author?: {
    name: string;
    avatar: string;
  };
}
```

### Estructura de Propiedad Relacionada

```typescript
interface RelatedProperty {
  id: string;
  name: string;                        // Título de la propiedad
  price: string;                       // "USD $250,000"
  image: string;                       // URL imagen principal
  location: string;                    // "Punta Cana, La Altagracia"
  category?: string;                   // "Apartamento", "Villa", etc.
  bedrooms: number;
  bathrooms: number;
  area: number;                        // metros cuadrados
  url: string;
}
```

### Estructura de Testimonio Relacionado

```typescript
interface RelatedTestimonial {
  id: string;
  title: string;
  excerpt: string;
  clientName: string;
  clientAvatar: string;
  clientLocation: string;
  rating: number;                      // 1-5 para estrellas
  url: string;
  publishedAt: string;
}
```

### YouTube Embed

El video se embebe usando el `videoId`:

```html
<iframe
  src="https://www.youtube.com/embed/{videoId}"
  title="{title}"
  frameborder="0"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
  allowfullscreen
></iframe>
```

**⚠️ CRÍTICO:** Si `videoId` está vacío, el player no mostrará nada.

### Schema.org VideoObject

Se genera automáticamente un JSON-LD con:
- `@type`: "VideoObject"
- `name`: título
- `description`: descripción
- `thumbnailUrl`: thumbnail o maxresdefault de YouTube
- `uploadDate`: publishedAt
- `duration`: formato PT{minutos}M{segundos}S
- `contentUrl`: URL de YouTube
- `embedUrl`: URL de embed
- `interactionStatistic`: contador de vistas
- `publisher`: CLIC Inmobiliaria
- `author`: nombre del autor

---

## Resumen de PageTypes

| Ruta | PageType | Layout |
|------|----------|--------|
| `/videos` | `videos-main` | VideosMainLayout |
| `/videos/{categoria}` | `videos-category` | VideosCategoryLayout |
| `/videos/{categoria}/{slug}` | `videos-single` | VideosSingleLayout |

---

## Resumen de Campos Críticos por Layout

### VideosMainLayout
- `featuredVideos[]` - Videos destacados
- `recentVideos[]` - Todos los videos
- `categories[]` - Lista de categorías con `videoCount`
- `stats` - Estadísticas globales

### VideosCategoryLayout
- `category.slug` - Para identificar categoría
- `category.name` - Título de la categoría
- `videos[]` - Videos de la categoría
- `videos[].publishedAt` - Para ordenamiento
- `videos[].views` - Para ordenamiento

### VideosSingleLayout
- `video.videoId` - **CRÍTICO** para YouTube embed
- `video.author.whatsapp` - Contacto WhatsApp
- `video.author.email` - Contacto email
- `crossContent` - Contenido relacionado

---

## Valores Default Globales

| Campo | Default |
|-------|---------|
| `thumbnail` | Unsplash placeholder |
| `duration` | `'0:00'` |
| `views` | `0` |
| `author.name` | `'Equipo CLIC'` |
| `author.avatar` | `'/images/team/clic-experts.jpg'` |
| `author.position` | `'Especialista Inmobiliario'` |
| `author.email` | `'info@clicinmobiliaria.com'` |
| `author.phone` | `'+18094872542'` |
| `rating` (testimonios) | `5` |

---

*Documento generado: 2026-01-14*
