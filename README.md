# CLIC API - Vercel Edge Functions

API para el frontend de CLIC Inmobiliaria, diseñada para ejecutarse en Vercel Edge Functions con Neon PostgreSQL.

## Estructura

```
api/
├── index.ts           # Router principal
├── package.json       # Dependencias
├── tsconfig.json      # Configuración TypeScript
├── vercel.json        # Configuración de Vercel
├── handlers/          # Handlers por tipo de página
│   ├── properties.ts  # Propiedades (lista + detalle)
│   ├── advisors.ts    # Asesores inmobiliarios
│   ├── content.ts     # Artículos, videos, testimonios
│   └── homepage.ts    # Página de inicio
└── lib/               # Módulos compartidos
    ├── db.ts          # Conexión a Neon PostgreSQL
    └── utils.ts       # Utilidades comunes
```

## Configuración

### Variables de Entorno (Vercel)

```env
# Conexión a Neon PostgreSQL (REQUERIDO)
DATABASE_URL=postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require
```

### Despliegue

1. Instalar dependencias:
```bash
cd api
npm install
```

2. Configurar Vercel CLI:
```bash
npm install -g vercel
vercel login
```

3. Configurar secretos:
```bash
vercel secrets add neon_database_url "postgresql://..."
```

4. Desplegar:
```bash
vercel deploy --prod
```

## Endpoints

La API usa un único endpoint que maneja todas las rutas:

```
GET /api/{path}
```

### Parámetros Query

- `domain`: Dominio del tenant (requerido)
- `page`: Número de página (default: 1)
- `limit`: Items por página (default: 32)
- UTM params: Se preservan para tracking

### Ejemplos

```bash
# Homepage
curl "https://tu-api.vercel.app/api/?domain=clicinmobiliaria.com"

# Lista de propiedades
curl "https://tu-api.vercel.app/api/comprar?domain=clicinmobiliaria.com"

# Propiedad individual
curl "https://tu-api.vercel.app/api/comprar/apartamento/piantini/mi-apartamento?domain=clicinmobiliaria.com"

# Asesores
curl "https://tu-api.vercel.app/api/asesores?domain=clicinmobiliaria.com"
```

## Tipos de Respuesta (pageType)

- `homepage`: Página de inicio
- `property-list`: Lista de propiedades
- `single-property`: Detalle de propiedad
- `advisors-list` / `advisors-main`: Lista de asesores
- `advisor-single`: Perfil de asesor
- `articles-main` / `articles-category` / `articles-single`: Artículos
- `videos-main` / `videos-category` / `videos-single`: Videos
- `testimonials-main` / `testimonials-single`: Testimonios
- `favorites-main` / `favorites-shared`: Favoritos
- `contact`: Contacto
- `sell`: Vender propiedad
- `vacation-rentals-*`: Rentas vacacionales
- `curated-listings-*`: Listados curados
- `locations-main`: Ubicaciones
- `property-types-main`: Tipos de propiedad
- `legal-terms` / `legal-privacy`: Páginas legales
- `404`: Página no encontrada

## Estructura de Respuesta

Todas las respuestas incluyen:

```typescript
{
  pageType: string;
  language: string;
  tenant: TenantConfig;
  seo: SEOData;
  trackingString?: string;
  // ... datos específicos del tipo de página
}
```

## Migración desde Supabase

Para migrar del backend actual de Supabase:

1. Configurar `PUBLIC_API_BACKEND=vercel` en el frontend
2. Configurar `PUBLIC_VERCEL_API_URL` con la URL de la API
3. Asegurar que la estructura de datos de Neon coincida con el schema esperado

## Desarrollo Local

```bash
cd api
npm install
npm run dev
```

La API estará disponible en `http://localhost:3000/api`
