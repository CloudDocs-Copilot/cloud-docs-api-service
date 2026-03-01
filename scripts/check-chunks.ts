/**
 * Script rápido para verificar si hay chunks para un documento
 */
import dotenv from 'dotenv';
dotenv.config();

import { getDb, closeAtlasConnection } from '../src/configurations/database-config/mongoAtlas';

const COLLECTION_NAME = 'document_chunks';

async function checkChunks(documentId: string) {
  try {
    console.log(`🔍 Verificando chunks para documento: ${documentId}\n`);

    const db = await getDb();
    const collection = db.collection(COLLECTION_NAME);

    // Buscar chunks con el documentId como STRING
    const chunks = await collection
      .find({ documentId })
      .project({ _id: 1, documentId: 1, organizationId: 1, chunkIndex: 1, wordCount: 1 })
      .toArray();

    if (chunks.length === 0) {
      console.log('❌ No se encontraron chunks para este documento');
      console.log('\n💡 Posibles causas:');
      console.log('   1. El documento aún no ha sido procesado');
      console.log('   2. POST /api/ai/documents/{id}/process no se ejecutó correctamente');
      console.log('   3. El documentId es incorrecto\n');
    } else {
      console.log(`✅ Se encontraron ${chunks.length} chunks:\n`);
      chunks.slice(0, 3).forEach((chunk, index) => {
        console.log(`Chunk #${index + 1}:`);
        console.log(`  - ID: ${chunk._id}`);
        console.log(`  - documentId: "${chunk.documentId}" (${typeof chunk.documentId})`);
        console.log(`  - organizationId: "${chunk.organizationId}"`);
        console.log(`  - chunkIndex: ${chunk.chunkIndex}`);
        console.log(`  - wordCount: ${chunk.wordCount}\n`);
      });

      if (chunks.length > 3) {
        console.log(`... y ${chunks.length - 3} chunks más\n`);
      }

      // Verificar tipo de datos
      const firstChunk = chunks[0];
      console.log('🔎 Verificación de tipos:');
      console.log(`   documentId es tipo: ${typeof firstChunk.documentId}`);
      console.log(
        `   ${typeof firstChunk.documentId === 'string' ? '✅' : '❌'} Correcto (debe ser string)\n`
      );
    }

    await closeAtlasConnection();
    process.exit(0);
  } catch (error: unknown) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Obtener documentId de argumentos de línea de comando
const documentId = process.argv[2];

if (!documentId) {
  console.error('❌ Debes proporcionar un documentId');
  console.log('\nUso: npm run check-chunks <documentId>');
  console.log('Ejemplo: npm run check-chunks 699eaeed66ae9cbfa97aeecc\n');
  process.exit(1);
}

checkChunks(documentId);
