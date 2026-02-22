/**
 * Script para probar la funcionalidad de eliminación
 * Ejecutar: npx ts-node scripts/test-deletion.ts
 */
import axios from 'axios';
import 'dotenv/config';

const API_URL = 'http://localhost:4000/api';

interface Document {
  id: string;
  filename: string;
  isDeleted?: boolean;
  deletedAt?: string;
  scheduledDeletionDate?: string;
}

interface DeletedDocument extends Document {
  isDeleted: true;
  deletedAt: string;
  scheduledDeletionDate: string;
  deletionReason?: string;
}

let authToken: string;
let organizationId: string;
let testDocumentId: string;

async function login() {
  console.log('\n🔐 1. Haciendo login...');
  try {
    const response = await axios.post(`${API_URL}/auth/login`, {
      email: 'admin@clouddocs.local',
      password: 'Test@1234'
    });

    // Extraer token de la cookie Set-Cookie
    const setCookie = response.headers['set-cookie'];
    if (setCookie && setCookie.length > 0) {
      const tokenCookie = setCookie.find((cookie: string) => cookie.startsWith('token='));
      if (tokenCookie) {
        authToken = tokenCookie.split(';')[0].split('=')[1];
      }
    }

    if (!authToken) {
      console.error('   ❌ No se pudo extraer el token de la respuesta');
      return false;
    }

    const user = response.data.user;
    console.log('   ✅ Login exitoso');
    console.log(`   Usuario: ${user.name} (${user.email})`);
    console.log(`   Token: ${authToken.substring(0, 20)}...`);
    return true;
  } catch (error: any) {
    console.error('   ❌ Error en login:');
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
      console.error('   Headers:', error.response.headers);
    } else {
      console.error('   ', error.message);
    }
    return false;
  }
}

async function getOrganizations() {
  console.log('\n🏢 2. Obteniendo organizaciones...');
  try {
    const response = await axios.get(`${API_URL}/memberships/my-organizations`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    if (response.data.data && response.data.data.length > 0) {
      organizationId = response.data.data[0].organization.id;
      console.log(`   ✅ Organización encontrada: ${response.data.data[0].organization.name}`);
      console.log(`   ID: ${organizationId}`);
      console.log(`   Plan: ${response.data.data[0].organization.plan}`);
      return true;
    } else {
      console.log('   ⚠️ No se encontraron organizaciones');
      return false;
    }
  } catch (error: any) {
    console.error('   ❌ Error obteniendo organizaciones:', error.response?.data || error.message);
    return false;
  }
}

async function getDocuments() {
  console.log('\n📄 3. Obteniendo documentos disponibles...');
  try {
    const response = await axios.get(`${API_URL}/documents`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        'x-organization-id': organizationId
      }
    });

    const documents = response.data.documents;
    const activeDocuments = documents.filter((doc: Document) => !doc.isDeleted);

    if (activeDocuments.length > 0) {
      testDocumentId = activeDocuments[0].id;
      console.log(`   ✅ Documentos encontrados: ${documents.length} total, ${activeDocuments.length} activos`);
      console.log(`   Test Document: ${activeDocuments[0].filename} (ID: ${testDocumentId})`);
      return true;
    } else {
      console.log('   ⚠️ No hay documentos activos disponibles para probar');
      return false;
    }
  } catch (error: any) {
    console.error('   ❌ Error obteniendo documentos:', error.response?.data || error.message);
    return false;
  }
}

async function moveToTrash() {
  console.log('\n🗑️  4. Moviendo documento a la papelera (soft delete)...');
  try {
    const response = await axios.post(
      `${API_URL}/deletion/${testDocumentId}/trash`,
      {
        reason: 'Test de eliminación automática'
      },
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'x-organization-id': organizationId
        }
      }
    );

    const deletedDoc: DeletedDocument = response.data.data;
    console.log('   ✅ Documento movido a papelera exitosamente');
    console.log(`   Archivo: ${deletedDoc.filename}`);
    console.log(`   Eliminado: ${new Date(deletedDoc.deletedAt).toLocaleString()}`);
    console.log(`   Eliminación programada: ${new Date(deletedDoc.scheduledDeletionDate).toLocaleString()}`);
    console.log(`   Razón: ${deletedDoc.deletionReason || 'N/A'}`);
    return true;
  } catch (error: any) {
    console.error('   ❌ Error moviendo a papelera:', error.response?.data || error.message);
    return false;
  }
}

async function listTrash() {
  console.log('\n📋 5. Listando documentos en papelera...');
  try {
    const response = await axios.get(`${API_URL}/deletion/trash`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        'x-organization-id': organizationId
      }
    });

    const trashedDocs: DeletedDocument[] = response.data.data;
    console.log(`   ✅ Documentos en papelera: ${trashedDocs.length}`);
    
    trashedDocs.forEach((doc, index) => {
      const daysRemaining = Math.ceil(
        (new Date(doc.scheduledDeletionDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );
      console.log(`   ${index + 1}. ${doc.filename}`);
      console.log(`      - Eliminado: ${new Date(doc.deletedAt).toLocaleString()}`);
      console.log(`      - Días restantes: ${daysRemaining}`);
      if (doc.deletionReason) console.log(`      - Razón: ${doc.deletionReason}`);
    });

    return trashedDocs.length > 0;
  } catch (error: any) {
    console.error('   ❌ Error listando papelera:', error.response?.data || error.message);
    return false;
  }
}

async function restoreFromTrash() {
  console.log('\n♻️  6. Restaurando documento desde papelera...');
  try {
    const response = await axios.post(
      `${API_URL}/deletion/${testDocumentId}/restore`,
      {},
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'x-organization-id': organizationId
        }
      }
    );

    const restoredDoc: Document = response.data.data;
    console.log('   ✅ Documento restaurado exitosamente');
    console.log(`   Archivo: ${restoredDoc.filename}`);
    console.log(`   isDeleted: ${restoredDoc.isDeleted}`);
    return true;
  } catch (error: any) {
    console.error('   ❌ Error restaurando documento:', error.response?.data || error.message);
    return false;
  }
}

async function moveToTrashAgain() {
  console.log('\n🗑️  7. Moviendo nuevamente a papelera para prueba de eliminación permanente...');
  try {
    await axios.post(
      `${API_URL}/deletion/${testDocumentId}/trash`,
      {
        reason: 'Preparando para eliminación permanente'
      },
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'x-organization-id': organizationId
        }
      }
    );

    console.log('   ✅ Documento movido a papelera nuevamente');
    return true;
  } catch (error: any) {
    console.error('   ❌ Error moviendo a papelera:', error.response?.data || error.message);
    return false;
  }
}

async function permanentDelete() {
  console.log('\n⚠️  8. ELIMINACIÓN PERMANENTE (sin posibilidad de recuperación)...');
  console.log('   Esperando 3 segundos antes de eliminar permanentemente...');
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  try {
    const response = await axios.delete(`${API_URL}/deletion/${testDocumentId}/permanent`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        'x-organization-id': organizationId
      }
    });

    console.log('   ✅ Documento eliminado permanentemente');
    console.log(`   Mensaje: ${response.data.message || 'Eliminación exitosa'}`);
    return true;
  } catch (error: any) {
    console.error('   ❌ Error en eliminación permanente:', error.response?.data || error.message);
    return false;
  }
}

async function verifyPermanentDeletion() {
  console.log('\n✔️  9. Verificando que el documento fue eliminado permanentemente...');
  try {
    // Intentar obtener el documento - debería fallar
    await axios.get(`${API_URL}/documents/${testDocumentId}`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        'x-organization-id': organizationId
      }
    });

    console.log('   ⚠️ El documento aún existe (no esperado)');
    return false;
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.log('   ✅ Confirmado: El documento no existe (eliminación permanente exitosa)');
      return true;
    } else {
      console.error('   ❌ Error verificando eliminación:', error.response?.data || error.message);
      return false;
    }
  }
}

async function main() {
  console.log('🧪 PRUEBA DE FUNCIONALIDAD DE ELIMINACIÓN');
  console.log('==========================================');

  // Ejecutar pruebas en secuencia
  if (!await login()) return;
  if (!await getOrganizations()) return;
  if (!await getDocuments()) return;
  
  // Probar soft delete (papelera)
  if (!await moveToTrash()) return;
  if (!await listTrash()) return;
  
  // Probar restauración
  if (!await restoreFromTrash()) return;
  
  // Probar eliminación permanente
  if (!await moveToTrashAgain()) return;
  if (!await permanentDelete()) return;
  await verifyPermanentDeletion();

  console.log('\n✅ PRUEBAS COMPLETADAS');
  console.log('======================\n');
}

main().catch(console.error);
