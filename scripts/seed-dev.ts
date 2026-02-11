/**
 * Development Seed Script
 * =======================
 * Populates the local MongoDB with test data for development.
 *
 * Usage:
 *   npx ts-node scripts/seed-dev.ts
 *
 * Or via npm script:
 *   npm run seed:dev
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment files
const envFiles = ['.env.example', '.env', '.env.local'];
for (const file of envFiles) {
  const filePath = path.resolve(process.cwd(), file);
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override: true });
  }
}

// Import models after loading env
import User from '../src/models/user.model';
import Organization from '../src/models/organization.model';
import Folder from '../src/models/folder.model';
import Document from '../src/models/document.model';
import Membership from '../src/models/membership.model';

// =============================================================================
// MOCK DATA CONFIGURATION
// =============================================================================

const BCRYPT_ROUNDS = 10;

/**
 * Test Users
 * Password for all users: Test@1234
 */
const TEST_USERS = [
  {
    name: 'Admin User',
    email: 'admin@clouddocs.local',
    password: 'Test@1234',
    role: 'admin' as const,
    active: true
  },
  {
    name: 'John Developer',
    email: 'john@clouddocs.local',
    password: 'Test@1234',
    role: 'user' as const,
    active: true
  },
  {
    name: 'Jane Designer',
    email: 'jane@clouddocs.local',
    password: 'Test@1234',
    role: 'user' as const,
    active: true
  },
  {
    name: 'Inactive User',
    email: 'inactive@clouddocs.local',
    password: 'Test@1234',
    role: 'user' as const,
    active: false
  }
];

/**
 * Test Organizations with different subscription plans
 */
const TEST_ORGANIZATIONS = [
  {
    name: 'Acme Corporation',
    plan: 'premium' as const,
    maxStorage: 10 * 1024 * 1024 * 1024, // 10GB
    maxMembers: 50
  },
  {
    name: 'Startup Inc',
    plan: 'basic' as const,
    maxStorage: 1 * 1024 * 1024 * 1024, // 1GB
    maxMembers: 10
  },
  {
    name: 'Free Tier Org',
    plan: 'free' as const,
    maxStorage: 100 * 1024 * 1024, // 100MB
    maxMembers: 3
  }
];

/**
 * Sample folder structure for each organization
 */
const FOLDER_STRUCTURE = [
  { name: 'Documents', children: ['Reports', 'Contracts', 'Templates'] },
  { name: 'Images', children: ['Logos', 'Screenshots'] },
  { name: 'Projects', children: ['2024', '2025'] }
];

// =============================================================================
// SEED FUNCTIONS
// =============================================================================

async function clearDatabase(): Promise<void> {
  console.log('🗑️  Clearing existing data...');
  await Promise.all([
    User.deleteMany({}),
    Organization.deleteMany({}),
    Folder.deleteMany({}),
    Document.deleteMany({}),
    Membership.deleteMany({})
  ]);
  console.log('✅ Database cleared');
}

async function createUsers(): Promise<Map<string, mongoose.Types.ObjectId>> {
  console.log('👤 Creating test users...');
  const userMap = new Map<string, mongoose.Types.ObjectId>();

  for (const userData of TEST_USERS) {
    const hashedPassword = await bcrypt.hash(userData.password, BCRYPT_ROUNDS);
    const user = await User.create({
      ...userData,
      password: hashedPassword,
      preferences: {
        theme: 'light',
        language: 'es',
        notifications: true
      }
    });
    userMap.set(userData.email, user._id as mongoose.Types.ObjectId);
    console.log(`   ✓ Created user: ${userData.email}`);
  }

  return userMap;
}

async function createOrganizations(
  userMap: Map<string, mongoose.Types.ObjectId>
): Promise<Map<string, mongoose.Types.ObjectId>> {
  console.log('🏢 Creating test organizations...');
  const orgMap = new Map<string, mongoose.Types.ObjectId>();
  const adminId = userMap.get('admin@clouddocs.local')!;
  const johnId = userMap.get('john@clouddocs.local')!;

  for (let i = 0; i < TEST_ORGANIZATIONS.length; i++) {
    const orgData = TEST_ORGANIZATIONS[i];
    const ownerId = i === 0 ? adminId : johnId; // Admin owns first org

    const org = await Organization.create({
      ...orgData,
      owner: ownerId,
      members: [ownerId],
      storageUsed: 0
    });

    orgMap.set(orgData.name, org._id as mongoose.Types.ObjectId);
    console.log(`   ✓ Created organization: ${orgData.name} (${orgData.plan})`);
  }

  return orgMap;
}

async function createMemberships(
  userMap: Map<string, mongoose.Types.ObjectId>,
  orgMap: Map<string, mongoose.Types.ObjectId>
): Promise<void> {
  console.log('🔗 Creating memberships...');

  const memberships = [
    // Acme Corporation memberships
    { user: 'admin@clouddocs.local', org: 'Acme Corporation', role: 'owner' },
    { user: 'john@clouddocs.local', org: 'Acme Corporation', role: 'admin' },
    { user: 'jane@clouddocs.local', org: 'Acme Corporation', role: 'member' },
    // Startup Inc memberships
    { user: 'john@clouddocs.local', org: 'Startup Inc', role: 'owner' },
    { user: 'jane@clouddocs.local', org: 'Startup Inc', role: 'member' },
    // Free Tier Org memberships
    { user: 'john@clouddocs.local', org: 'Free Tier Org', role: 'owner' }
  ];

  for (const m of memberships) {
    const userId = userMap.get(m.user);
    const orgId = orgMap.get(m.org);

    if (userId && orgId) {
      const org = await Organization.findById(orgId);
      const user = await User.findById(userId);

      // Create root folder for this membership
      const rootFolder = await Folder.create({
        name: `root_${user?.email?.split('@')[0]}_${org?.name?.toLowerCase().replace(/\s+/g, '_')}`,
        displayName: 'Mi Carpeta',
        type: 'root',
        isRoot: true,
        organization: orgId,
        owner: userId,
        parent: null,
        path: `/${org?.name?.toLowerCase().replace(/\s+/g, '-')}/${userId}`,
        permissions: [{ userId: userId, role: 'owner' }]
      });

      await Membership.create({
        user: userId,
        organization: orgId,
        role: m.role,
        joinedAt: new Date(),
        rootFolder: rootFolder._id
      });
      console.log(`   ✓ ${m.user} → ${m.org} (${m.role}) with root folder`);
    }
  }
}

async function createFolders(
  userMap: Map<string, mongoose.Types.ObjectId>,
  orgMap: Map<string, mongoose.Types.ObjectId>
): Promise<void> {
  console.log('📁 Creating folder structure...');

  const adminId = userMap.get('admin@clouddocs.local')!;
  const acmeId = orgMap.get('Acme Corporation')!;

  // Create root folders and subfolders for Acme Corporation
  for (const folderDef of FOLDER_STRUCTURE) {
    // Create parent folder
    const parentFolder = await Folder.create({
      name: folderDef.name,
      owner: adminId,
      organization: acmeId,
      path: `/${folderDef.name}`,
      parent: null
    });
    console.log(`   ✓ Created folder: /${folderDef.name}`);

    // Create children
    for (const childName of folderDef.children) {
      await Folder.create({
        name: childName,
        owner: adminId,
        organization: acmeId,
        path: `/${folderDef.name}/${childName}`,
        parent: parentFolder._id
      });
      console.log(`   ✓ Created folder: /${folderDef.name}/${childName}`);
    }
  }
}

async function createSampleDocuments(
  userMap: Map<string, mongoose.Types.ObjectId>,
  orgMap: Map<string, mongoose.Types.ObjectId>
): Promise<void> {
  console.log('📄 Creating sample documents...');

  const adminId = userMap.get('admin@clouddocs.local')!;
  const johnId = userMap.get('john@clouddocs.local')!;
  const acmeId = orgMap.get('Acme Corporation')!;

  // Find Documents folder
  const docsFolder = await Folder.findOne({
    name: 'Documents',
    organization: acmeId
  });

  const sampleDocs = [
    {
      title: 'Company Handbook',
      filename: 'handbook.pdf',
      mimeType: 'application/pdf',
      size: 1024 * 500, // 500KB
      uploadedBy: adminId
    },
    {
      title: 'Project Roadmap 2025',
      filename: 'roadmap-2025.pdf',
      mimeType: 'application/pdf',
      size: 1024 * 200, // 200KB
      uploadedBy: johnId
    },
    {
      title: 'Meeting Notes',
      filename: 'meeting-notes.txt',
      mimeType: 'text/plain',
      size: 1024 * 10, // 10KB
      uploadedBy: adminId
    }
  ];

  for (const doc of sampleDocs) {
    await Document.create({
      ...doc,
      organization: acmeId,
      folder: docsFolder?._id || null,
      path: `/storage/${acmeId}/${doc.filename}`,
      sharedWith: [],
      isPublic: false
    });
    console.log(`   ✓ Created document: ${doc.title}`);
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/clouddocs';

  console.log('\n🚀 CloudDocs Development Seed Script');
  console.log('=====================================\n');
  console.log(`📡 Connecting to: ${mongoUri}\n`);

  try {
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Run seed operations
    await clearDatabase();
    const userMap = await createUsers();
    const orgMap = await createOrganizations(userMap);
    await createMemberships(userMap, orgMap);
    await createFolders(userMap, orgMap);
    await createSampleDocuments(userMap, orgMap);

    console.log('\n=====================================');
    console.log('✅ Seed completed successfully!\n');
    console.log('📋 Test Accounts:');
    console.log('   Email: admin@clouddocs.local');
    console.log('   Email: john@clouddocs.local');
    console.log('   Email: jane@clouddocs.local');
    console.log('   Password: Test@1234 (for all users)\n');
    console.log('🏢 Organizations:');
    console.log('   - Acme Corporation (PREMIUM)');
    console.log('   - Startup Inc (BASIC)');
    console.log('   - Free Tier Org (FREE)\n');
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('📡 Disconnected from MongoDB');
  }
}

main();
