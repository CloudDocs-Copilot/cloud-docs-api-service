/**
 * Migration Script: Agregar organizationId a DocumentChunks
 *
 * Este script migra los chunks existentes en MongoDB Atlas añadiendo el campo
 * organizationId que se obtiene del documento padre en MongoDB Local.
 *
 * **Importante:** Este script es necesario para RFE-AI-005 (cross-org security fix)
 *
 * ⚠️ EJECUTAR SOLO UNA VEZ en producción después de actualizar IDocumentChunk
 *
 * Uso:
 *   npx ts-node scripts/migrate-add-org-to-chunks.ts
 */

import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { getDb, closeAtlasConnection } from '../src/configurations/database-config/mongoAtlas';
import DocumentModel from '../src/models/document.model';
import dotenv from 'dotenv';

// Cargar variables de entorno (.env.example → .env → .env.local)
const envFiles = ['.env.example', '.env', '.env.local'];
for (const file of envFiles) {
  const filePath = path.resolve(__dirname, '..', file);
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override: true });
  }
}

const COLLECTION_NAME = 'document_chunks';

interface DocumentChunkMigration {
  _id: mongoose.Types.ObjectId;
  documentId: string;
  organizationId?: string; // Puede no existir aún
}

/**
 * Script principal de migración
 */
async function migrateChunks() {
  console.log('🚀 Iniciando migración de chunks...\n');

  try {
    // 1. Conectar a MongoDB Local (Mongoose)
    console.log('📦 Conectando a MongoDB Local...');
    const mongoLocalUri = process.env.MONGO_URI || 'mongodb://localhost:27017/cloud-docs';
    await mongoose.connect(mongoLocalUri);
    console.log('✅ MongoDB Local conectado\n');

    // 2. Conectar a MongoDB Atlas (driver nativo)
    console.log('☁️  Conectando a MongoDB Atlas...');
    const atlasDb = await getDb();
    const chunksCollection = atlasDb.collection(COLLECTION_NAME);
    console.log('✅ MongoDB Atlas conectado\n');

    // 3. Obtener todos los chunks
    console.log('🔍 Obteniendo chunks a migrar...');
    const chunks = (await chunksCollection
      .find({})
      .project({ _id: 1, documentId: 1, organizationId: 1 })
      .toArray()) as DocumentChunkMigration[];

    console.log(`📊 Total de chunks encontrados: ${chunks.length}`);

    // 4. Filtrar chunks que ya tienen organizationId
    const chunksWithoutOrg: DocumentChunkMigration[] = chunks.filter(
      chunk => !chunk.organizationId
    );
    const chunksWithOrg = chunks.length - chunksWithoutOrg.length;

    console.log(`✅ Chunks ya migrados: ${chunksWithOrg}`);
    console.log(`⏳ Chunks por migrar: ${chunksWithoutOrg.length}\n`);

    if (chunksWithoutOrg.length === 0) {
      console.log('🎉 No hay chunks por migrar. Todo está actualizado.');
      return;
    }

    // 5. Agrupar chunks por documentId para reducir queries
    const chunksByDocument = new Map<string, DocumentChunkMigration[]>();
    chunksWithoutOrg.forEach((chunk: DocumentChunkMigration) => {
      const docId = chunk.documentId;
      if (!chunksByDocument.has(docId)) {
        chunksByDocument.set(docId, []);
      }
      chunksByDocument.get(docId)!.push(chunk);
    });

    console.log(`📁 Documentos únicos a procesar: ${chunksByDocument.size}\n`);

    // 6. Procesar cada documento
    let processedChunks = 0;
    let errors = 0;
    let documentsNotFound = 0;
    let documentsWithoutOrg = 0;

    console.log('🔄 Iniciando migración...\n');

    for (const [documentId, documentChunks] of chunksByDocument) {
      try {
        // Buscar documento en MongoDB Local
        const document = await DocumentModel.findById(documentId)
          .select('organization')
          .lean()
          .exec();

        if (!document) {
          console.warn(
            `⚠️  Documento no encontrado: ${documentId} (${documentChunks.length} chunks)`
          );
          documentsNotFound++;
          continue;
        }

        if (!document.organization) {
          console.warn(
            `⚠️  Documento sin organización: ${documentId} (${documentChunks.length} chunks)`
          );
          documentsWithoutOrg++;
          continue;
        }

        const organizationId = document.organization.toString();

        // Actualizar todos los chunks de este documento
        // Type assertion needed due to BSON ObjectId version mismatch between mongoose and mongodb driver
        const chunkIds = documentChunks.map(c => c._id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await chunksCollection.updateMany(
          { _id: { $in: chunkIds as any } },
          { $set: { organizationId } }
        );

        processedChunks += result.modifiedCount;

        if (result.modifiedCount !== documentChunks.length) {
          console.warn(
            `⚠️  Discrepancia en documento ${documentId}: esperado ${documentChunks.length}, actualizado ${result.modifiedCount}`
          );
        } else {
          console.log(
            `✅ Documento ${documentId.substring(0, 8)}... → ${result.modifiedCount} chunks actualizados (org: ${organizationId.substring(0, 8)}...)`
          );
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`❌ Error procesando documento ${documentId}: ${msg}`);
        errors++;
      }
    }

    // 7. Resumen final
    console.log('\n════════════════════════════════════════════════════');
    console.log('📊 RESUMEN DE MIGRACIÓN');
    console.log('════════════════════════════════════════════════════');
    console.log(`✅ Chunks migrados exitosamente: ${processedChunks}`);
    console.log(`⚠️  Documentos no encontrados: ${documentsNotFound}`);
    console.log(`⚠️  Documentos sin organización: ${documentsWithoutOrg}`);
    console.log(`❌ Errores: ${errors}`);
    console.log('════════════════════════════════════════════════════\n');

    // 8. Verificación post-migración
    console.log('🔍 Verificando migración...');
    const remainingChunksWithoutOrg = await chunksCollection.countDocuments({
      organizationId: { $exists: false }
    });

    if (remainingChunksWithoutOrg === 0) {
      console.log('✅ Migración completada: Todos los chunks tienen organizationId');
    } else {
      console.warn(
        `⚠️  Aún quedan ${remainingChunksWithoutOrg} chunks sin organizationId (probablemente de documentos eliminados)`
      );
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('\n❌ Error fatal en migración:', msg);
    throw error;
  } finally {
    // Cerrar conexiones
    console.log('\n🔌 Cerrando conexiones...');
    await mongoose.disconnect();
    await closeAtlasConnection();
    console.log('✅ Conexiones cerradas');
  }
}

// Ejecutar migración
if (require.main === module) {
  migrateChunks()
    .then(() => {
      console.log('\n✅ Migración finalizada con éxito');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Migración fallida:', error);
      process.exit(1);
    });
}

export default migrateChunks;
