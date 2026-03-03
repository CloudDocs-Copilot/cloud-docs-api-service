
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { config } from 'dotenv';
import DocumentModel from '../src/models/document.model';
import Folder from '../src/models/folder.model';
import Organization from '../src/models/organization.model';

// Load env vars
config();

async function debugDocument() {
  try {
    if (!process.env.MONGO_URI) {
      // Try default local URI if not set
      process.env.MONGO_URI = 'mongodb://localhost:27017/clouddocs';
    }
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const filename = 'Funciograma TFM.pdf';
    console.log(`Searching for document: "${filename}"...`);

    const docs = await DocumentModel.find({ 
      $or: [
        { filename: { $regex: filename, $options: 'i' } },
        { originalname: { $regex: filename, $options: 'i' } }
      ]
    });

    if (docs.length === 0) {
      console.log('No document found with that name.');
      return;
    }

    console.log(`Found ${docs.length} documents.`);

    for (const doc of docs) {
      console.log('\n------------------------------------------------');
      console.log(`ID: ${doc._id}`);
      console.log(`Filename: ${doc.filename}`);
      console.log(`Original Name: ${doc.originalname}`);
      console.log(`Stored Path: ${doc.path}`);
      console.log(`Folder ID: ${doc.folder}`);
      console.log(`Organization ID: ${doc.organization}`);

      const folder = await Folder.findById(doc.folder);
      console.log(`Folder Path (DB): ${folder?.path}`);
      console.log(`Folder Parent ID: ${folder?.parent}`);
      if (folder?.parent) {
          const parent = await Folder.findById(folder.parent);
          console.log(`Parent Folder Name: ${parent?.name}`);
          console.log(`Parent Folder Path: ${parent?.path}`);
      }

      const org = await Organization.findById(doc.organization);
      console.log(`Org Slug: ${org?.slug}`);

      // Construct expected physical path
      const storageRoot = path.resolve(process.cwd(), 'storage');
      
      // Logic from pre-fix controller
      let relativePath = doc.path;
      if (relativePath.startsWith('/')) relativePath = relativePath.substring(1);
      
      const safeSlug = org?.slug.replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
      
      // Check 1: Direct path
      const path1 = path.join(storageRoot, relativePath);
      // Check 2: With slug prefix (old controller logic)
      const path2 = path.join(storageRoot, safeSlug, relativePath);
      // Check 3: Current logic (smart check)
      let path3 = path2;
      if (relativePath.startsWith(safeSlug + '/') || relativePath.startsWith(safeSlug + '\\')) {
        path3 = path.join(storageRoot, relativePath);
      }

      console.log(`\nChecking physical existence:`);
      console.log(`1. Direct: ${path1} -> ${fs.existsSync(path1) ? 'EXISTS' : 'Encontrado'}`);
      console.log(`2. With Slug: ${path2} -> ${fs.existsSync(path2) ? 'EXISTS' : 'Encontrado'}`);
      console.log(`3. Smart Logic: ${path3} -> ${fs.existsSync(path3) ? 'EXISTS' : 'Encontrado'}`);
      
      if (!fs.existsSync(path3)) {
         // Recursive search in storage to find where it actually is
         const actualPath = findFileRecursively(storageRoot, doc.filename || '');
         if (actualPath) {
             console.log(`\nACTUAL LOCATION FOUND: ${actualPath}`);
         } else {
             console.log(`\nFILE NOT FOUND IN STORAGE TREE.`);
         }
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

debugDocument();
