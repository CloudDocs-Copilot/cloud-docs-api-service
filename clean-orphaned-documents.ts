/**
 * Script para eliminar documentos huérfanos (registros en MongoDB sin archivo físico)
 *
 * Uso: npx ts-node clean-orphaned-documents.ts
 */

import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config({ path: '.env.example' });
dotenv.config({ path: '.env' });

// Importar modelo de Document
import DocumentModel from './src/models/document.model';

const UPLOADS_BASE = path.join(__dirname, 'uploads');
const STORAGE_BASE = path.join(__dirname, 'storage');

interface OrphanedDocument {
  id: string;
  filename: string;
  originalname: string;
  path: string;
  uploadedAt: Date;
}

/**
 * Verifica si un documento tiene su archivo físico
 */
function fileExists(doc: any): boolean {
  if (!doc.path) {
    return false; // Documento sin path es huérfano
  }

  const relativePath = doc.path.startsWith('/') ? doc.path.substring(1) : doc.path;

  // Buscar en uploads/
  const uploadsPath = path.join(UPLOADS_BASE, relativePath);
  if (fs.existsSync(uploadsPath)) {
    return true;
  }

  // Buscar en storage/
  const storagePath = path.join(STORAGE_BASE, relativePath);
  if (fs.existsSync(storagePath)) {
    return true;
  }

  // Buscar en uploads/obs/ (ruta alternativa)
  const obsPath = path.join(UPLOADS_BASE, 'obs', relativePath);
  if (fs.existsSync(obsPath)) {
    return true;
  }

  return false;
}

/**
 * Encuentra y elimina documentos huérfanos
 */
async function cleanOrphanedDocuments(dryRun: boolean = true) {
  try {
    console.log('🔍 Conectando a MongoDB...');
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/clouddocs';
    await mongoose.connect(mongoUri);
    console.log('✅ Conectado a MongoDB\n');

    console.log('📂 Buscando documentos en la base de datos...');
    const allDocuments = await DocumentModel.find({}).lean();
    console.log(`📊 Total de documentos en MongoDB: ${allDocuments.length}\n`);

    const orphanedDocs: OrphanedDocument[] = [];
    const validDocs: string[] = [];

    console.log('🔎 Verificando existencia de archivos físicos...');
    for (const doc of allDocuments) {
      const exists = fileExists(doc);

      if (!exists) {
        orphanedDocs.push({
          id: doc._id.toString(),
          filename: doc.filename || 'unknown',
          originalname: doc.originalname || doc.filename || 'unknown',
          path: doc.path,
          uploadedAt: doc.uploadedAt
        });
        console.log(`❌ Huérfano: ${doc.originalname || doc.filename} (${doc._id})`);
      } else {
        validDocs.push(doc._id.toString());
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log(`✅ Documentos válidos (con archivo físico): ${validDocs.length}`);
    console.log(`❌ Documentos huérfanos (sin archivo físico): ${orphanedDocs.length}`);
    console.log('='.repeat(80) + '\n');

    if (orphanedDocs.length === 0) {
      console.log('🎉 No se encontraron documentos huérfanos. Todo está limpio!');
      return;
    }

    // Mostrar documentos huérfanos
    console.log('📋 Lista de documentos huérfanos:\n');
    orphanedDocs.forEach((doc, index) => {
      console.log(`${index + 1}. ${doc.originalname}`);
      console.log(`   ID: ${doc.id}`);
      console.log(`   Ruta esperada: ${doc.path}`);
      console.log(`   Subido: ${doc.uploadedAt.toLocaleString()}`);
      console.log('');
    });

    if (dryRun) {
      console.log('⚠️  MODO DRY-RUN: No se eliminará nada.');
      console.log('Para eliminar los documentos huérfanos, ejecuta:');
      console.log('   npx ts-node clean-orphaned-documents.ts --delete\n');
    } else {
      console.log('🗑️  Eliminando documentos huérfanos de MongoDB...');

      const orphanedIds = orphanedDocs.map(doc => new mongoose.Types.ObjectId(doc.id));
      const deleteResult = await DocumentModel.deleteMany({ _id: { $in: orphanedIds } });

      console.log(`✅ Eliminados ${deleteResult.deletedCount} documentos de MongoDB\n`);

      // También eliminar de Elasticsearch si está configurado
      if (process.env.ELASTICSEARCH_NODE) {
        try {
          const { Client } = await import('@elastic/elasticsearch');
          const esClient = new Client({ node: process.env.ELASTICSEARCH_NODE });

          console.log('🔍 Eliminando documentos de Elasticsearch...');
          let esDeletedCount = 0;

          for (const doc of orphanedDocs) {
            try {
              await esClient.delete({
                index: 'documents',
                id: doc.id
              });
              esDeletedCount++;
            } catch (error: any) {
              if (error.meta?.statusCode !== 404) {
                console.log(`   ⚠️  Error eliminando ${doc.id} de ES: ${error.message}`);
              }
            }
          }

          console.log(`✅ Eliminados ${esDeletedCount} documentos de Elasticsearch\n`);
        } catch (error) {
          console.log('⚠️  No se pudo conectar a Elasticsearch (opcional)');
        }
      }

      console.log('🎉 Limpieza completada exitosamente!');
    }
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Desconectado de MongoDB');
  }
}

// Ejecutar script
const isDeleteMode = process.argv.includes('--delete') || process.argv.includes('-d');

console.log('🧹 Script de Limpieza de Documentos Huérfanos\n');

if (isDeleteMode) {
  console.log('⚠️  MODO ELIMINACIÓN: Los documentos huérfanos serán eliminados\n');
} else {
  console.log('ℹ️  MODO ANÁLISIS: Solo se listarán los documentos huérfanos\n');
}

cleanOrphanedDocuments(!isDeleteMode)
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('Error fatal:', error);
    process.exit(1);
  });
