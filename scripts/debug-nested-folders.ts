import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { config } from 'dotenv';
import DocumentModel from '../src/models/document.model';
import Folder from '../src/models/folder.model';
import Organization from '../src/models/organization.model';

// Load env vars
config();

async function debugNestedFolders() {
  try {
    if (!process.env.MONGO_URI) {
      process.env.MONGO_URI = 'mongodb://localhost:27017/clouddocs';
    }
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Buscar documentos en carpetas anidadas (path con al menos 2 niveles)
    console.log('Buscando documentos en carpetas anidadas...\n');

    const docs = await DocumentModel.find({}).limit(20);

    if (docs.length === 0) {
      console.log('No hay documentos en la base de datos.');
      return;
    }

    console.log(`Analizando ${docs.length} documentos...\n`);

    for (const doc of docs) {
      const pathDepth = doc.path.split('/').filter(p => p).length;
      
      // Solo mostrar documentos en carpetas anidadas (al menos 2 niveles)
      if (pathDepth >= 2) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📄 Documento: ${doc.originalname || doc.filename}`);
        console.log(`   ID: ${doc._id}`);
        console.log(`   Path en BD: "${doc.path}"`);
        console.log(`   Profundidad: ${pathDepth} niveles`);

        const folder = await Folder.findById(doc.folder);
        if (folder) {
          console.log(`   Carpeta: ${folder.name} (${folder.displayName})`);
          console.log(`   Carpeta Path: "${folder.path}"`);
          
          if (folder.parent) {
            const parent = await Folder.findById(folder.parent);
            console.log(`   Carpeta Padre: ${parent?.name} (path: "${parent?.path}")`);
          }
        }

        const org = await Organization.findById(doc.organization);
        const safeSlug = org?.slug.replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
        console.log(`   Org Slug: "${safeSlug}"`);

        // Simular la lógica del controller download (CON SANITIZACIÓN)
        const storageRoot = path.resolve(process.cwd(), 'storage');
        let relativePath = doc.path;
        if (relativePath.startsWith('/')) {
          relativePath = relativePath.substring(1);
        }

        // Sanitize path components (replace spaces and special chars with dashes)
        // to match the physical folder structure
        const pathComponents = relativePath.split('/').filter(p => p).map(component =>
          component.replace(/[^a-z0-9_.-]/gi, '-')
        );
        const sanitizedRelativePath = pathComponents.join('/');

        const hasSlugPrefix = sanitizedRelativePath.startsWith(safeSlug + '/') || sanitizedRelativePath.startsWith(safeSlug + '\\');
        const pathWithSlug = hasSlugPrefix ? sanitizedRelativePath : path.join(safeSlug, sanitizedRelativePath);
        const fullPath = path.join(storageRoot, pathWithSlug);

        console.log(`\n   Construcción de ruta (CON SANITIZACIÓN):`);
        console.log(`   1. relativePath: "${relativePath}"`);
        console.log(`   2. sanitizedRelativePath: "${sanitizedRelativePath}"`);
        console.log(`   3. hasSlugPrefix: ${hasSlugPrefix}`);
        console.log(`   4. pathWithSlug: "${pathWithSlug}"`);
        console.log(`   5. fullPath: "${fullPath}"`);
        console.log(`   6. ¿Existe?: ${fs.existsSync(fullPath) ? '✅ SÍ' : '❌ NO'}`);

        if (!fs.existsSync(fullPath)) {
          // Buscar el archivo en el sistema
          const actualPath = findFileRecursively(storageRoot, doc.filename || '');
          if (actualPath) {
            console.log(`   ⚠️  UBICACIÓN REAL: "${actualPath}"`);
            console.log(`   💡 Discrepancia: El archivo existe pero no en la ruta esperada`);
          } else {
            console.log(`   ⚠️  ARCHIVO NO ENCONTRADO en ningún lugar del storage`);
          }
        }
        console.log('');
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

function findFileRecursively(dir: string, filename: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      const found = findFileRecursively(fullPath, filename);
      if (found) return found;
    } else if (file.name === filename) {
      return fullPath;
    }
  }
  return null;
}

debugNestedFolders();
