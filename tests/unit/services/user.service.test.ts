// Unit tests for user.service.ts (focus on branches)
jest.resetModules();

const userServiceMockFindById = jest.fn();
const userServiceMockFind = jest.fn();
const userServiceMockFindByIdAndDelete = jest.fn();

jest.mock('../../../src/models/user.model', () => ({
  __esModule: true,
  default: {
    findById: userServiceMockFindById,
    find: userServiceMockFind,
    findByIdAndDelete: userServiceMockFindByIdAndDelete
  }
}));

const userServiceMockBcryptCompare = jest.fn();
const userServiceMockBcryptHash = jest.fn();
jest.mock('bcryptjs', () => ({
  compare: userServiceMockBcryptCompare,
  hash: userServiceMockBcryptHash
}));

jest.mock('../../../src/utils/password-validator', () => ({
  validatePasswordOrThrow: jest.fn()
}));

jest.mock('mongoose', () => ({
  Types: {
    ObjectId: class {
      constructor(id: string) {
        return id;
      }
      static isValid(id: string) {
        return /^[0-9a-fA-F]{24}$/.test(id);
      }
    }
  }
}));

afterEach((): void => {
  jest.clearAllMocks();
});

describe('user.service (unit - branches)', (): void => {
  describe('getUserById', (): void => {
    it('should throw 404 when user not found', async (): Promise<void> => {
      userServiceMockFindById.mockResolvedValue(null);
      const mod = await import('../../../src/services/user.service');
      const { getUserById } = mod;
      await expect(getUserById('507f1f77bcf86cd799439011')).rejects.toThrow('User not found');
    });

    it('should return user when found', async (): Promise<void> => {
      userServiceMockFindById.mockResolvedValue({ _id: 'u1', name: 'Test User' });
      const mod = await import('../../../src/services/user.service');
      const { getUserById } = mod;
      const user = await getUserById('507f1f77bcf86cd799439011');
      expect(user).toBeDefined();
      expect(user.name).toBe('Test User');
    });
  });

  describe('setUserActive', (): void => {
    it('should return user without changes when active state is the same', async (): Promise<void> => {
      const mockUser = { _id: 'u1', active: true, save: jest.fn() };
      userServiceMockFindById.mockResolvedValue(mockUser);

      const mod = await import('../../../src/services/user.service');
      const { setUserActive } = mod;
      const result = await setUserActive('507f1f77bcf86cd799439011', true);

      expect(result).toBe(mockUser);
      expect(mockUser.save).not.toHaveBeenCalled();
    });

    it('should update active state when different', async (): Promise<void> => {
      const saveMock = jest.fn();
      const mockUser = { _id: 'u1', active: false, save: saveMock };
      userServiceMockFindById.mockResolvedValue(mockUser);

      const mod = await import('../../../src/services/user.service');
      const { setUserActive } = mod;
      const result = await setUserActive('507f1f77bcf86cd799439011', true);

      expect(result.active).toBe(true);
      expect(saveMock).toHaveBeenCalled();
    });

    it('should throw 404 when user not found', async (): Promise<void> => {
      userServiceMockFindById.mockResolvedValue(null);
      const mod = await import('../../../src/services/user.service');
      const { setUserActive } = mod;
      await expect(setUserActive('507f1f77bcf86cd799439011', true)).rejects.toThrow(
        'User not found'
      );
    });
  });

  describe('updateUser', (): void => {
    it('should update only name when provided', async (): Promise<void> => {
      const saveMock = jest.fn();
      const mockUser = {
        _id: 'u1',
        name: 'Old Name',
        email: 'old@test.com',
        preferences: {},
        save: saveMock
      };
      userServiceMockFindById.mockResolvedValue(mockUser);

      const mod = await import('../../../src/services/user.service');
      const { updateUser } = mod;
      await updateUser('507f1f77bcf86cd799439011', { name: 'New Name' });

      expect(mockUser.name).toBe('New Name');
      expect(saveMock).toHaveBeenCalled();
    });

    it('should update only email when provided', async (): Promise<void> => {
      const saveMock = jest.fn();
      const mockUser = {
        _id: 'u1',
        name: 'Name',
        email: 'old@test.com',
        preferences: {},
        save: saveMock
      };
      userServiceMockFindById.mockResolvedValue(mockUser);

      const mod = await import('../../../src/services/user.service');
      const { updateUser } = mod;
      await updateUser('507f1f77bcf86cd799439011', { email: 'new@test.com' });

      expect(mockUser.email).toBe('new@test.com');
      expect(saveMock).toHaveBeenCalled();
    });

    it('should update preferences when provided', async (): Promise<void> => {
      const saveMock = jest.fn();
      const mockUser = {
        _id: 'u1',
        name: 'Name',
        email: 'test@test.com',
        preferences: { emailNotifications: false },
        save: saveMock
      };
      userServiceMockFindById.mockResolvedValue(mockUser);

      const mod = await import('../../../src/services/user.service');
      const { updateUser } = mod;
      await updateUser('507f1f77bcf86cd799439011', { preferences: { emailNotifications: true } });

      expect(mockUser.preferences.emailNotifications).toBe(true);
      expect(saveMock).toHaveBeenCalled();
    });

    it('should throw 404 when user not found', async (): Promise<void> => {
      userServiceMockFindById.mockResolvedValue(null);
      const mod = await import('../../../src/services/user.service');
      const { updateUser } = mod;
      await expect(updateUser('507f1f77bcf86cd799439011', { name: 'New' })).rejects.toThrow(
        'User not found'
      );
    });
  });

  describe('changePassword', (): void => {
    it('should throw 401 when current password is incorrect', async (): Promise<void> => {
      userServiceMockFindById.mockResolvedValue({ _id: 'u1', password: 'hashed' });
      userServiceMockBcryptCompare.mockResolvedValue(false);

      const mod = await import('../../../src/services/user.service');
      const { changePassword } = mod;
      await expect(
        changePassword('507f1f77bcf86cd799439011', {
          currentPassword: 'wrong',
          newPassword: 'NewP@ss123'
        })
      ).rejects.toThrow('Current password is incorrect');
    });

    it('should update password and increment tokenVersion on success', async (): Promise<void> => {
      const saveMock = jest.fn();
      const mockUser = { _id: 'u1', password: 'oldhashed', tokenVersion: 5, save: saveMock };
      userServiceMockFindById.mockResolvedValue(mockUser);
      userServiceMockBcryptCompare.mockResolvedValue(true);
      userServiceMockBcryptHash.mockResolvedValue('newhashed');

      const mod = await import('../../../src/services/user.service');
      const { changePassword } = mod;
      const result = await changePassword('507f1f77bcf86cd799439011', {
        currentPassword: 'correct',
        newPassword: 'NewP@ss123'
      });

      expect(mockUser.password).toBe('newhashed');
      expect(mockUser.tokenVersion).toBe(6);
      expect(saveMock).toHaveBeenCalled();
      expect(result.message).toBe('Password updated successfully');
    });

    it('should throw 404 when user not found', async (): Promise<void> => {
      userServiceMockFindById.mockResolvedValue(null);
      const mod = await import('../../../src/services/user.service');
      const { changePassword } = mod;
      await expect(
        changePassword('507f1f77bcf86cd799439011', {
          currentPassword: 'x',
          newPassword: 'NewP@ss123'
        })
      ).rejects.toThrow('User not found');
    });
  });

  describe('deleteUser', (): void => {
    it('should throw 404 when user not found', async (): Promise<void> => {
      userServiceMockFindByIdAndDelete.mockResolvedValue(null);
      const mod = await import('../../../src/services/user.service');
      const { deleteUser } = mod;
      await expect(deleteUser('507f1f77bcf86cd799439011')).rejects.toThrow('User not found');
    });

    it('should delete user when found', async (): Promise<void> => {
      userServiceMockFindByIdAndDelete.mockResolvedValue({ _id: 'u1', name: 'Deleted User' });
      const mod = await import('../../../src/services/user.service');
      const { deleteUser } = mod;
      const result = await deleteUser('507f1f77bcf86cd799439011');
      expect(result).toBeDefined();
      expect(result.name).toBe('Deleted User');
    });
  });

  describe('updateAvatar', (): void => {
    it('should throw 404 when user not found', async (): Promise<void> => {
      userServiceMockFindById.mockResolvedValue(null);
      const mod = await import('../../../src/services/user.service');
      const { updateAvatar } = mod;
      await expect(updateAvatar('507f1f77bcf86cd799439011', { avatar: 'url' })).rejects.toThrow(
        'User not found'
      );
    });

    it('should update avatar when user found', async (): Promise<void> => {
      const saveMock = jest.fn();
      const mockUser = { _id: 'u1', avatar: null, save: saveMock };
      userServiceMockFindById.mockResolvedValue(mockUser);

      const mod = await import('../../../src/services/user.service');
      const { updateAvatar } = mod;
      await updateAvatar('507f1f77bcf86cd799439011', { avatar: 'https://example.com/avatar.jpg' });

      expect(mockUser.avatar).toBe('https://example.com/avatar.jpg');
      expect(saveMock).toHaveBeenCalled();
    });
  });

  describe('findUsersByEmail', (): void => {
    it('should return empty array when email is empty', async (): Promise<void> => {
      const mod = await import('../../../src/services/user.service');
      const { findUsersByEmail } = mod;
      const result = await findUsersByEmail('');
      expect(result).toEqual([]);
    });

    it('should throw 400 on invalid excludeUserId', async (): Promise<void> => {
      const mod = await import('../../../src/services/user.service');
      const { findUsersByEmail } = mod;
      await expect(findUsersByEmail('test@test.com', { excludeUserId: 'invalid' })).rejects.toThrow(
        'Invalid user ID'
      );
    });

    it('should throw 400 on invalid organizationId', async (): Promise<void> => {
      const mod = await import('../../../src/services/user.service');
      const { findUsersByEmail } = mod;
      await expect(
        findUsersByEmail('test@test.com', { organizationId: 'invalid' })
      ).rejects.toThrow('Invalid organization ID');
    });

    it('should find users with valid filters', async (): Promise<void> => {
      const mockExec = jest.fn().mockResolvedValue([{ _id: 'u1', email: 'test@test.com' }]);
      const mockSelect = jest.fn().mockReturnValue({ exec: mockExec });
      const mockLimit = jest.fn().mockReturnValue({ select: mockSelect });
      userServiceMockFind.mockReturnValue({ limit: mockLimit });

      const mod = await import('../../../src/services/user.service');
      const { findUsersByEmail } = mod;
      const result = await findUsersByEmail('test@test.com');

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
