/**
 * Script de diagnóstico para verificar el estado de un documento específico
 */
import mongoose from 'mongoose';
import 'dotenv/config';
import Document from '../src/models/document.model';

async function diagnoseDocument() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/clouddocs');
  
  // ID del documento del error en la captura de pantalla
  const docId = '699b4c9aef693f3cab126779';
  
  console.log('🔍 DIAGNÓSTICO DEL DOCUMENTO\n');
  console.log(`Buscando documento: ${docId}`);
  console.log('='.repeat(60));
  
  // Buscar sin ningún filtro
  const doc = await Document.findById(docId).lean();
  
  if (!doc) {
    console.log('\n❌ DOCUMENTO NO ENCONTRADO EN LA BASE DE DATOS');
    await mongoose.disconnect();
    return;
  }
  
  console.log('\n📄 DOCUMENTO ENCONTRADO:');
  console.log('   Nombre:', doc.filename);
  console.log('   ID:', doc._id);
  console.log('   Organización:', doc.organization);
  console.log('');
  console.log('🗑️  ESTADO DE ELIMINACIÓN:');
  console.log('   isDeleted:', doc.isDeleted);
  console.log('   deletedAt:', doc.deletedAt);
  console.log('   deletedBy:', doc.deletedBy);
  console.log('   deletionReason:', doc.deletionReason);
  console.log('   scheduledDeletionDate:', doc.scheduledDeletionDate);
  
  console.log('\n📊 METADATA:');
  console.log('   Tamaño:', doc.size, 'bytes');
  console.log('   MIME Type:', doc.mimeType);
  console.log('   Path:', doc.path);
  console.log('   Subido por:', doc.uploadedBy);
  console.log('   Creado:', doc.createdAt);
  console.log('   Actualizado:', doc.updatedAt);
  
  // Verificar si existe físicamente
  const fs = require('fs');
  const path = require('path');
  const fullPath = path.join(process.cwd(), doc.path);
  const exists = fs.existsSync(fullPath);
  
  console.log('\n💾 ARCHIVO FÍSICO:');
  console.log('   Ruta completa:', fullPath);
  console.log('   Existe:', exists ? '✅ Sí' : '❌ No');
  
  console.log('\n' + '='.repeat(60));
  console.log('CONCLUSIÓN:');
  if (doc.isDeleted) {
    console.log('⚠️  EL DOCUMENTO ESTÁ MARCADO COMO ELIMINADO EN LA BD');
    console.log('   Esto explica el error "Document is already in trash"');
    console.log('\n   Solución: Ejecutar restore-document.ts para restaurarlo');
  } else {
    console.log('✅ EL DOCUMENTO ESTÁ ACTIVO (NO ELIMINADO)');
    console.log('   El error no debería ocurrir. Posible problema de caché.');
    console.log('\n   Solución: Reiniciar el backend (npm run dev)');
  }
  
  await mongoose.disconnect();
}

diagnoseDocument().catch(console.error);
