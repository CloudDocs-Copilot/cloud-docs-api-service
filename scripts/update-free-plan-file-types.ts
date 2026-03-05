/**
 * Script de migración: Actualizar tipos de archivo permitidos en plan FREE
 *
 * Actualiza todas las organizaciones con plan FREE para que tengan los nuevos
 * tipos de archivo permitidos (incluyendo imágenes: png, jpg, jpeg, gif, webp, svg, bmp).
 *
 * Este script re-guarda las organizaciones para forzar el hook pre-save que
 * sincroniza los settings.allowedFileTypes con los valores de PLAN_LIMITS.
 */

import mongoose from 'mongoose';
import Organization from '../src/models/organization.model';
import { SubscriptionPlan } from '../src/models/types/organization.types';

async function updateFreePlanFileTypes() {
  try {
    // Conectar a MongoDB
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/clouddocs';
    console.log('🔌 Conectando a MongoDB...', mongoUri);
    await mongoose.connect(mongoUri);
    console.log('✅ Conectado a MongoDB\n');

    // Buscar todas las organizaciones con plan FREE
    const freeOrgs = await Organization.find({ plan: SubscriptionPlan.FREE });

    if (freeOrgs.length === 0) {
      console.log('⚠️  No se encontraron organizaciones con plan FREE');
      return;
    }

    console.log(`📦 Encontradas ${freeOrgs.length} organización(es) con plan FREE\n`);

    // Nuevos tipos permitidos para plan FREE (con imágenes, Excel, PowerPoint y videos)
    const newAllowedTypes = ['pdf', 'txt', 'doc', 'docx', 'ppt', 'pptx', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'xls', 'xlsx', 'mp4', 'webm', 'ogg', 'mov'];

    // Actualizar cada organización
    for (const org of freeOrgs) {
      console.log(`\n🔄 Actualizando: ${org.name} (${org.slug})`);
      console.log(`   Tipos permitidos ANTES: ${org.settings.allowedFileTypes.join(', ')}`);

      // Actualizar directamente los tipos permitidos
      org.settings.allowedFileTypes = newAllowedTypes;
      await org.save();

      // Recargar desde BD para mostrar valores actualizados
      const updatedOrg = await Organization.findById(org._id);
      if (updatedOrg) {
        console.log(`   Tipos permitidos DESPUÉS: ${updatedOrg.settings.allowedFileTypes.join(', ')}`);
        console.log('   ✅ Actualizada correctamente');
      }
    }

    console.log(`\n🎉 ${freeOrgs.length} organización(es) actualizada(s) exitosamente`);
  } catch (error) {
    console.error('❌ Error en migración:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Desconectado de MongoDB');
  }
}

// Ejecutar migración
updateFreePlanFileTypes()
  .then(() => {
    console.log('\n✅ Script completado exitosamente');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n💥 Script falló:', error);
    process.exit(1);
  });
