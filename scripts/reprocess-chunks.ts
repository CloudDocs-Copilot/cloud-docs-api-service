/**
 * Script para reprocesar chunks de documentos existentes
 *
 * Elimina los chunks actuales y regenera con nueva configuración de chunking.
 * Útil después de cambiar CHUNK_CONFIG (TARGET_WORDS, MAX_WORDS, etc.)
 */

import dotenv from 'dotenv';

// Cargar variables de entorno ANTES de importar módulos que leen env a nivel de módulo
{
  const path = require('path');
  const fs = require('fs');
  const envFiles = ['.env.example', '.env', '.env.local'];
  for (const file of envFiles) {
    const filePath = path.resolve(__dirname, '..', file);
    if (fs.existsSync(filePath)) {
      dotenv.config({ path: filePath, override: true });
    }
  }
}

import mongoose from 'mongoose';
import { Db, Collection } from 'mongodb';
import path from 'path';
import fs from 'fs';
import DocumentModel from '../src/models/document.model';
import { getDb, closeAtlasConnection } from '../src/configurations/database-config/mongoAtlas';
import { documentProcessor } from '../src/services/document-processor.service';
import { textExtractionService } from '../src/services/ai/text-extraction.service';

/**
 * Reprocesa todos los documentos de una organización
 * @param organizationId - ID de la organización (omitir para todas)
 * @param dryRun - Si true, solo muestra lo que haría sin ejecutar
 */
async function reprocessChunks(organizationId?: string, dryRun: boolean = false) {
  try {
    console.log('🔄 Conectando a MongoDB local...');
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/clouddocs');
    console.log('✅ Conectado a MongoDB local');

    let atlasDb: Db | null = null;
    try {
      if (dryRun && (!process.env.MONGO_ATLAS_URI || process.env.MONGO_ATLAS_URI.trim() === '')) {
        console.log('🔎 Dry-run: MONGO_ATLAS_URI not set — skipping Atlas connection');
      } else {
        console.log('🔄 Conectando a MongoDB Atlas...');
        atlasDb = await getDb();
        console.log('✅ Conectado a MongoDB Atlas');
      }
    } catch (err) {
      if (dryRun) {
        console.warn('⚠️  Dry-run: failed to connect to Atlas, continuing without Atlas');
      } else {
        throw err;
      }
    }

    // Construir query de búsqueda
    const query: Record<string, unknown> = {};
    if (organizationId) {
      query.organization = organizationId;
      console.log(`\n🔍 Filtrando por organizationId: ${organizationId}`);
    }

    // Buscar documentos
    console.log('\n📄 Buscando documentos...');
    const documents = await DocumentModel.find(query);
    console.log(`Encontrados ${documents.length} documentos\n`);

    if (documents.length === 0) {
      console.log('⚠️  No hay documentos para reprocesar');
      await cleanup();
      return;
    }

    // Contar chunks existentes
    let existingChunks = 0;
    const chunkQuery: Record<string, unknown> = {};
    if (organizationId) {
      chunkQuery.organizationId = organizationId;
    }
    let chunksCollection: Collection | null = null;
    if (atlasDb) {
      chunksCollection = atlasDb.collection('document_chunks');
      existingChunks = await chunksCollection.countDocuments(chunkQuery);
      console.log(`📊 Chunks existentes: ${existingChunks}\n`);
    } else {
      console.log('📊 Chunks existentes: unknown (Atlas not connected in dry-run)\n');
    }

    if (dryRun) {
      console.log('🔍 DRY RUN - Solo mostrando lo que se haría:\n');
      console.log(`   ❌ Eliminaría ${existingChunks} chunks existentes`);
      console.log(`   ✅ Reprocesaría ${documents.length} documentos`);
      console.log('\nEjecuta sin --dry-run para aplicar los cambios.');
      await cleanup();
      return;
    }

    // Eliminar chunks existentes
    if (existingChunks > 0 && chunksCollection) {
      console.log(`🗑️  Eliminando ${existingChunks} chunks existentes...`);
      const deleteResult = await chunksCollection.deleteMany(chunkQuery);
      console.log(`✅ Eliminados ${deleteResult.deletedCount} chunks\n`);
    }

    // Reprocesar documentos
    console.log('🔄 Reprocesando documentos...\n');
    let processed = 0;
    let errors = 0;
    let totalChunks = 0;

    for (const doc of documents) {
      try {
        console.log(`[${processed + 1}/${documents.length}] Procesando: ${doc.filename}`);

        // Determinar ruta del archivo probando varias ubicaciones comunes
        const candidates: string[] = [];

        if (typeof doc.path === 'string' && doc.path.length > 0) {
          candidates.push(doc.path);
          // if path is absolute but missing root, try relative to repo
          candidates.push(path.join(process.cwd(), doc.path));
          // if path starts with a slash, try under storage
          candidates.push(path.join(process.cwd(), 'storage', doc.path.replace(/^\/+/, '')));
        }

        // common upload dir
        candidates.push(path.join(process.env.UPLOAD_DIR || 'uploads', doc.filename || ''));
        // fallback under storage/orgId/filename
        if (doc.organization) {
          candidates.push(path.join(process.cwd(), 'storage', String(doc.organization), doc.filename || ''));
        }

        // pick the first that exists
        let filePath: string | null = null;
        for (const c of candidates) {
          if (c && fs.existsSync(c)) {
            filePath = c;
            break;
          }
        }

        if (!filePath) {
          console.warn('   ⚠️  Archivo no encontrado en rutas probadas:');
          for (const c of candidates) console.warn(`      - ${c}`);
          errors++;
          continue;
        }

        // Extraer texto del documento según su MIME
        const extraction = await textExtractionService.extractText(filePath, doc.mimeType);

        // Reprocesar documento usando el servicio de procesamiento (acepta texto)
        const result = await documentProcessor.processDocument(
          doc._id.toString(),
          String(doc.organization || ''),
          extraction.text
        );

        processed++;
        totalChunks += result.chunksCreated;
        console.log(`   ✅ Creados ${result.chunksCreated} chunks nuevos\n`);
      } catch (error: unknown) {
        errors++;
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`   ❌ Error: ${msg}\n`);
      }
    }

    // Resumen
    console.log('═══════════════════════════════════════');
    console.log('📊 RESUMEN');
    console.log('═══════════════════════════════════════');
    console.log(`✅ Documentos procesados: ${processed}`);
    console.log(`❌ Errores: ${errors}`);
    console.log(`📦 Chunks creados: ${totalChunks}`);
    console.log(`📄 Total documentos: ${documents.length}`);
    console.log('═══════════════════════════════════════\n');

    // Verificar chunks nuevos
    if (chunksCollection) {
      const newChunks = await chunksCollection.countDocuments(chunkQuery);
      console.log(`✅ Chunks en base de datos: ${newChunks}`);
    } else {
      console.log('✅ Chunks en base de datos: unknown (Atlas not connected in dry-run)');
    }

    await cleanup();
    console.log('\n✅ Proceso completado');
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('❌ Error fatal:', msg);
    if (error instanceof Error && error.stack) console.error(error.stack);
    await cleanup();
    process.exit(1);
  }
}

async function cleanup() {
  try {
    await mongoose.connection.close();
    await closeAtlasConnection();
  } catch (error) {
    console.error('Error en cleanup:', error);
  }
}

// Parse argumentos CLI
const args = process.argv.slice(2);
const organizationId = args.find(arg => !arg.startsWith('--'));
const dryRun = args.includes('--dry-run');

console.log('═══════════════════════════════════════');
console.log('🔄 REPROCESAR CHUNKS DE DOCUMENTOS');
console.log('═══════════════════════════════════════\n');

if (dryRun) {
  console.log('🔍 Modo DRY RUN activado\n');
}

reprocessChunks(organizationId, dryRun);
