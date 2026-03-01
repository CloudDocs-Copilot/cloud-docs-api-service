/**
 * Script para crear usuario de pruebas E2E
 * Ejecutar con: npx ts-node tests/e2e/seed-e2e-user.ts
 */

import mongoose from 'mongoose';
import * as bcrypt from 'bcryptjs';
import User from '../../src/models/user.model';
import Organization from '../../src/models/organization.model';
import Membership from '../../src/models/membership.model';
import { basicUser } from '../fixtures/user.fixtures';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/clouddocs';

async function seedE2EUser() {
  try {
    await mongoose.connect(MONGO_URI);
    console.warn('✅ Conectado a MongoDB');

    // Verificar si ya existe
    const existing = await User.findOne({ email: basicUser.email });
    if (existing) {
      console.warn(`⚠️  Usuario ${basicUser.email} ya existe`);
      console.warn('   Actualizando contraseña (valor redacted; ver basicUser fixture)');
      
      // Actualizar contraseña
      const hashedPassword = await bcrypt.hash(basicUser.password, 10);
      existing.password = hashedPassword;
      await existing.save();
      
      console.warn(`✅ Contraseña actualizada`);
      console.warn(`   ID: ${existing._id}`);
      
      // Verificar organización
      const membership = await Membership.findOne({ user: existing._id });
      if (membership) {
        const org = await Organization.findById(membership.organization);
        console.warn(`   Organización: ${org?.name} (${org?._id})`);
      }
      
      await mongoose.disconnect();
      return;
    }

    // Crear organización de pruebas
    const organization = new Organization({
      name: 'Test Organization',
      email: basicUser.email,
      planType: 'enterprise',
      allowedMimeTypes: [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'image/png',
        'image/jpeg'
      ]
    });
    await organization.save();
    console.warn(`✅ Organización creada: ${organization.name}`);

    // Hash password
    const hashedPassword = await bcrypt.hash(basicUser.password, 10);

    // Crear usuario
    const user = new User({
      name: basicUser.name,
      email: basicUser.email,
      password: hashedPassword,
      role: 'user',
      verified: true
    });
    await user.save();
    console.warn(`✅ Usuario creado: ${user.email}`);

    // Crear membership (owner de la organización)
    const membership = new Membership({
      user: user._id,
      organization: organization._id,
      role: 'owner',
      status: 'active'
    });
    await membership.save();
    console.warn(`✅ Membership creada: ${user.email} → ${organization.name} (owner)`);

    console.warn('\n📋 Credenciales para tests E2E:');
    console.warn(`   Email: ${basicUser.email}`);
    console.warn('   Password: [REDACTED - see basicUser fixture for test password]');
    console.warn(`   User ID: ${user._id}`);
    console.warn(`   Org ID: ${organization._id}`);

    await mongoose.disconnect();
    console.warn('\n✅ Seed completado');
  } catch (error) {
    if (typeof error === 'object' && error !== null) {
      const e = error as { message?: string };
      console.error('❌ Error en seed:', e.message ?? error);
    } else {
      console.error('❌ Error en seed:', String(error));
    }
    await mongoose.disconnect();
    process.exit(1);
  }
}

seedE2EUser();
