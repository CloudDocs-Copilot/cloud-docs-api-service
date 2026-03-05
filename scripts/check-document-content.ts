import mongoose from 'mongoose';
import DocumentModel from '../src/models/document.model';

async function checkDocument() {
  try {
    // Conectar a MongoDB
    await mongoose.connect('mongodb://127.0.0.1:27017/clouddocs');
    console.log('📦 MongoDB conectado');

    // Buscar el documento específico
    const docId = '69a7be2e0409d416f240ec52';
    const doc = await DocumentModel.findById(docId);

    if (!doc) {
      console.log('❌ Documento no encontrado');
      return;
    }

    console.log('\n📄 Documento:', docId);
    console.log('  Filename:', doc.filename);
    console.log('  Original:', doc.originalname);
    
    // Verificar extractedText
    console.log('\n🔍 extractedText:');
    if (doc.extractedText) {
      console.log(`  ✅ Existe (${doc.extractedText.length} caracteres)`);
      console.log('  Primeros 200 caracteres:', doc.extractedText.substring(0, 200));
      
      // Verificar si contiene "ibone"
      if (doc.extractedText.toLowerCase().includes('ibone')) {
        console.log('  ✅ Contiene "ibone"');
      } else {
        console.log('  ❌ NO contiene "ibone"');
      }
    } else {
      console.log('  ❌ NO existe o está vacío');
    }

    // Verificar extractedContent
    console.log('\n🔍 extractedContent:');
    if (doc.extractedContent) {
      console.log(`  ✅ Existe (${doc.extractedContent.length} caracteres)`);
      console.log('  Primeros 200 caracteres:', doc.extractedContent.substring(0, 200));
      
      // Verificar si contiene "ibone"
      if (doc.extractedContent.toLowerCase().includes('ibone')) {
        console.log('  ✅ Contiene "ibone"');
      } else {
        console.log('  ❌ NO contiene "ibone"');
      }
    } else {
      console.log('  ❌ NO existe o está vacío');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkDocument();
