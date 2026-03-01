/**
 * Script de diagnóstico RAG - Vector Search
 * Verifica chunks, embeddings, índice vectorial y hace pruebas
 */
import dotenv from 'dotenv';
dotenv.config();

import { getDb } from '../src/configurations/database-config/mongoAtlas';
import { embeddingService } from '../src/services/ai/embedding.service';
import mongoose from 'mongoose';
import { ObjectId } from 'mongodb';

const COLLECTION_NAME = 'document_chunks';

async function diagnose() {
  try {
    console.log('🔍 === DIAGNÓSTICO RAG - VECTOR SEARCH ===\n');

    // Conectar a MongoDB local
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/clouddocs';
    await mongoose.connect(mongoUri);
    console.log('✅ Conectado a MongoDB local\n');

    // Conectar a Atlas
    const db = await getDb();
    const collection = db.collection(COLLECTION_NAME);

    // 1. CHUNKS EN ATLAS
    console.log('📊 1. CHUNKS EN MONGODB ATLAS');
    console.log('═'.repeat(50));
    const totalChunks = await collection.countDocuments();
    console.log(`Total chunks: ${totalChunks}`);

    if (totalChunks === 0) {
      console.log('\n❌ NO HAY CHUNKS EN ATLAS');
      console.log('→ Debes procesar documentos: POST /api/ai/documents/{id}/process\n');
      return;
    }

    // 2. CHUNKS POR ORGANIZACIÓN
    console.log('\n📂 2. CHUNKS POR ORGANIZACIÓN');
    console.log('═'.repeat(50));
    const byOrg = await collection.aggregate([
      { $group: { _id: '$organizationId', count: { $sum: 1 }, docs: { $addToSet: '$documentId' } } }
    ]).toArray();

    for (const org of byOrg) {
      console.log(`\nOrg: ${org._id || '[❌ SIN ORG]'}`);
      console.log(`  Chunks: ${org.count}`);
      console.log(`  Docs: ${org.docs.length}`);
    }

    // 3. CHUNKS SIN organizationId
    const noOrg = await collection.countDocuments({ organizationId: { $exists: false } });
    if (noOrg > 0) {
      console.log(`\n❌ ${noOrg} chunks SIN organizationId (bloqueará búsqueda)`);
    } else {
      console.log('\n✅ Todos los chunks tienen organizationId');
    }

    // 4. VERIFICAR EMBEDDINGS
    console.log('\n🧮 4. EMBEDDINGS');
    console.log('═'.repeat(50));
    const sample = await collection.findOne({});
    
    if (!sample) {
      console.log('❌ No se pudo obtener chunk de muestra');
      return;
    }

    console.log(`Sample chunk ID: ${sample._id}`);
    console.log(`  DocumentId: ${sample.documentId}`);
    console.log(`  OrganizationId: ${sample.organizationId || '❌ NO TIENE'}`);
    console.log(`  Content: ${(sample.content || '').substring(0, 80)}...`);

    if (!sample.embedding || !Array.isArray(sample.embedding)) {
      console.log('\n❌ ERROR: Chunk sin embedding válido');
      return;
    }

    const actualDim = sample.embedding.length;
    const expectedDim = embeddingService.getDimensions();
    console.log(`  Embedding dims: ${actualDim} (esperadas: ${expectedDim})`);

    if (actualDim !== expectedDim) {
      console.log(`\n⚠️  DIMENSIONES NO COINCIDEN`);
      console.log(`→ Provider actual: ${process.env.AI_PROVIDER} → ${expectedDim} dims`);
      console.log(`→ Chunks guardados: ${actualDim} dims`);
      console.log(`→ ¿Cambiaste de provider? Reprocesa documentos.\n`);
    } else {
      console.log(`✅ Dimensiones correctas`);
    }

    // 5. PRUEBA DE BÚSQUEDA VECTORIAL
    console.log('\n🔬 5. PRUEBA DE BÚSQUEDA VECTORIAL');
    console.log('═'.repeat(50));

    const testQuery = '¿Cuáles son los objetivos?';
    console.log(`Query: "${testQuery}"`);
    
    const queryEmbedding = await embeddingService.generateEmbedding(testQuery);
    console.log(`✅ Embedding generado: ${queryEmbedding.length} dims`);

    const testOrg = byOrg[0]?._id;
    if (!testOrg) {
      console.log('❌ No hay organizaciones para probar');
      return;
    }

    console.log(`\nBuscando en org: ${testOrg}`);

    try {
      // Mostrar tipos para detectar mismatches
      console.log('\nTipos de organizationId:');
      console.log(`  sample.organizationId type: ${typeof sample.organizationId}`);
      console.log(`  sample.organizationId instance of ObjectId: ${sample.organizationId instanceof ObjectId}`);
      console.log(`  testOrg type: ${typeof testOrg}`);

      // Helper para ejecutar búsqueda vectorial con distintos filtros
      async function runVectorSearch(filter: unknown, desc: string) {
        console.log(`\n-- Ejecutando búsqueda vectorial (${desc}) --`);
        try {
          const pipeline: Array<Record<string, unknown>> = [
            {
              $vectorSearch: {
                index: process.env.MONGO_ATLAS_VECTOR_INDEX || 'default',
                path: 'embedding',
                queryVector: queryEmbedding,
                numCandidates: 50,
                limit: 5
              }
            },
            { $addFields: { score: { $meta: 'vectorSearchScore' } } },
            { $project: { _id: 1, documentId: 1, organizationId: 1, content: { $substr: ['$content', 0, 100] }, score: 1 } }
          ];

          // Si se pasó filtro, inyectarlo en $vectorSearch
          if (filter) {
            const first = pipeline[0] as Record<string, unknown>;
            const vs = first['$vectorSearch'] as Record<string, unknown>;
            vs['filter'] = filter;
          }

          const res = await collection.aggregate(pipeline).toArray();
          console.log(`  Resultados: ${res.length}`);
          if (res.length > 0) {
            const t = res[0] as Record<string, unknown>;
            console.log(`  Top score: ${t.score}`);
            console.log(`  Top docId: ${t.documentId}`);
            console.log(`  Top content: ${t.content}...`);
          }
          return res;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`  ERROR: ${msg}`);
          return null;
        }
      }

      // 5.a - Sin filtro (prueba básica)
      await runVectorSearch(null, 'sin filtro');

      // 5.b - Con filtro usando testOrg tal como vino
      await runVectorSearch({ organizationId: { $eq: testOrg } }, 'filtro con testOrg (original)');

      // 5.c - Con filtro usando string
      await runVectorSearch({ organizationId: { $eq: String(testOrg) } }, 'filtro con testOrg como string');

      // 5.d - Si se puede, intentar como ObjectId
      try {
        const asOid = new ObjectId(String(testOrg));
        await runVectorSearch({ organizationId: { $eq: asOid } }, 'filtro con testOrg como ObjectId');
      } catch (e) {
        // no es un ObjectId válido
        console.log('  Nota: testOrg no es convertible a ObjectId válido');
      }

      console.log('\nSi todas las búsquedas devuelven 0 resultados:');
      console.log(' - Verifica que exista el índice "default" en Atlas y que tenga numDimensions correctas');
      console.log(' - Verifica que el campo `embedding` esté poblado y con la misma longitud que espera el índice');
      console.log(' - Verifica tipos (string vs ObjectId) de `organizationId` y usa el tipo correcto en el filtro');

    } catch (searchError: unknown) {
      const msg = searchError instanceof Error ? searchError.message : String(searchError);
      console.log(`\n❌ ERROR EN BÚSQUEDA: ${msg}`);
      if (msg.includes('index')) {
        console.log('\n→ El índice "default" NO existe en MongoDB Atlas.');
        console.log('→ Sigue las instrucciones arriba para crearlo.');
      }
    }

    console.log('\n' + '═'.repeat(50));
    console.log('✅ DIAGNÓSTICO COMPLETADO\n');

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('❌ Error:', msg);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

diagnose();
