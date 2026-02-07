import mongoose from 'mongoose';
import Organization from '../src/models/organization.model';
import Membership from '../src/models/membership.model';
import User from '../src/models/user.model';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/clouddocs';

async function verifyMultitenancy() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // 1. Listar todas las organizaciones
    console.log('📋 ORGANIZATIONS:');
    console.log('═'.repeat(80));
    const orgs = await Organization.find({}).select('_id name slug plan owner settings.allowedFileTypes');
    
    for (const org of orgs) {
      console.log(`\n🏢 ${org.name} (${org.slug})`);
      console.log(`   ID: ${org._id}`);
      console.log(`   Plan: ${org.plan}`);
      console.log(`   Owner: ${org.owner}`);
      console.log(`   Allowed File Types: ${org.settings.allowedFileTypes.join(', ')}`);
    }

    // 2. Listar todos los usuarios
    console.log('\n\n👥 USERS:');
    console.log('═'.repeat(80));
    const users = await User.find({}).select('_id email name');
    
    for (const user of users) {
      console.log(`\n👤 ${user.name || 'No name'} (${user.email})`);
      console.log(`   ID: ${user._id}`);
    }

    // 3. Listar todas las memberships (relación usuario-organización)
    console.log('\n\n🔗 MEMBERSHIPS (User ↔ Organization):');
    console.log('═'.repeat(80));
    const memberships = await Membership.find({})
      .populate('user', 'email name')
      .populate('organization', 'name plan');
    
    for (const membership of memberships) {
      const user = membership.user as any;
      const org = membership.organization as any;
      
      console.log(`\n${user?.email || 'Unknown'} → ${org?.name || 'Unknown'}`);
      console.log(`   Role: ${membership.role}`);
      console.log(`   Status: ${membership.status}`);
      console.log(`   Organization Plan: ${org?.plan || 'Unknown'}`);
    }

    // 4. Verificar integridad de multi-tenancy
    console.log('\n\n🔍 MULTI-TENANCY VALIDATION:');
    console.log('═'.repeat(80));
    
    let hasIssues = false;
    
    // Verificar que cada organización tiene un owner válido
    for (const org of orgs) {
      const ownerExists = await User.findById(org.owner);
      if (!ownerExists) {
        console.log(`❌ Organization "${org.name}" has invalid owner: ${org.owner}`);
        hasIssues = true;
      }
      
      // Verificar que el owner tiene membership activa
      const ownerMembership = await Membership.findOne({
        user: org.owner,
        organization: org._id,
        status: 'active'
      });
      
      if (!ownerMembership) {
        console.log(`⚠️  Organization "${org.name}" owner doesn't have active membership`);
        hasIssues = true;
      } else {
        console.log(`✅ Organization "${org.name}" - Owner has active membership (${ownerMembership.role})`);
      }
    }
    
    // Verificar que cada membership tiene user y organization válidos
    const allMemberships = await Membership.find({});
    for (const membership of allMemberships) {
      const userExists = await User.findById(membership.user);
      const orgExists = await Organization.findById(membership.organization);
      
      if (!userExists) {
        console.log(`❌ Membership ${membership._id} has invalid user: ${membership.user}`);
        hasIssues = true;
      }
      
      if (!orgExists) {
        console.log(`❌ Membership ${membership._id} has invalid organization: ${membership.organization}`);
        hasIssues = true;
      }
    }
    
    if (!hasIssues) {
      console.log('\n✅ Multi-tenancy integrity: OK');
    } else {
      console.log('\n⚠️  Multi-tenancy has issues (see above)');
    }

    // 5. Mostrar cómo funciona la validación de planes
    console.log('\n\n📝 PLAN VALIDATION LOGIC:');
    console.log('═'.repeat(80));
    console.log('When a user uploads a file:');
    console.log('1. System gets the active organization from membership');
    console.log('2. Checks organization.settings.allowedFileTypes');
    console.log('3. If plan = ENTERPRISE → allowedFileTypes = ["*"] (all allowed)');
    console.log('4. If plan = FREE/BASIC → only specific types allowed');
    console.log('\nCurrent configuration:');
    
    for (const org of orgs) {
      const canUploadWord = org.settings.allowedFileTypes.includes('*') || 
                           org.settings.allowedFileTypes.includes('.docx');
      console.log(`\n${org.name} (${org.plan}):`);
      console.log(`  Can upload Word: ${canUploadWord ? '✅ YES' : '❌ NO'}`);
      console.log(`  Allowed types: ${org.settings.allowedFileTypes.join(', ')}`);
    }

    await mongoose.disconnect();
    console.log('\n✅ Verification complete!\n');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

verifyMultitenancy();
