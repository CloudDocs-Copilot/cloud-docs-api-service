import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import DocumentModel from '../src/models/document.model';
import { textExtractionService } from '../src/services/ai/text-extraction.service';
import { indexDocument } from '../src/services/search.service';

async function extractAndIndexDocuments() {
  try {
    // Conectar a MongoDB
    await mongoose.connect('mongodb://127.0.0.1:27017/clouddocs');
    console.log('✅ MongoDB conectado\n');

    // Buscar todos los documentos que NO tienen extractedContent
    const documents = await DocumentModel.find({
      $or: [
        { extractedContent: { $exists: false } },
        { extractedContent: '' },
        { extractedContent: null }
      ]
    });

    console.log(`📄 Encontrados ${documents.length} documentos sin contenido extraído\n`);

    const storageBase = process.env.STORAGE_PATH || path.join(process.cwd(), 'storage');
    let processed = 0;
    let extracted = 0;
    let errors = 0;
    let skipped = 0;

    for (const doc of documents) {
      processed++;
      console.log(`[${processed}/${documents.length}] Procesando ${doc.filename}...`);

      try {
        // Construir path sanitizado (igual que en AI job)
        const relativePath = doc.path || '';
        if (!relativePath) {
          console.log('  ⚠️  Sin path, omitiendo');
          skipped++;
          continue;
        }

        // Sanitizar path components
        const pathComponents = relativePath.split('/').filter(p => p);
        const sanitizedComponents = pathComponents.map(component =>
          component.replace(/[^a-z0-9_.-]/gi, '-')
        );
        const sanitizedRelativePath = sanitizedComponents.join(path.sep);
        const absolutePath = path.join(storageBase, sanitizedRelativePath);

        // Verificar que el archivo existe
        if (!fs.existsSync(absolutePath)) {
          console.log(`  ❌ Archivo no encontrado: ${absolutePath}`);
          errors++;
          continue;
        }

        console.log(`  📁 Path: ${absolutePath}`);

        // Extraer texto del archivo
        const extractionResult = await textExtractionService.extractText(absolutePath, doc.mimeType);
        
        const text = extractionResult.text || '';
        if (text.length === 0) {
          console.log('  ⚠️  Contenido vacío después de extracción');
          skipped++;
          continue;
        }

        // Guardar en AMBOS campos
        doc.extractedText = text;
        doc.extractedContent = text;
        await doc.save();

        console.log(`  ✅ Contenido extraído (${text.length} caracteres)`);
        console.log(`  📝 Primeras palabras: ${text.substring(0, 80)}...`);

        // Re-indexar en Elasticsearch
        await indexDocument(doc, text);
        console.log('  ✅ Indexado en Elasticsearch\n');

        extracted++;

      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        console.error(`  ❌ Error: ${errorMessage}\n`);
        errors++;
      }
    }

    console.log('\n📊 Resumen:');
    console.log(`  Total procesados: ${processed}`);
    console.log(`  Contenido extraído: ${extracted}`);
    console.log(`  Omitidos: ${skipped}`);
    console.log(`  Errores: ${errors}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Desconectado de MongoDB');
  }
}

extractAndIndexDocuments();
