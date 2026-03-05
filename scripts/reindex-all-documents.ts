/**
 * Script para re-indexar todos los documentos en Elasticsearch
 * Copia extractedText → extractedContent y re-indexa
 */

import mongoose from 'mongoose';
import DocumentModel from '../src/models/document.model';
import { indexDocument } from '../src/services/search.service';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/clouddocs';

async function reindexAllDocuments() {
  try {
    console.log('🔄 Conectando a MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB conectado\n');

    // Obtener todos los documentos
    const documents = await DocumentModel.find({});
    console.log(`📄 Encontrados ${documents.length} documentos\n`);

    let processed = 0;
    let updated = 0;
    let indexed = 0;
    let errors = 0;

    for (const doc of documents) {
      processed++;
      console.log(`[${processed}/${documents.length}] Procesando ${doc.filename}...`);

      try {
        // Si tiene extractedText pero no extractedContent, copiar
        if (doc.extractedText && !doc.extractedContent) {
          doc.extractedContent = doc.extractedText;
          await doc.save();
          updated++;
          console.log(`  ✅ Copiado extractedText → extractedContent (${doc.extractedText.length} chars)`);
        }

        // Re-indexar en Elasticsearch
        await indexDocument(doc, doc.extractedText || undefined);
        indexed++;
        console.log(`  ✅ Indexado en Elasticsearch`);

      } catch (error: unknown) {
        errors++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`  ❌ Error: ${errorMessage}`);
      }

      console.log('');
    }

    console.log('\n📊 Resumen:');
    console.log(`  Total procesados: ${processed}`);
    console.log(`  Documentos actualizados: ${updated}`);
    console.log(`  Documentos indexados: ${indexed}`);
    console.log(`  Errores: ${errors}`);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error fatal:', errorMessage);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Desconectado de MongoDB');
  }
}

// Ejecutar
reindexAllDocuments()
  .then(() => {
    console.log('\n✅ Re-indexación completa');
    process.exit(0);
  })
  .catch((error: unknown) => {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error:', errorMessage);
    process.exit(1);
  });
