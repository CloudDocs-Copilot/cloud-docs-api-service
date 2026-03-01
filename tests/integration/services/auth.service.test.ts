import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import * as authService from '../../../src/services/auth.service';
import * as membershipService from '../../../src/services/membership.service';
import User from '../../../src/models/user.model';
import Organization from '../../../src/models/organization.model';
import Folder from '../../../src/models/folder.model';
import Membership, { MembershipRole, MembershipStatus } from '../../../src/models/membership.model';
import * as fs from 'fs';
import * as path from 'path';

let mongoServer: MongoMemoryServer;

describe('AuthService Integration Tests', (): void => {
  let testOrgId: mongoose.Types.ObjectId;
  let testOrgSlug: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Crear organización de prueba
    const owner = await User.create({
      name: 'Org Owner',
      email: 'owner@test.com',
      password: 'hashedPassword123',
      role: 'admin',
      active: true
    });

    const org = await Organization.create({
      name: 'Test Organization',
      slug: 'test-org',
      owner: owner._id,
      members: [owner._id]
      // Let the pre-save hook set the FREE plan settings
    });

    // Crear membresía para el owner
    await Membership.create({
      user: owner._id,
      organization: org._id,
      role: MembershipRole.OWNER,
      status: MembershipStatus.ACTIVE,
      joinedAt: new Date()
    });

    // Asignar organización activa al owner
    owner.organization = org._id as mongoose.Types.ObjectId;
    await owner.save();

    testOrgId = org._id as mongoose.Types.ObjectId;
    testOrgSlug = org.slug;

    // Crear directorio de organización
    const storageRoot = path.join(process.cwd(), 'storage');
    const orgStoragePath = path.join(storageRoot, testOrgSlug);
    if (!fs.existsSync(orgStoragePath)) {
      fs.mkdirSync(orgStoragePath, { recursive: true });
    }
  });

  afterEach(async () => {
    await User.deleteMany({});
    await Organization.deleteMany({});
    await Folder.deleteMany({});
    await Membership.deleteMany({});

    // Limpiar directorios de prueba
    const storageRoot = path.join(process.cwd(), 'storage');
    const orgStoragePath = path.join(storageRoot, testOrgSlug);
    if (fs.existsSync(orgStoragePath)) {
      try {
        fs.rmSync(orgStoragePath, { recursive: true, force: true });
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'code' in err) {
          const e = err as { code?: string };
          if (e.code === 'ENOTEMPTY' || e.code === 'EBUSY' || e.code === 'EPERM') {
            console.warn('Warning: could not fully remove orgStoragePath during cleanup:', e.code);
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }
    }
  });

  describe('registerUser', (): void => {
    it('should register a new user with organization', async (): Promise<void> => {
      // 1. Registrar usuario sin organización
      const newUser = await authService.registerUser({
        name: 'John Doe',
        email: 'john@test.com',
        password: 'StrongP@ss123'
      });

      expect(newUser).toBeDefined();
      expect(newUser.name).toBe('John Doe');
      expect(newUser.email).toBe('john@test.com');
      expect(newUser.organization).toBeUndefined(); // Usuario sin organización inicialmente
      expect(newUser.password).toBeUndefined(); // No debe exponer la contraseña

      // 2. Agregar usuario a la organización
      await membershipService.createMembership({
        userId: newUser._id!.toString(),
        organizationId: testOrgId.toString(),
        role: MembershipRole.MEMBER
      });

      // 3. Verificar que el usuario ahora tiene organización y rootFolder
      const updatedUser = await User.findById(newUser._id).populate('rootFolder');
      expect(updatedUser!.organization).toEqual(testOrgId);
      expect(updatedUser!.rootFolder).toBeDefined();
    });

    it('should create user root folder with correct structure', async (): Promise<void> => {
      // 1. Registrar usuario
      const newUser = await authService.registerUser({
        name: 'Jane Smith',
        email: 'jane@test.com',
        password: 'StrongP@ss456'
      });

      // 2. Agregar a organización
      await membershipService.createMembership({
        userId: newUser._id!.toString(),
        organizationId: testOrgId.toString(),
        role: MembershipRole.MEMBER
      });

      // 3. Verificar rootFolder
      const updatedUser = await User.findById(newUser._id);
      const rootFolder = await Folder.findById(updatedUser!.rootFolder);

      expect(rootFolder).toBeDefined();
      expect(rootFolder!.type).toBe('root');
      // El nombre ahora incluye el slug de la organización: root_{orgSlug}_{userId}
      expect(rootFolder!.name).toBe(`root_${testOrgSlug}_${newUser._id}`);
      expect(rootFolder!.displayName).toBe('RootFolder');
      expect(rootFolder!.organization).toEqual(testOrgId);
      expect(rootFolder!.owner).toEqual(newUser._id);
      expect(rootFolder!.parent).toBeNull();
    });

    it('should create physical filesystem directory', async (): Promise<void> => {
      // 1. Registrar usuario
      const newUser = await authService.registerUser({
        name: 'Test User',
        email: 'test@test.com',
        password: 'StrongP@ss789'
      });

      // 2. Agregar a organización
      await membershipService.createMembership({
        userId: newUser._id!.toString(),
        organizationId: testOrgId.toString(),
        role: MembershipRole.MEMBER
      });

      // 3. Verificar directorio físico
      const userStoragePath = path.join(
        process.cwd(),
        'storage',
        testOrgSlug,
        newUser._id!.toString()
      );

      expect(fs.existsSync(userStoragePath)).toBe(true);
      expect(fs.statSync(userStoragePath).isDirectory()).toBe(true);
    });

    it('should add user to organization members', async (): Promise<void> => {
      // 1. Registrar usuario
      const newUser = await authService.registerUser({
        name: 'Member User',
        email: 'member@test.com',
        password: 'StrongP@ss111'
      });

      // 2. Agregar a organización
      await membershipService.createMembership({
        userId: newUser._id!.toString(),
        organizationId: testOrgId.toString(),
        role: MembershipRole.MEMBER
      });

      // 3. Verificar membership en base de datos
      const membership = await Membership.findOne({
        user: newUser._id,
        organization: testOrgId,
        status: MembershipStatus.ACTIVE
      });

      expect(membership).toBeDefined();
      expect(membership!.role).toBe(MembershipRole.MEMBER);
    });

    it('should fail if organization does not exist', async (): Promise<void> => {
      // 1. Registrar usuario (esto debe pasar)
      const newUser = await authService.registerUser({
        name: 'Test User',
        email: 'test@test.com',
        password: 'StrongP@ss999'
      });

      // 2. Intentar agregar a organización inexistente (esto debe fallar)
      await expect(
        membershipService.createMembership({
          userId: newUser._id!.toString(),
          organizationId: new mongoose.Types.ObjectId().toString(),
          role: MembershipRole.MEMBER
        })
      ).rejects.toThrow('Organization not found');
    });

    it('should fail if organization has reached max users', async (): Promise<void> => {
      // FREE plan allows max 3 users, create 2 additional users to reach the limit

      // Create first additional user and add to org to use up slot 2
      const user1 = await authService.registerUser({
        name: 'User 1',
        email: 'user1@test.com',
        password: 'StrongP@ss111'
      });
      await membershipService.createMembership({
        userId: user1._id!.toString(),
        organizationId: testOrgId.toString(),
        role: MembershipRole.MEMBER
      });

      // Create second additional user and add to org to use up slot 3 (FREE plan limit)
      const user2 = await authService.registerUser({
        name: 'User 2',
        email: 'user2@test.com',
        password: 'StrongP@ss222'
      });
      await membershipService.createMembership({
        userId: user2._id!.toString(),
        organizationId: testOrgId.toString(),
        role: MembershipRole.MEMBER
      });

      // Try to create third additional user and add to org - should fail (would exceed FREE plan limit of 3)
      const user3 = await authService.registerUser({
        name: 'User 3',
        email: 'user3@test.com',
        password: 'StrongP@ss333'
      });

      await expect(
        membershipService.createMembership({
          userId: user3._id!.toString(),
          organizationId: testOrgId.toString(),
          role: MembershipRole.MEMBER
        })
      ).rejects.toThrow('Organization has reached maximum users limit (3) for free plan');
    });

    it('should fail with invalid password', async (): Promise<void> => {
      await expect(
        authService.registerUser({
          name: 'Test User',
          email: 'test@test.com',
          password: 'weak'
        })
      ).rejects.toThrow();
    });

    it('should fail with invalid email format', async (): Promise<void> => {
      await expect(
        authService.registerUser({
          name: 'Test User',
          email: 'invalid-email',
          password: 'StrongP@ss123'
        })
      ).rejects.toThrow('Invalid email format');
    });

    it('should fail with invalid name', async (): Promise<void> => {
      await expect(
        authService.registerUser({
          name: 'Test@User!',
          email: 'test@test.com',
          password: 'StrongP@ss123'
        })
      ).rejects.toThrow('Name must contain only alphanumeric characters');
    });

    it('should fail with invalid organization ID', async (): Promise<void> => {
      // 1. Registrar usuario (esto debe pasar)
      const newUser = await authService.registerUser({
        name: 'Test User',
        email: 'test@test.com',
        password: 'StrongP@ss123'
      });

      // 2. Intentar agregar a organización con ID inválido (esto debe fallar)
      await expect(
        membershipService.createMembership({
          userId: newUser._id!.toString(),
          organizationId: 'invalid-id',
          role: MembershipRole.MEMBER
        })
      ).rejects.toThrow();
    });
  });

  describe('loginUser', (): void => {
    beforeEach(async () => {
      // Registrar un usuario de prueba
      await authService.registerUser({
        name: 'Login Test User',
        email: 'login@test.com',
        password: 'StrongP@ss123'
      });
    });

    it('should login user with valid credentials', async (): Promise<void> => {
      const result = await authService.loginUser({
        email: 'login@test.com',
        password: 'StrongP@ss123'
      });

      expect(result).toBeDefined();
      expect(result.token).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user.email).toBe('login@test.com');
      expect(result.user.password).toBeUndefined(); // No debe exponer contraseña
    });

    it('should fail with incorrect password', async (): Promise<void> => {
      await expect(
        authService.loginUser({
          email: 'login@test.com',
          password: 'WrongPassword123'
        })
      ).rejects.toThrow('Invalid password');
    });

    it('should fail with non-existent user', async (): Promise<void> => {
      await expect(
        authService.loginUser({
          email: 'nonexistent@test.com',
          password: 'StrongP@ss123'
        })
      ).rejects.toThrow('User not found');
    });

    it('should fail with inactive user', async (): Promise<void> => {
      // Desactivar usuario
      await User.findOneAndUpdate({ email: 'login@test.com' }, { active: false });

      await expect(
        authService.loginUser({
          email: 'login@test.com',
          password: 'StrongP@ss123'
        })
      ).rejects.toThrow('User account is not active');
    });

    it('should fail with invalid credentials format', async (): Promise<void> => {
      await expect(
        authService.loginUser({
          email: '',
          password: 'StrongP@ss123'
        })
      ).rejects.toThrow('Invalid credentials');
    });
  });
});
