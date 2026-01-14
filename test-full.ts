// test-full.ts - Test completo de db.ts
import { config } from 'dotenv';
config();

import db from './lib/db.ts';

async function runTests() {
  console.log('🧪 Testing all db.ts functions...\n');

  try {
    // Test 1: getTenantByDomain
    console.log('1️⃣ Testing getTenantByDomain...');
    const tenant = await db.getTenantByDomain('localhost');
    console.log('   Result:', tenant ? `Found: ${tenant.nombre}` : 'Not found');

    // Test 2: getDefaultTenant
    console.log('\n2️⃣ Testing getDefaultTenant...');
    const defaultTenant = await db.getDefaultTenant();
    console.log('   Result:', defaultTenant ? `Found: ${defaultTenant.nombre} (ID: ${defaultTenant.id})` : 'Not found');

    if (!defaultTenant) {
      console.error('❌ No default tenant found. Cannot continue tests.');
      return;
    }

    const tenantId = defaultTenant.id;

    // Test 3: getQuickStats
    console.log('\n3️⃣ Testing getQuickStats...');
    const stats = await db.getQuickStats(tenantId);
    console.log('   Stats:', stats);

    // Test 4: getFeaturedProperties
    console.log('\n4️⃣ Testing getFeaturedProperties...');
    const featured = await db.getFeaturedProperties(tenantId, 5);
    console.log('   Found:', featured.length, 'featured properties');

    // Test 5: getProperties
    console.log('\n5️⃣ Testing getProperties...');
    const { properties, pagination } = await db.getProperties({
      tenantId,
      page: 1,
      limit: 5
    });
    console.log('   Found:', properties.length, 'properties');
    console.log('   Pagination:', pagination);

    // Test 6: getPopularLocations
    console.log('\n6️⃣ Testing getPopularLocations...');
    const locations = await db.getPopularLocations(tenantId);
    console.log('   Cities:', locations.cities.length);
    console.log('   Sectors:', locations.sectors.length);

    // Test 7: getAdvisors
    console.log('\n7️⃣ Testing getAdvisors...');
    const advisors = await db.getAdvisors(tenantId, 5);
    console.log('   Found:', advisors.length, 'advisors');
    if (advisors.length > 0) {
      console.log('   First advisor:', advisors[0].nombre, advisors[0].apellido);
    }

    // Test 8: getTestimonials
    console.log('\n8️⃣ Testing getTestimonials...');
    const testimonials = await db.getTestimonials(tenantId, 5);
    console.log('   Found:', testimonials.length, 'testimonials');

    // Test 9: getFAQs
    console.log('\n9️⃣ Testing getFAQs...');
    const faqs = await db.getFAQs({ tenantId, limit: 5 });
    console.log('   Found:', faqs.length, 'FAQs');

    // Test 10: getPropertyCategories
    console.log('\n🔟 Testing getPropertyCategories...');
    const categories = await db.getPropertyCategories(tenantId);
    console.log('   Found:', categories.length, 'categories');

    console.log('\n✅ All tests completed!');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    console.error('   Stack:', error.stack?.split('\n').slice(0, 5).join('\n'));
  }
}

runTests();
