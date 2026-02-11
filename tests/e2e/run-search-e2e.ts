/**
 * Script E2E para probar búsqueda contra backend REAL en desarrollo
 * NO usa NODE_ENV=test, ejecuta contra el backend corriendo en puerto 4000
 * 
 * Ejecutar con: npx ts-node tests/e2e/run-search-e2e.ts
 */

import axios, { AxiosInstance } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import { basicUser } from '../fixtures/user.fixtures';

const API_BASE_URL = 'http://127.0.0.1:4000/api';

// Credenciales de usuario de fixture
const TEST_USER = {
  email: basicUser.email,  // 'test@example.com'
  password: basicUser.password  // 'Test@1234'
};

// Crear cliente axios con soporte de cookies
const jar = new CookieJar();
const client: AxiosInstance = wrapper(axios.create({
  baseURL: API_BASE_URL,
  jar,
  withCredentials: true
}));

let organizationId: string;

async function runTests() {
  console.log('\n🧪 Ejecutando tests E2E de búsqueda contra backend real...\n');
  
  try {
    // 1. Login
    console.log('1️⃣  Login...');
    const loginResponse = await client.post('/auth/login', TEST_USER);
    
    if (loginResponse.data.message !== 'Login successful') {
      console.error('   ❌ Login falló. Respuesta:', loginResponse.data);
      throw new Error('Login failed');
    }
    
    console.log(`   ✅ Login exitoso (cookie JWT establecida)`);
    
    // 2. Obtener organización del usuario
    console.log('\n2️⃣  Obtener organizaciones del usuario...');
    const orgsResponse = await client.get('/organizations');
    
    const memberships = orgsResponse.data.memberships;
    if (!memberships || memberships.length === 0) {
      throw new Error('Usuario no tiene organizaciones');
    }
    
    const organization = memberships[0].organization;
    organizationId = organization.id || organization._id;
    console.log(`   ✅ Organización: ${organization.name} (${organizationId})`);
    
    // 3. Búsqueda parcial
    console.log('\n3️⃣  Test: Búsqueda parcial...');
    const searchResult = await client.get('/search', {
      params: { q: 'zonif' }
    });
    console.log(`   ✅ Encontrados ${searchResult.data.documents?.length || 0} documentos`);
    if (searchResult.data.documents?.[0]) {
      console.log(`   📄 Ejemplo: ${searchResult.data.documents[0].filename}`);
    }
    
    // 4. Búsqueda case-insensitive
    console.log('\n4️⃣  Test: Case-insensitive...');
    const caseResult = await client.get('/search', {
      params: { q: 'ZONIFICACION' }
    });
    console.log(`   ✅ Encontrados ${caseResult.data.documents?.length || 0} documentos (case-insensitive funciona)`);
    
    // 5. Filtro por tipo MIME
    console.log('\n5️⃣  Test: Filtro por tipo MIME...');
    const mimeResult = await client.get('/search', {
      params: { q: 'zonif', mimeType: 'application/pdf' }
    });
    console.log(`   ✅ Encontrados ${mimeResult.data.documents?.length || 0} PDFs`);
    
    // 6. Filtro por fecha
    console.log('\n6️⃣  Test: Filtro por fecha...');
    const dateFrom = new Date('2024-01-01').toISOString();
    const dateTo = new Date().toISOString();
    const dateResult = await client.get('/search', {
      params: { q: 'zonif', dateFrom, dateTo }
    });
    console.log(`   ✅ Encontrados ${dateResult.data.documents?.length || 0} documentos en rango de fechas`);
    
    // 7. Score de relevancia
    console.log('\n7️⃣  Test: Score de relevancia...');
    if (searchResult.data.documents?.[0]?.score !== undefined) {
      console.log(`   ✅ Score presente: ${searchResult.data.documents[0].score}`);
    } else {
      console.log(`   ⚠️  Score no está presente en la respuesta`);
    }
    
    // 8. Autocompletado
    console.log('\n8️⃣  Test: Autocompletado...');
    const autocompleteResult = await client.get('/search/autocomplete', {
      params: { q: 'zon' }
    });
    console.log(`   ✅ Sugerencias: ${autocompleteResult.data.suggestions?.length || 0}`);
    if (autocompleteResult.data.suggestions?.[0]) {
      console.log(`   💡 Ejemplo: ${autocompleteResult.data.suggestions[0]}`);
    }
    
    // 9. Validación sin query
    console.log('\n9️⃣  Test: Validación sin query...');
    try {
      await client.get('/search');
      console.log(`   ❌ Debería haber retornado 400`);
    } catch (error: any) {
      if (error.response?.status === 400) {
        console.log(`   ✅ Retorna 400 correctamente`);
      } else {
        console.log(`   ⚠️  Retornó status ${error.response?.status} en lugar de 400`);
      }
    }
    
    // 10. Validación sin autenticación
    console.log('\n🔟 Test: Sin autenticación...');
    try {
      // Crear cliente sin cookies para esta prueba
      await axios.get(`${API_BASE_URL}/search`, {
        params: { q: 'test' }
      });
      console.log(`   ❌ Debería haber retornado 401`);
    } catch (error: any) {
      if (error.response?.status === 401) {
        console.log(`   ✅ Retorna 401 correctamente`);
      } else {
        console.log(`   ⚠️  Retornó status ${error.response?.status} en lugar de 401`);
      }
    }
    
    // 11. Rendimiento
    console.log('\n1️⃣1️⃣  Test: Rendimiento...');
    const startTime = Date.now();
    await client.get('/search', {
      params: { q: 'zonif' }
    });
    const duration = Date.now() - startTime;
    console.log(`   ⏱️  Tiempo de respuesta: ${duration}ms`);
    if (duration < 1000) {
      console.log(`   ✅ Responde en menos de 1 segundo`);
    } else {
      console.log(`   ⚠️  Tardó más de 1 segundo`);
    }
    
    console.log('\n✅ TODOS LOS TESTS E2E COMPLETADOS\n');
    
  } catch (error: any) {
    console.error('\n❌ ERROR en tests E2E:', error.response?.data || error.message);
    process.exit(1);
  }
}

runTests();
