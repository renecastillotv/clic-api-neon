// test.ts - Script para probar la conexión a la BD y las queries
import { config } from 'dotenv';
config();

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL no está configurado');
  process.exit(1);
}

console.log('🔗 Conectando a Neon...');
const sql = neon(DATABASE_URL);

async function testQueries() {
  try {
    // Test 1: Obtener tenants
    console.log('\n📋 Test 1: Obtener tenants...');
    const tenants = await sql`SELECT id, nombre, slug, dominio_personalizado, activo FROM tenants LIMIT 5`;
    console.log('Tenants encontrados:', tenants.length);
    if (tenants.length > 0) {
      console.log('Primer tenant:', JSON.stringify(tenants[0], null, 2));
    }

    if (tenants.length === 0) {
      console.log('⚠️  No hay tenants en la BD. Necesitas crear al menos uno.');
      return;
    }

    const tenant = tenants[0];
    const tenantId = tenant.id;

    // Test 2: Verificar estructura de tablas importantes
    console.log('\n📋 Test 2: Verificar tablas de propiedades...');
    const propiedades = await sql`
      SELECT id, slug, titulo, tenant_id
      FROM propiedades
      WHERE tenant_id = ${tenantId}
      LIMIT 3
    `;
    console.log('Propiedades encontradas:', propiedades.length);
    if (propiedades.length > 0) {
      console.log('Primera propiedad:', JSON.stringify(propiedades[0], null, 2));
    }

    // Test 3: Verificar categorías
    console.log('\n📋 Test 3: Verificar categorías de propiedades...');
    const categorias = await sql`
      SELECT id, nombre, slug
      FROM categorias_propiedades
      WHERE tenant_id = ${tenantId}
      LIMIT 5
    `;
    console.log('Categorías encontradas:', categorias.length);
    if (categorias.length > 0) {
      console.log('Categorías:', categorias.map(c => c.nombre).join(', '));
    }

    // Test 4: Verificar ubicaciones
    console.log('\n📋 Test 4: Verificar ubicaciones...');
    const ubicaciones = await sql`
      SELECT id, nombre, slug, tipo
      FROM ubicaciones
      WHERE tenant_id = ${tenantId}
      LIMIT 5
    `;
    console.log('Ubicaciones encontradas:', ubicaciones.length);
    if (ubicaciones.length > 0) {
      console.log('Ubicaciones:', ubicaciones.map(u => `${u.nombre} (${u.tipo})`).join(', '));
    }

    // Test 5: Verificar usuarios/asesores
    console.log('\n📋 Test 5: Verificar usuarios...');
    const usuarios = await sql`
      SELECT id, nombre, apellido, email, rol
      FROM usuarios
      WHERE tenant_id = ${tenantId}
      LIMIT 5
    `;
    console.log('Usuarios encontrados:', usuarios.length);
    if (usuarios.length > 0) {
      console.log('Usuarios:', usuarios.map(u => `${u.nombre} ${u.apellido} (${u.rol})`).join(', '));
    }

    console.log('\n✅ Todas las pruebas completadas!');
    console.log('\n📊 Resumen:');
    console.log(`   - Tenants: ${tenants.length}`);
    console.log(`   - Propiedades: ${propiedades.length}`);
    console.log(`   - Categorías: ${categorias.length}`);
    console.log(`   - Ubicaciones: ${ubicaciones.length}`);
    console.log(`   - Usuarios: ${usuarios.length}`);

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.code) {
      console.error('   Código:', error.code);
    }
    if (error.hint) {
      console.error('   Hint:', error.hint);
    }
  }
}

testQueries();
