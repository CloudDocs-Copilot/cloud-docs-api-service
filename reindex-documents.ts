/**
 * Script para re-indexar documentos existentes en Elasticsearch
 *
 * Este script toma todos los documentos de MongoDB y los indexa en Elasticsearch.
 * Útil cuando se habilita Elasticsearch después de tener documentos existentes.
 */

import mongoose from 'mongoose';
import DocumentModel from './src/models/document.model';
import { indexDocument } from './src/services/search.service';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config({ path: '.env.example' });
dotenv.config({ path: '.env', override: true });

async function reindexAllDocuments() {
  try {
    console.log('🔄 Conectando a MongoDB...');
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/clouddocs');
    console.log('✅ Conectado a MongoDB');

    console.log('\n🔍 Buscando documentos en MongoDB...');
    const documents = await DocumentModel.find({});
    console.log(`📄 Encontrados ${documents.length} documentos\n`);

    if (documents.length === 0) {
      console.log('⚠️  No hay documentos para indexar');
      process.exit(0);
    }

    let indexed = 0;
    let errors = 0;

    for (const doc of documents) {
      try {
        await indexDocument(doc);
        indexed++;
        console.log(
          `✅ [${indexed}/${documents.length}] Indexado: ${doc.filename || doc.originalname}`
        );
      } catch (error: any) {
        errors++;
        console.error(`❌ Error indexando ${doc.filename}: ${error.message}`);
      }
    }

    console.log(`\n📊 Resumen:`);
    console.log(`   ✅ Indexados exitosamente: ${indexed}`);
    console.log(`   ❌ Errores: ${errors}`);
    console.log(`   📝 Total: ${documents.length}`);

    await mongoose.connection.close();
    console.log('\n✅ Proceso completado');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error fatal:', error.message);
    process.exit(1);
  }
}

reindexAllDocuments();
