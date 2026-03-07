/**
 * Script de migración: Actualizar displayName de rootFolders con el nombre de la organización
 * 
 * Problema: Los rootFolders creados antes del cambio tienen displayName 'root' 
 * en lugar del nombre de la organización.
 * 
 * Solución: Actualizar todos los rootFolders existentes para usar org.name como displayName
 * 
 * Uso:
 *   npm run ts-node scripts/migrate-root-folder-names.ts           # Dry-run (preview)
 *   npm run ts-node scripts/migrate-root-folder-names.ts --execute # Ejecutar migración
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Folder from '../src/models/folder.model';
import Organization from '../src/models/organization.model';

// Cargar variables de entorno
dotenv.config();

interface MigrationResult {
  success: number;
  failed: number;
  skipped: number;
  errors: Array<{ folderId: string; error: string }>;
}

async function migrateRootFolderNames(execute: boolean = false): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };

  console.log('\n🔍 Buscando rootFolders...\n');

  // Encontrar todos los rootFolders
  const rootFolders = await Folder.find({
    type: 'root',
    parent: null
  }).populate('organization');

  console.log(`📊 Encontrados ${rootFolders.length} rootFolders\n`);

  if (rootFolders.length === 0) {
    console.log('✅ No hay rootFolders para migrar');
    return result;
  }

  // Procesar cada rootFolder
  for (const folder of rootFolders) {
    try {
      // Obtener organización
      const organization = await Organization.findById(folder.organization);
      
      if (!organization) {
        console.log(`⚠️  Folder ${folder._id}: Organización no encontrada (${folder.organization})`);
        result.skipped++;
        continue;
      }

      // Verificar si ya tiene el nombre correcto
      if (folder.displayName === organization.name) {
        console.log(`⏭️  Folder ${folder._id}: displayName ya es correcto ("${organization.name}")`);
        result.skipped++;
        continue;
      }

      // Mostrar cambio
      console.log(`📝 Folder ${folder._id}:`);
      console.log(`   Organización: ${organization.name}`);
      console.log(`   displayName actual: "${folder.displayName}"`);
      console.log(`   displayName nuevo:  "${organization.name}"`);

      if (execute) {
        // Ejecutar actualización
        folder.displayName = organization.name;
        await folder.save();
        console.log(`   ✅ Actualizado\n`);
        result.success++;
      } else {
        console.log(`   🔍 [DRY-RUN] No se ejecutó\n`);
        result.success++;
      }

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      console.error(`❌ Error procesando folder ${folder._id}:`, errorMessage);
      result.failed++;
      result.errors.push({
        folderId: folder._id.toString(),
        error: errorMessage
      });
    }
  }

  return result;
}

async function main(): Promise<void> {
  const execute = process.argv.includes('--execute');
  
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   Migración: Actualizar displayName de rootFolders        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();
  
  if (!execute) {
    console.log('🔍 MODO DRY-RUN (preview)');
    console.log('   No se harán cambios en la base de datos');
    console.log('   Para ejecutar: npm run ts-node scripts/migrate-root-folder-names.ts --execute\n');
  } else {
    console.log('⚠️  MODO EJECUCIÓN');
    console.log('   Se actualizarán los rootFolders en la base de datos\n');
  }

  try {
    // Conectar a MongoDB
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/clouddocs';
    console.log('🔌 Conectando a MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Conectado a MongoDB\n');

    // Ejecutar migración
    const result = await migrateRootFolderNames(execute);

    // Mostrar resultados
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    RESULTADOS                              ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`✅ Éxitos:   ${result.success}`);
    console.log(`⏭️  Omitidos: ${result.skipped}`);
    console.log(`❌ Errores:  ${result.failed}`);
    
    if (result.errors.length > 0) {
      console.log('\n📋 Detalles de errores:');
      result.errors.forEach(({ folderId, error }) => {
        console.log(`   - Folder ${folderId}: ${error}`);
      });
    }

    if (!execute && result.success > 0) {
      console.log('\n💡 Para aplicar los cambios, ejecuta:');
      console.log('   npm run ts-node scripts/migrate-root-folder-names.ts --execute');
    }

    console.log();

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    console.error('\n❌ Error fatal:', errorMessage);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Desconectado de MongoDB');
  }
}

// Ejecutar script
main().catch((error: unknown) => {
  const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
  console.error('Error no manejado:', errorMessage);
  process.exit(1);
});
