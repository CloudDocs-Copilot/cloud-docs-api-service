/**
 * Script de migración: Actualizar organización a plan Enterprise
 *
 * Actualiza la organización de desarrollo a plan Enterprise para permitir
 * todos los tipos de archivo necesarios para preview (US #43).
 */

import mongoose from 'mongoose';
import Organization from '../src/models/organization.model';
import { SubscriptionPlan } from '../src/models/types/organization.types';

async function upgradeToEnterprise() {
  try {
    // Conectar a MongoDB
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/clouddocs';
    console.log('🔌 Conectando a MongoDB...', mongoUri);
    await mongoose.connect(mongoUri);
    console.log('✅ Conectado a MongoDB');

    // Buscar la primera organización (o por slug específico)
    const org = await Organization.findOne({}).sort({ createdAt: 1 });

    if (!org) {
      console.log('⚠️  No se encontró ninguna organización');
      return;
    }

    console.log(`\n📦 Organización encontrada: ${org.name} (${org.slug})`);
    console.log(`   Plan actual: ${org.plan}`);
    console.log(`   Tipos permitidos: ${org.settings.allowedFileTypes.join(', ')}`);

    // Actualizar a Enterprise
    const previousPlan = org.plan;
    org.plan = SubscriptionPlan.ENTERPRISE;
    await org.save(); // El hook pre-save actualizará los settings automáticamente

    console.log(`\n✅ Organización actualizada`);
    console.log(`   ${previousPlan} → ${org.plan}`);
    console.log(`   Tipos permitidos: ${org.settings.allowedFileTypes.join(', ')}`);
    console.log(`   Max file size: ${(org.settings.maxFileSize / 1048576).toFixed(0)}MB`);
    console.log(
      `   Max users: ${org.settings.maxUsers === -1 ? 'ilimitado' : org.settings.maxUsers}`
    );
    console.log(
      `   Storage total: ${org.settings.maxStorageTotal === -1 ? 'ilimitado' : (org.settings.maxStorageTotal / 1073741824).toFixed(0) + 'GB'}`
    );
  } catch (error) {
    console.error('❌ Error en migración:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Desconectado de MongoDB');
  }
}

// Ejecutar migración
upgradeToEnterprise()
  .then(() => {
    console.log('\n🎉 Script completado exitosamente');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n💥 Script falló:', error);
    process.exit(1);
  });
