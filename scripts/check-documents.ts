/**
 * Verificar estado actual de documentos en papelera
 */
import mongoose from 'mongoose';
import 'dotenv/config';
import Document from '../src/models/document.model';

async function checkDocuments() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/clouddocs');
  
  console.log('===== TODOS LOS DOCUMENTOS =====\n');
  
  const allDocs = await Document.find({}).select('_id filename isDeleted deletedAt organization').lean();
  
  console.log(`Total documentos: ${allDocs.length}\n`);
  
  const deleted = allDocs.filter((d: any) => d.isDeleted === true);
  const active = allDocs.filter((d: any) => !d.isDeleted);
  
  console.log(`📁 Documentos ACTIVOS: ${active.length}`);
  active.forEach((doc: any) => {
    console.log(`   - ${doc.filename} (${doc._id})`);
  });
  
  console.log(`\n🗑️  Documentos en PAPELERA: ${deleted.length}`);
  deleted.forEach((doc: any) => {
    console.log(`   - ${doc.filename} (${doc._id})`);
    console.log(`     Org: ${doc.organization}`);
    console.log(`     Eliminado: ${doc.deletedAt}`);
  });
  
  await mongoose.disconnect();
}

checkDocuments().catch(console.error);
