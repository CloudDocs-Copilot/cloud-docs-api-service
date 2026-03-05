/**
 * Script E2E para probar búsqueda contra backend REAL en desarrollo
 * NO usa NODE_ENV=test, ejecuta contra el backend corriendo en puerto 4000
 * 
 * Ejecutar con: npx ts-node tests/e2e/run-search-e2e.ts
 */

<<<<<<< HEAD
import axios, { AxiosInstance } from 'axios';
=======
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any */

import axios, { AxiosInstance, AxiosResponse } from 'axios';
>>>>>>> origin/main
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
<<<<<<< HEAD
const client: AxiosInstance = wrapper(axios.create({
=======
const typedWrapper = wrapper as (instance: AxiosInstance) => AxiosInstance;
const client = typedWrapper(axios.create({
>>>>>>> origin/main
  baseURL: API_BASE_URL,
  jar,
  withCredentials: true
}));

let organizationId: string;

<<<<<<< HEAD
async function runTests() {
  console.log('\n🧪 Ejecutando tests E2E de búsqueda contra backend real...\n');
  
  try {
    // 1. Login
    console.log('1️⃣  Login...');
    const loginResponse = await client.post('/auth/login', TEST_USER);
    
    if (loginResponse.data.message !== 'Login successful') {
=======
type LoginResp = { message?: string };
type OrgsResp = { memberships?: Array<{ organization?: { id?: string; _id?: unknown; name?: string } }> };
type SearchResp = { documents?: Array<Record<string, unknown>>; suggestions?: string[] };

async function runTests() {
  console.warn('\n🧪 Ejecutando tests E2E de búsqueda contra backend real...\n');
  
  try {
    // 1. Login
    console.warn('1️⃣  Login...');
    const loginResponse: AxiosResponse<LoginResp> = await client.post('/auth/login', TEST_USER);

    if (loginResponse.data?.message !== 'Login successful') {
>>>>>>> origin/main
      console.error('   ❌ Login falló. Respuesta:', loginResponse.data);
      throw new Error('Login failed');
    }
    
<<<<<<< HEAD
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
=======
    console.warn(`   ✅ Login exitoso (cookie JWT establecida)`);
    
    // 2. Obtener organización del usuario
    console.warn('\n2️⃣  Obtener organizaciones del usuario...');
    const orgsResponse: AxiosResponse<OrgsResp> = await client.get('/organizations');

    const memberships = orgsResponse.data?.memberships;
    if (!memberships || memberships.length === 0) {
      throw new Error('Usuario no tiene organizaciones');
    }

    const organization = memberships[0].organization ?? {};
    organizationId = organization.id ?? String(organization._id ?? '');
    console.warn(`   ✅ Organización: ${organization.name ?? 'unknown'} (${organizationId})`);
    
    // 3. Búsqueda parcial
    console.warn('\n3️⃣  Test: Búsqueda parcial...');
    const searchResult: AxiosResponse<SearchResp> = await client.get('/search', {
      params: { q: 'zonif' }
    });
    console.warn(`   ✅ Encontrados ${searchResult.data?.documents?.length || 0} documentos`);
    if (searchResult.data?.documents?.[0]) {
      const first = searchResult.data.documents[0] as Record<string, unknown>;
      console.warn(`   📄 Ejemplo: ${String(first.filename ?? '')}`);
    }
    
    // 4. Búsqueda case-insensitive
    console.warn('\n4️⃣  Test: Case-insensitive...');
    const caseResult: AxiosResponse<SearchResp> = await client.get('/search', {
      params: { q: 'ZONIFICACION' }
    });
    console.warn(`   ✅ Encontrados ${caseResult.data?.documents?.length || 0} documentos (case-insensitive funciona)`);
    
    // 5. Filtro por tipo MIME
    console.warn('\n5️⃣  Test: Filtro por tipo MIME...');
    const mimeResult: AxiosResponse<SearchResp> = await client.get('/search', {
      params: { q: 'zonif', mimeType: 'application/pdf' }
    });
    console.warn(`   ✅ Encontrados ${mimeResult.data?.documents?.length || 0} PDFs`);
    
    // 6. Filtro por fecha
    console.warn('\n6️⃣  Test: Filtro por fecha...');
    const dateFrom = new Date('2024-01-01').toISOString();
    const dateTo = new Date().toISOString();
    const dateResult: AxiosResponse<SearchResp> = await client.get('/search', {
      params: { q: 'zonif', dateFrom, dateTo }
    });
    console.warn(`   ✅ Encontrados ${dateResult.data?.documents?.length || 0} documentos en rango de fechas`);
    
    // 7. Score de relevancia
    console.warn('\n7️⃣  Test: Score de relevancia...');
    if (searchResult.data?.documents?.[0] && 'score' in (searchResult.data.documents[0] as Record<string, unknown>)) {
      console.warn(`   ✅ Score presente: ${(searchResult.data.documents[0] as Record<string, unknown>).score}`);
    } else {
      console.warn(`   ⚠️  Score no está presente en la respuesta`);
    }
    
    // 8. Autocompletado
    console.warn('\n8️⃣  Test: Autocompletado...');
    const autocompleteResult: AxiosResponse<SearchResp> = await client.get('/search/autocomplete', {
      params: { q: 'zon' }
    });
    console.warn(`   ✅ Sugerencias: ${autocompleteResult.data?.suggestions?.length || 0}`);
    if (autocompleteResult.data?.suggestions?.[0]) {
      console.warn(`   💡 Ejemplo: ${String(autocompleteResult.data.suggestions[0])}`);
    }
    
    // 9. Validación sin query
    console.warn('\n9️⃣  Test: Validación sin query...');
    try {
      await client.get('/search');
      console.warn(`   ❌ Debería haber retornado 400`);
    } catch (error: unknown) {
      const ctx = ((): { status?: number } => {
        if (typeof error === 'object' && error !== null) {
          const e = error as { response?: { status?: number } };
          return { status: e.response?.status };
        }
        return {};
      })();
      if (ctx.status === 400) {
        console.warn(`   ✅ Retorna 400 correctamente`);
      } else {
        console.warn(`   ⚠️  Retornó status ${ctx.status ?? 'unknown'} en lugar de 400`);
>>>>>>> origin/main
      }
    }
    
    // 10. Validación sin autenticación
<<<<<<< HEAD
    console.log('\n🔟 Test: Sin autenticación...');
=======
    console.warn('\n🔟 Test: Sin autenticación...');
>>>>>>> origin/main
    try {
      // Crear cliente sin cookies para esta prueba
      await axios.get(`${API_BASE_URL}/search`, {
        params: { q: 'test' }
      });
<<<<<<< HEAD
      console.log(`   ❌ Debería haber retornado 401`);
    } catch (error: any) {
      if (error.response?.status === 401) {
        console.log(`   ✅ Retorna 401 correctamente`);
      } else {
        console.log(`   ⚠️  Retornó status ${error.response?.status} en lugar de 401`);
=======
      console.warn(`   ❌ Debería haber retornado 401`);
    } catch (error: unknown) {
      const ctx = ((): { status?: number } => {
        if (typeof error === 'object' && error !== null) {
          const e = error as { response?: { status?: number } };
          return { status: e.response?.status };
        }
        return {};
      })();
      if (ctx.status === 401) {
        console.warn(`   ✅ Retorna 401 correctamente`);
      } else {
        console.warn(`   ⚠️  Retornó status ${ctx.status ?? 'unknown'} en lugar de 401`);
>>>>>>> origin/main
      }
    }
    
    // 11. Rendimiento
<<<<<<< HEAD
    console.log('\n1️⃣1️⃣  Test: Rendimiento...');
=======
    console.warn('\n1️⃣1️⃣  Test: Rendimiento...');
>>>>>>> origin/main
    const startTime = Date.now();
    await client.get('/search', {
      params: { q: 'zonif' }
    });
    const duration = Date.now() - startTime;
<<<<<<< HEAD
    console.log(`   ⏱️  Tiempo de respuesta: ${duration}ms`);
    if (duration < 1000) {
      console.log(`   ✅ Responde en menos de 1 segundo`);
    } else {
      console.log(`   ⚠️  Tardó más de 1 segundo`);
    }
    
    console.log('\n✅ TODOS LOS TESTS E2E COMPLETADOS\n');
    
  } catch (error: any) {
    console.error('\n❌ ERROR en tests E2E:', error.response?.data || error.message);
=======
    console.warn(`   ⏱️  Tiempo de respuesta: ${duration}ms`);
    if (duration < 1000) {
      console.warn(`   ✅ Responde en menos de 1 segundo`);
    } else {
      console.warn(`   ⚠️  Tardó más de 1 segundo`);
    }
    
    console.warn('\n✅ TODOS LOS TESTS E2E COMPLETADOS\n');
    
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null) {
      const e = error as { response?: { data?: unknown }; message?: string };
      console.error('\n❌ ERROR en tests E2E:', e.response?.data ?? e.message);
    } else {
      console.error('\n❌ ERROR en tests E2E:', String(error));
    }
>>>>>>> origin/main
    process.exit(1);
  }
}

runTests();
