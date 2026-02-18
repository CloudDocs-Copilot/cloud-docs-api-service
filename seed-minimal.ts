/* Para crear un idOrganization ejecuta este archivo con los siguientes comandos
 **** MONGO_URI=mongodb://localhost:27017/tu_base_de_datos*****
 **** npx ts-node seed-minimal.ts ****
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Organization, { generateSlug } from './src/models/organization.model';

async function seed() {
  try {
    console.log('🌱 Iniciando Seed...');
    await mongoose.connect(process.env.MONGO_URI || '');

    // 2. Crear Organización Default
    let org = await Organization.findOne({ name: 'Default Eval Corp' });

    if (!org) {
      const ownerId = new mongoose.Types.ObjectId(); // Temporal
      const name = 'Default Eval Corp';
      org = await Organization.create({
        name,
        slug: generateSlug(name), // ✅ Usamos la función aquí
        owner: ownerId,
        active: true,
        settings: { maxUsers: 100 }
      });
      console.log('🏢 Organización creada:', org._id);
    } else {
      console.log('🏢 Organización existente encontrada:', org._id);
    }

    // 3. Imprimir JSON para Postman
    console.log('\n--- DATOS PARA POSTMAN ---');
    console.log('Usa este organizationId en tu registro:');
    console.log(org._id.toString());
    console.log('--------------------------\n');
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

seed();
