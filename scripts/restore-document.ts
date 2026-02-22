/**
 * Script para restaurar un documento específico desde la papelera  
 */
import mongoose from 'mongoose';
import 'dotenv/config';
import Document from '../src/models/document.model';

async function restoreDocument() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/clouddocs');
  
  const docId = '699b4c9aef693f3cab126779';
  
  const doc = await Document.findById(docId);
  
  if (!doc) {
    console.log('❌ Documento no encontrado');
    await mongoose.disconnect();
    return;
  }
  
  console.log('📄 Documento antes de restaurar:');
  console.log('   Nombre:', doc.filename);
  console.log('   isDeleted:', doc.isDeleted);
  console.log('   deletedAt:', doc.deletedAt);
  
  // Restaurar usando updateOne para asegurar que los campos se eliminen
  await Document.updateOne(
    { _id: docId },
    {
      $set: { isDeleted: false },
      $unset: {
        deletedAt: '',
        deletedBy: '',
        deletionReason: '',
        scheduledDeletionDate: ''
      }
    }
  );
  
  // Verificar el resultado
  const updated = await Document.findById(docId);
  
  console.log('');
  console.log('✅ Documento restaurado exitosamente');
  console.log('   isDeleted:', updated?.isDeleted);
  console.log('   deletedAt:', updated?.deletedAt);
  console.log('   deletedBy:', updated?.deletedBy);
  
  await mongoose.disconnect();
}

restoreDocument().catch(console.error);
