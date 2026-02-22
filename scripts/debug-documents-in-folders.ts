/**
 * Script de debug para verificar documentos y sus carpetas asignadas
 * 
 * Uso: npx ts-node scripts/debug-documents-in-folders.ts
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno
dotenv.config({ path: path.join(__dirname, '../.env') });

// Importar modelos
import DocumentModel from '../src/models/document.model';
import Folder from '../src/models/folder.model';

async function debugDocumentsInFolders() {
  try {
    console.log('🔌 Conectando a MongoDB...');
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log('✅ Conectado a MongoDB\n');

    // Obtener todos los documentos
    const documents = await DocumentModel.find()
      .sort({ createdAt: -1 })
      .limit(20); // Últimos 20 documentos

    console.log(`📄 Total de documentos en BD: ${await DocumentModel.countDocuments()}`);
    console.log(`📄 Mostrando últimos ${documents.length} documentos:\n`);

    for (const doc of documents) {
      console.log('─'.repeat(80));
      console.log(`📌 Documento: ${doc.filename}`);
      console.log(`   ID: ${doc._id}`);
      console.log(`   Carpeta (folder field): ${doc.folder || 'NULL/UNDEFINED'}`);
      console.log(`   Tipo de folder: ${typeof doc.folder}`);
      console.log(`   Path: ${doc.path}`);
      console.log(`   Creado: ${doc.createdAt}`);

      // Buscar información de la carpeta
      if (doc.folder) {
        const folder = await Folder.findById(doc.folder);
        if (folder) {
          console.log(`   ✅ Carpeta encontrada: ${folder.name} (${folder.type})`);
          console.log(`      Path carpeta: ${folder.path}`);
          console.log(`      ID carpeta: ${folder._id}`);
        } else {
          console.log(`   ❌ CARPETA NO ENCONTRADA - El folder ID no existe en BD`);
        }
      } else {
        console.log(`   ⚠️  NO TIENE CARPETA ASIGNADA`);
      }
    }

    console.log('\n' + '─'.repeat(80));
    console.log('\n📊 RESUMEN POR CARPETA:\n');

    // Agrupar documentos por carpeta
    const byFolder = await DocumentModel.aggregate([
      {
        $group: {
          _id: '$folder',
          count: { $sum: 1 },
          documents: { $push: '$filename' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    for (const group of byFolder) {
      if (group._id) {
        const folder = await Folder.findById(group._id);
        console.log(`📂 ${folder ? folder.name : 'Carpeta eliminada'} (${group._id})`);
        console.log(`   ${group.count} documento(s): ${group.documents.slice(0, 5).join(', ')}${group.documents.length > 5 ? '...' : ''}`);
      } else {
        console.log(`⚠️  SIN CARPETA (NULL): ${group.count} documento(s)`);
        console.log(`   ${group.documents.slice(0, 5).join(', ')}${group.documents.length > 5 ? '...' : ''}`);
      }
    }

    console.log('\n');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Desconectado de MongoDB');
    process.exit(0);
  }
}

debugDocumentsInFolders();
