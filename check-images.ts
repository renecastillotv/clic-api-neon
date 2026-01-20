import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
config();
const sql = neon(process.env.DATABASE_URL!);

async function check() {
  // Obtener imágenes de propiedades por tipo
  const images = await sql`
    SELECT LOWER(tipo) as tipo, imagen_principal
    FROM propiedades
    WHERE imagen_principal IS NOT NULL
      AND imagen_principal != ''
      AND activo = true
      AND estado_propiedad = 'disponible'
      AND imagen_principal LIKE 'https://%'
    ORDER BY tipo, destacada DESC
  `;

  const byType: Record<string, string[]> = {};
  images.forEach((p: any) => {
    const t = p.tipo?.toLowerCase();
    if (!t) return;
    if (!byType[t]) byType[t] = [];
    if (byType[t].length < 2 && !byType[t].includes(p.imagen_principal)) {
      byType[t].push(p.imagen_principal);
    }
  });

  console.log('Imágenes por tipo:');
  Object.entries(byType).forEach(([tipo, imgs]) => {
    console.log(`\n${tipo}:`);
    imgs.forEach(img => console.log(`  "${img}"`));
  });
}

check();
