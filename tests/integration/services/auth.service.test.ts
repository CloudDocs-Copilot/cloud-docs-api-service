import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import * as authService from '../../../src/services/auth.service';
import User from '../../../src/models/user.model';
import Organization from '../../../src/models/organization.model';
import Folder from '../../../src/models/folder.model';
import * as fs from 'fs';
import * as path from 'path';

let mongoServer: MongoMemoryServer;

describe('AuthService Integration Tests', () => {
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
      members: [owner._id],
      settings: {
        maxStoragePerUser: 5368709120, // 5GB
        allowedFileTypes: ['*'],
        maxUsers: 10,
      }
    });

    // Asignar organización al owner
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

    // Limpiar directorios de prueba
    const storageRoot = path.join(process.cwd(), 'storage');
    const orgStoragePath = path.join(storageRoot, testOrgSlug);
    if (fs.existsSync(orgStoragePath)) {
      fs.rmSync(orgStoragePath, { recursive: true, force: true });
    }
  });

  describe('registerUser', () => {
    it('should register a new user with organization', async () => {
      const newUser = await authService.registerUser({
        name: 'John Doe',
        email: 'john@test.com',
        password: 'StrongP@ss123',
        organizationId: testOrgId.toString(),
      });

      expect(newUser).toBeDefined();
      expect(newUser.name).toBe('John Doe');
      expect(newUser.email).toBe('john@test.com');
      expect(newUser.organization).toEqual(testOrgId);
      expect(newUser.password).toBeUndefined(); // No debe exponer la contraseña
      expect(newUser.rootFolder).toBeDefined();
    });

    it('should create user root folder with correct structure', async () => {
      const newUser = await authService.registerUser({
        name: 'Jane Smith',
        email: 'jane@test.com',
        password: 'StrongP@ss456',
        organizationId: testOrgId.toString(),
      });

      const rootFolder = await Folder.findById(newUser.rootFolder);
      
      expect(rootFolder).toBeDefined();
      expect(rootFolder!.type).toBe('root');
      expect(rootFolder!.name).toBe(`root_user_${newUser._id}`);
      expect(rootFolder!.displayName).toBe('Mi Unidad');
      expect(rootFolder!.organization).toEqual(testOrgId);
      expect(rootFolder!.owner).toEqual(newUser._id);
      expect(rootFolder!.parent).toBeNull();
    });

    it('should create physical filesystem directory', async () => {
      const newUser = await authService.registerUser({
        name: 'Test User',
        email: 'test@test.com',
        password: 'StrongP@ss789',
        organizationId: testOrgId.toString(),
      });

      const userStoragePath = path.join(
        process.cwd(),
        'storage',
        testOrgSlug,
        newUser._id!.toString()
      );

      expect(fs.existsSync(userStoragePath)).toBe(true);
      expect(fs.statSync(userStoragePath).isDirectory()).toBe(true);
    });

    it('should add user to organization members', async () => {
      const newUser = await authService.registerUser({
        name: 'Member User',
        email: 'member@test.com',
        password: 'StrongP@ss111',
        organizationId: testOrgId.toString(),
      });

      const org = await Organization.findById(testOrgId);
      const memberIds = org!.members.map((m) => m.toString());
      
      expect(memberIds).toContain(newUser._id!.toString());
    });

    it('should fail if organization does not exist', async () => {
      const fakeOrgId = new mongoose.Types.ObjectId();

      await expect(
        authService.registerUser({
          name: 'Test User',
          email: 'test@test.com',
          password: 'StrongP@ss999',
          organizationId: fakeOrgId.toString(),
        })
      ).rejects.toThrow('Organization not found or inactive');
    });

    it('should fail if organization has reached max users', async () => {
      // Actualizar organización para permitir solo 1 usuario (el owner ya cuenta como 1)
      await Organization.findByIdAndUpdate(testOrgId, {
        'settings.maxUsers': 1,
      });

      // Intentar crear un usuario (debe fallar porque owner ya está activo y cuenta)
      await expect(
        authService.registerUser({
          name: 'User 1',
          email: 'user1@test.com',
          password: 'StrongP@ss111',
          organizationId: testOrgId.toString(),
        })
      ).rejects.toThrow('Organization has reached maximum users limit');
    });

    it('should fail with invalid password', async () => {
      await expect(
        authService.registerUser({
          name: 'Test User',
          email: 'test@test.com',
          password: 'weak',
          organizationId: testOrgId.toString(),
        })
      ).rejects.toThrow();
    });

    it('should fail with invalid email format', async () => {
      await expect(
        authService.registerUser({
          name: 'Test User',
          email: 'invalid-email',
          password: 'StrongP@ss123',
          organizationId: testOrgId.toString(),
        })
      ).rejects.toThrow('Invalid email format');
    });

    it('should fail with invalid name', async () => {
      await expect(
        authService.registerUser({
          name: 'Test@User!',
          email: 'test@test.com',
          password: 'StrongP@ss123',
          organizationId: testOrgId.toString(),
        })
      ).rejects.toThrow('Name must contain only alphanumeric characters');
    });

    it('should fail with invalid organization ID', async () => {
      await expect(
        authService.registerUser({
          name: 'Test User',
          email: 'test@test.com',
          password: 'StrongP@ss123',
          organizationId: 'invalid-id',
        })
      ).rejects.toThrow('Invalid organization ID');
    });
  });

  describe('loginUser', () => {
    beforeEach(async () => {
      // Registrar un usuario de prueba
      await authService.registerUser({
        name: 'Login Test User',
        email: 'login@test.com',
        password: 'StrongP@ss123',
        organizationId: testOrgId.toString(),
      });
    });

    it('should login user with valid credentials', async () => {
      const result = await authService.loginUser({
        email: 'login@test.com',
        password: 'StrongP@ss123',
      });

      expect(result).toBeDefined();
      expect(result.token).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user.email).toBe('login@test.com');
      expect(result.user.password).toBeUndefined(); // No debe exponer contraseña
    });

    it('should fail with incorrect password', async () => {
      await expect(
        authService.loginUser({
          email: 'login@test.com',
          password: 'WrongPassword123',
        })
      ).rejects.toThrow('Invalid password');
    });

    it('should fail with non-existent user', async () => {
      await expect(
        authService.loginUser({
          email: 'nonexistent@test.com',
          password: 'StrongP@ss123',
        })
      ).rejects.toThrow('User not found');
    });

    it('should fail with inactive user', async () => {
      // Desactivar usuario
      await User.findOneAndUpdate(
        { email: 'login@test.com' },
        { active: false }
      );

      await expect(
        authService.loginUser({
          email: 'login@test.com',
          password: 'StrongP@ss123',
        })
      ).rejects.toThrow('User account is not active');
    });

    it('should fail with invalid credentials format', async () => {
      await expect(
        authService.loginUser({
          email: '',
          password: 'StrongP@ss123',
        })
      ).rejects.toThrow('Invalid credentials');
    });
  });
});
