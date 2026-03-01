import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import * as userService from '../../../src/services/user.service';
import User from '../../../src/models/user.model';
import bcrypt from 'bcryptjs';

describe('UserService Integration Tests', (): void => {
  let mongoServer: MongoMemoryServer;
  let testUserId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Crear usuarios de prueba
    const user1 = await User.create({
      name: 'Test User',
      email: 'test@example.com',
      password: await bcrypt.hash('password123', 10),
      role: 'user',
      active: true
    });
    testUserId = user1._id;

    await User.create({
      name: 'Another User',
      email: 'another@example.com',
      password: await bcrypt.hash('password456', 10),
      role: 'admin',
      active: true
    });
  });

  afterEach(async () => {
    await User.deleteMany({});
  });

  describe('getAllUsers', (): void => {
    it('should return all users', async (): Promise<void> => {
      const users = await userService.getAllUsers();

      expect(users).toHaveLength(2);
      // Verificar que no expone password al convertir a JSON
      const usersJson = users.map(u => u.toJSON());
      expect(usersJson[0]).not.toHaveProperty('password');
      expect(usersJson[1]).not.toHaveProperty('password');
    });

    it('should return empty array when no users exist', async (): Promise<void> => {
      await User.deleteMany({});
      const users = await userService.getAllUsers();

      expect(users).toHaveLength(0);
    });
  });

  describe('setUserActive', (): void => {
    it('should activate a user', async (): Promise<void> => {
      await User.findByIdAndUpdate(testUserId, { active: false });

      const user = await userService.setUserActive(testUserId.toString(), true);

      expect(user.active).toBe(true);
    });

    it('should deactivate a user', async (): Promise<void> => {
      const user = await userService.setUserActive(testUserId.toString(), false);

      expect(user.active).toBe(false);
    });

    it('should throw error when user not found', async (): Promise<void> => {
      const nonExistentId = new mongoose.Types.ObjectId();

      await expect(userService.setUserActive(nonExistentId.toString(), true)).rejects.toThrow(
        'User not found'
      );
    });

    it('should return user without changes if active status is the same', async (): Promise<void> => {
      const user = await userService.setUserActive(testUserId.toString(), true);

      expect(user.active).toBe(true);
    });
  });

  describe('updateUser', (): void => {
    it('should update user name', async (): Promise<void> => {
      const updatedUser = await userService.updateUser(testUserId.toString(), {
        name: 'Updated Name'
      });

      expect(updatedUser.name).toBe('Updated Name');
      expect(updatedUser.email).toBe('test@example.com');
    });

    it('should update user email', async (): Promise<void> => {
      const updatedUser = await userService.updateUser(testUserId.toString(), {
        email: 'newemail@example.com'
      });

      expect(updatedUser.email).toBe('newemail@example.com');
      expect(updatedUser.name).toBe('Test User');
    });

    it('should update both name and email', async (): Promise<void> => {
      const updatedUser = await userService.updateUser(testUserId.toString(), {
        name: 'New Name',
        email: 'new@example.com'
      });

      expect(updatedUser.name).toBe('New Name');
      expect(updatedUser.email).toBe('new@example.com');
    });

    it('should throw error when user not found', async (): Promise<void> => {
      const nonExistentId = new mongoose.Types.ObjectId();

      await expect(
        userService.updateUser(nonExistentId.toString(), { name: 'Test' })
      ).rejects.toThrow('User not found');
    });

    it('should not update password field', async (): Promise<void> => {
      const originalUser = await User.findById(testUserId);
      const originalPassword = originalUser?.password;

      await userService.updateUser(testUserId.toString(), {
        name: 'New Name'
      });

      const updatedUser = await User.findById(testUserId);
      expect(updatedUser?.password).toBe(originalPassword);
    });
  });

  describe('changePassword', (): void => {
    it('should change password successfully', async (): Promise<void> => {
      const result = await userService.changePassword(testUserId.toString(), {
        currentPassword: 'password123',
        newPassword: 'NewStrongP@ss123'
      });

      expect(result).toHaveProperty('message', 'Password updated successfully');

      // Verificar que la contraseña cambió
      const user = await User.findById(testUserId);
      const isValid = await bcrypt.compare('NewStrongP@ss123', user!.password);
      expect(isValid).toBe(true);
    });

    it('should increment tokenVersion when password changes', async (): Promise<void> => {
      const originalUser = await User.findById(testUserId);
      const originalTokenVersion = originalUser?.tokenVersion || 0;

      await userService.changePassword(testUserId.toString(), {
        currentPassword: 'password123',
        newPassword: 'NewStrongP@ss456'
      });

      const updatedUser = await User.findById(testUserId);
      expect(updatedUser?.tokenVersion).toBe(originalTokenVersion + 1);
    });

    it('should update lastPasswordChange timestamp', async (): Promise<void> => {
      const beforeChange = new Date();

      await userService.changePassword(testUserId.toString(), {
        currentPassword: 'password123',
        newPassword: 'NewStrongP@ss789'
      });

      const user = await User.findById(testUserId);
      expect(user?.lastPasswordChange).toBeDefined();
      expect(user?.lastPasswordChange!.getTime()).toBeGreaterThanOrEqual(beforeChange.getTime());
    });

    it('should throw error when current password is incorrect', async (): Promise<void> => {
      await expect(
        userService.changePassword(testUserId.toString(), {
          currentPassword: 'wrongpassword',
          newPassword: 'NewStrongP@ss123'
        })
      ).rejects.toThrow('Current password is incorrect');
    });

    it('should throw error when user not found', async (): Promise<void> => {
      const nonExistentId = new mongoose.Types.ObjectId();

      await expect(
        userService.changePassword(nonExistentId.toString(), {
          currentPassword: 'password123',
          newPassword: 'NewStrongP@ss123'
        })
      ).rejects.toThrow('User not found');
    });

    it('should reject weak passwords', async (): Promise<void> => {
      await expect(
        userService.changePassword(testUserId.toString(), {
          currentPassword: 'password123',
          newPassword: 'weak'
        })
      ).rejects.toThrow();
    });

    it('should reject password without uppercase', async (): Promise<void> => {
      await expect(
        userService.changePassword(testUserId.toString(), {
          currentPassword: 'password123',
          newPassword: 'weakpassword123'
        })
      ).rejects.toThrow();
    });

    it('should reject password without numbers', async (): Promise<void> => {
      await expect(
        userService.changePassword(testUserId.toString(), {
          currentPassword: 'password123',
          newPassword: 'WeakPassword'
        })
      ).rejects.toThrow();
    });
  });

  describe('deleteUser', (): void => {
    it('should delete user successfully', async (): Promise<void> => {
      const deletedUser = await userService.deleteUser(testUserId.toString());

      expect(deletedUser.id).toBe(testUserId.toString());

      const userInDb = await User.findById(testUserId);
      expect(userInDb).toBeNull();
    });

    it('should throw error when user not found', async (): Promise<void> => {
      const nonExistentId = new mongoose.Types.ObjectId();

      await expect(userService.deleteUser(nonExistentId.toString())).rejects.toThrow(
        'User not found'
      );
    });
  });

  describe('updateAvatar', (): void => {
    it('should update avatar URL successfully', async (): Promise<void> => {
      const avatarUrl = 'https://example.com/avatar.jpg';

      const updatedUser = await userService.updateAvatar(testUserId.toString(), {
        avatar: avatarUrl
      });

      expect(updatedUser.avatar).toBe(avatarUrl);
      expect(updatedUser.id).toBe(testUserId.toString());

      // Verificar en base de datos
      const userInDb = await User.findById(testUserId);
      expect(userInDb?.avatar).toBe(avatarUrl);
    });

    it('should update avatar to empty string', async (): Promise<void> => {
      // Primero establecer un avatar
      await User.findByIdAndUpdate(testUserId, { avatar: 'https://example.com/old.jpg' });

      const updatedUser = await userService.updateAvatar(testUserId.toString(), {
        avatar: ''
      });

      expect(updatedUser.avatar).toBe('');
    });

    it('should accept data URLs as avatars', async (): Promise<void> => {
      const dataUrl =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const updatedUser = await userService.updateAvatar(testUserId.toString(), {
        avatar: dataUrl
      });

      expect(updatedUser.avatar).toBe(dataUrl);
    });

    it('should accept relative paths as avatars', async (): Promise<void> => {
      const relativePath = '/uploads/avatars/user123.jpg';

      const updatedUser = await userService.updateAvatar(testUserId.toString(), {
        avatar: relativePath
      });

      expect(updatedUser.avatar).toBe(relativePath);
    });

    it('should throw error when user not found', async (): Promise<void> => {
      const nonExistentId = new mongoose.Types.ObjectId();

      await expect(
        userService.updateAvatar(nonExistentId.toString(), {
          avatar: 'https://example.com/avatar.jpg'
        })
      ).rejects.toThrow('User not found');
    });

    it('should trim whitespace from avatar URL', async (): Promise<void> => {
      const avatarUrl = '  https://example.com/avatar.jpg  ';

      const updatedUser = await userService.updateAvatar(testUserId.toString(), {
        avatar: avatarUrl
      });

      // Mongoose trim debería eliminar espacios
      expect(updatedUser.avatar).toBe('https://example.com/avatar.jpg');
    });

    it('should not affect other user fields', async (): Promise<void> => {
      const originalUser = await User.findById(testUserId);

      await userService.updateAvatar(testUserId.toString(), {
        avatar: 'https://example.com/avatar.jpg'
      });

      const updatedUser = await User.findById(testUserId);
      expect(updatedUser?.name).toBe(originalUser?.name);
      expect(updatedUser?.email).toBe(originalUser?.email);
      expect(updatedUser?.role).toBe(originalUser?.role);
      expect(updatedUser?.active).toBe(originalUser?.active);
      expect(updatedUser?.tokenVersion).toBe(originalUser?.tokenVersion);
    });

    it('should update avatar multiple times', async (): Promise<void> => {
      const url1 = 'https://example.com/avatar1.jpg';
      const url2 = 'https://example.com/avatar2.jpg';
      const url3 = 'https://example.com/avatar3.jpg';

      await userService.updateAvatar(testUserId.toString(), { avatar: url1 });
      let user = await User.findById(testUserId);
      expect(user?.avatar).toBe(url1);

      await userService.updateAvatar(testUserId.toString(), { avatar: url2 });
      user = await User.findById(testUserId);
      expect(user?.avatar).toBe(url2);

      await userService.updateAvatar(testUserId.toString(), { avatar: url3 });
      user = await User.findById(testUserId);
      expect(user?.avatar).toBe(url3);
    });

    it('should handle very long URLs up to 2048 characters', async (): Promise<void> => {
      const longUrl = 'https://example.com/' + 'a'.repeat(2020);

      const updatedUser = await userService.updateAvatar(testUserId.toString(), {
        avatar: longUrl
      });

      expect(updatedUser.avatar).toBe(longUrl);
    });

    it('should fail when URL exceeds 2048 characters', async (): Promise<void> => {
      const tooLongUrl = 'https://example.com/' + 'a'.repeat(2050);

      await expect(
        userService.updateAvatar(testUserId.toString(), {
          avatar: tooLongUrl
        })
      ).rejects.toThrow();
    });

    it('should not expose password in returned user object', async (): Promise<void> => {
      const updatedUser = await userService.updateAvatar(testUserId.toString(), {
        avatar: 'https://example.com/avatar.jpg'
      });

      expect(updatedUser.toJSON()).not.toHaveProperty('password');
    });

    it('should work with special characters in URL', async (): Promise<void> => {
      const specialUrl = 'https://example.com/avatar?user=123&size=large#profile';

      const updatedUser = await userService.updateAvatar(testUserId.toString(), {
        avatar: specialUrl
      });

      expect(updatedUser.avatar).toBe(specialUrl);
    });

    it('should handle concurrent updates correctly', async (): Promise<void> => {
      const promises = [
        userService.updateAvatar(testUserId.toString(), { avatar: 'https://example.com/1.jpg' }),
        userService.updateAvatar(testUserId.toString(), { avatar: 'https://example.com/2.jpg' }),
        userService.updateAvatar(testUserId.toString(), { avatar: 'https://example.com/3.jpg' })
      ];

      await Promise.all(promises);

      const user = await User.findById(testUserId);
      expect(user?.avatar).toMatch(/[123]\.jpg$/);
    });
  });
});
