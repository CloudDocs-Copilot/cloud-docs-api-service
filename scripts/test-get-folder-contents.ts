/**
 * Test simple para getFolderContents
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

import * as folderService from '../src/services/folder.service';

async function testGetFolderContents() {
  try {
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log('✅ Conectado a MongoDB\n');

    const folderId = '699aa4e89e7c16275efeba23'; // Carpeta 1
    const userId = '699aa2fd9e7c16275efeb86e'; // Usuario del sistema
    
    console.log(`🔍 Llamando folderService.getFolderContents({`);
    console.log(`     folderId: "${folderId}",`);
    console.log(`     userId: "${userId}"`);
    console.log(`   })\n`);
    
    const result = await folderService.getFolderContents({
      folderId,
      userId
    });
    
    console.log('📂 Resultado de getFolderContents:');
    console.log('   folder:', result.folder?.name);
    console.log('   subfolders:', result.subfolders.length);
    console.log('   documents:', result.documents.length);
    console.log('\n📄 Documentos encontrados:');
    
    result.documents.forEach((doc: any) => {
      console.log(`   - ${doc.filename}`);
      console.log(`     _id: ${doc._id}`);
      console.log(`     folder: ${doc.folder}`);
    });
    
    if (result.documents.length === 0) {
      console.log('\n⚠️  NO SE ENCONTRARON DOCUMENTOS');
      console.log('   Esto podría indicar un problema en la query o permisos');
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

testGetFolderContents();
