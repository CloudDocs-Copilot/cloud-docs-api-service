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

afterEach(() => {
  jest.clearAllMocks();
});

describe('user.service (unit - branches)', () => {
  describe('getUserById', () => {
    it('should throw 404 when user not found', async () => {
      userServiceMockFindById.mockResolvedValue(null);
      const { getUserById } = require('../../../src/services/user.service');
      await expect(getUserById('507f1f77bcf86cd799439011')).rejects.toThrow('User not found');
    });

    it('should return user when found', async () => {
      userServiceMockFindById.mockResolvedValue({ _id: 'u1', name: 'Test User' });
      const { getUserById } = require('../../../src/services/user.service');
      const user = await getUserById('507f1f77bcf86cd799439011');
      expect(user).toBeDefined();
      expect(user.name).toBe('Test User');
    });
  });

  describe('setUserActive', () => {
    it('should return user without changes when active state is the same', async () => {
      const mockUser = { _id: 'u1', active: true, save: jest.fn() };
      userServiceMockFindById.mockResolvedValue(mockUser);
      
      const { setUserActive } = require('../../../src/services/user.service');
      const result = await setUserActive('507f1f77bcf86cd799439011', true);
      
      expect(result).toBe(mockUser);
      expect(mockUser.save).not.toHaveBeenCalled();
    });

    it('should update active state when different', async () => {
      const saveMock = jest.fn();
      const mockUser = { _id: 'u1', active: false, save: saveMock };
      userServiceMockFindById.mockResolvedValue(mockUser);
      
      const { setUserActive } = require('../../../src/services/user.service');
      const result = await setUserActive('507f1f77bcf86cd799439011', true);
      
      expect(result.active).toBe(true);
      expect(saveMock).toHaveBeenCalled();
    });

    it('should throw 404 when user not found', async () => {
      userServiceMockFindById.mockResolvedValue(null);
      const { setUserActive } = require('../../../src/services/user.service');
      await expect(setUserActive('507f1f77bcf86cd799439011', true)).rejects.toThrow('User not found');
    });
  });

  describe('updateUser', () => {
    it('should update only name when provided', async () => {
      const saveMock = jest.fn();
      const mockUser = { _id: 'u1', name: 'Old Name', email: 'old@test.com', preferences: {}, save: saveMock };
      userServiceMockFindById.mockResolvedValue(mockUser);
      
      const { updateUser } = require('../../../src/services/user.service');
      await updateUser('507f1f77bcf86cd799439011', { name: 'New Name' });
      
      expect(mockUser.name).toBe('New Name');
      expect(saveMock).toHaveBeenCalled();
    });

    it('should update only email when provided', async () => {
      const saveMock = jest.fn();
      const mockUser = { _id: 'u1', name: 'Name', email: 'old@test.com', preferences: {}, save: saveMock };
      userServiceMockFindById.mockResolvedValue(mockUser);
      
      const { updateUser } = require('../../../src/services/user.service');
      await updateUser('507f1f77bcf86cd799439011', { email: 'new@test.com' });
      
      expect(mockUser.email).toBe('new@test.com');
      expect(saveMock).toHaveBeenCalled();
    });

    it('should update preferences when provided', async () => {
      const saveMock = jest.fn();
      const mockUser = { 
        _id: 'u1', 
        name: 'Name', 
        email: 'test@test.com', 
        preferences: { emailNotifications: false },
        save: saveMock 
      };
      userServiceMockFindById.mockResolvedValue(mockUser);
      
      const { updateUser } = require('../../../src/services/user.service');
      await updateUser('507f1f77bcf86cd799439011', { preferences: { emailNotifications: true } });
      
      expect(mockUser.preferences.emailNotifications).toBe(true);
      expect(saveMock).toHaveBeenCalled();
    });

    it('should throw 404 when user not found', async () => {
      userServiceMockFindById.mockResolvedValue(null);
      const { updateUser } = require('../../../src/services/user.service');
      await expect(updateUser('507f1f77bcf86cd799439011', { name: 'New' })).rejects.toThrow('User not found');
    });
  });

  describe('changePassword', () => {
    it('should throw 401 when current password is incorrect', async () => {
      userServiceMockFindById.mockResolvedValue({ _id: 'u1', password: 'hashed' });
      userServiceMockBcryptCompare.mockResolvedValue(false);
      
      const { changePassword } = require('../../../src/services/user.service');
      await expect(changePassword('507f1f77bcf86cd799439011', { currentPassword: 'wrong', newPassword: 'NewP@ss123' }))
        .rejects.toThrow('Current password is incorrect');
    });

    it('should update password and increment tokenVersion on success', async () => {
      const saveMock = jest.fn();
      const mockUser = { _id: 'u1', password: 'oldhashed', tokenVersion: 5, save: saveMock };
      userServiceMockFindById.mockResolvedValue(mockUser);
      userServiceMockBcryptCompare.mockResolvedValue(true);
      userServiceMockBcryptHash.mockResolvedValue('newhashed');
      
      const { changePassword } = require('../../../src/services/user.service');
      const result = await changePassword('507f1f77bcf86cd799439011', { currentPassword: 'correct', newPassword: 'NewP@ss123' });
      
      expect(mockUser.password).toBe('newhashed');
      expect(mockUser.tokenVersion).toBe(6);
      expect(saveMock).toHaveBeenCalled();
      expect(result.message).toBe('Password updated successfully');
    });

    it('should throw 404 when user not found', async () => {
      userServiceMockFindById.mockResolvedValue(null);
      const { changePassword } = require('../../../src/services/user.service');
      await expect(changePassword('507f1f77bcf86cd799439011', { currentPassword: 'x', newPassword: 'NewP@ss123' }))
        .rejects.toThrow('User not found');
    });
  });

  describe('deleteUser', () => {
    it('should throw 404 when user not found', async () => {
      userServiceMockFindByIdAndDelete.mockResolvedValue(null);
      const { deleteUser } = require('../../../src/services/user.service');
      await expect(deleteUser('507f1f77bcf86cd799439011')).rejects.toThrow('User not found');
    });

    it('should delete user when found', async () => {
      userServiceMockFindByIdAndDelete.mockResolvedValue({ _id: 'u1', name: 'Deleted User' });
      const { deleteUser } = require('../../../src/services/user.service');
      const result = await deleteUser('507f1f77bcf86cd799439011');
      expect(result).toBeDefined();
      expect(result.name).toBe('Deleted User');
    });
  });

  describe('updateAvatar', () => {
    it('should throw 404 when user not found', async () => {
      userServiceMockFindById.mockResolvedValue(null);
      const { updateAvatar } = require('../../../src/services/user.service');
      await expect(updateAvatar('507f1f77bcf86cd799439011', { avatar: 'url' })).rejects.toThrow('User not found');
    });

    it('should update avatar when user found', async () => {
      const saveMock = jest.fn();
      const mockUser = { _id: 'u1', avatar: null, save: saveMock };
      userServiceMockFindById.mockResolvedValue(mockUser);
      
      const { updateAvatar } = require('../../../src/services/user.service');
      await updateAvatar('507f1f77bcf86cd799439011', { avatar: 'https://example.com/avatar.jpg' });
      
      expect(mockUser.avatar).toBe('https://example.com/avatar.jpg');
      expect(saveMock).toHaveBeenCalled();
    });
  });

  describe('findUsersByEmail', () => {
    it('should return empty array when email is empty', async () => {
      const { findUsersByEmail } = require('../../../src/services/user.service');
      const result = await findUsersByEmail('');
      expect(result).toEqual([]);
    });

    it('should throw 400 on invalid excludeUserId', async () => {
      const { findUsersByEmail } = require('../../../src/services/user.service');
      await expect(findUsersByEmail('test@test.com', { excludeUserId: 'invalid' }))
        .rejects.toThrow('Invalid user ID');
    });

    it('should throw 400 on invalid organizationId', async () => {
      const { findUsersByEmail } = require('../../../src/services/user.service');
      await expect(findUsersByEmail('test@test.com', { organizationId: 'invalid' }))
        .rejects.toThrow('Invalid organization ID');
    });

    it('should find users with valid filters', async () => {
      const mockExec = jest.fn().mockResolvedValue([{ _id: 'u1', email: 'test@test.com' }]);
      const mockSelect = jest.fn().mockReturnValue({ exec: mockExec });
      const mockLimit = jest.fn().mockReturnValue({ select: mockSelect });
      userServiceMockFind.mockReturnValue({ limit: mockLimit });
      
      const { findUsersByEmail } = require('../../../src/services/user.service');
      const result = await findUsersByEmail('test@test.com');
      
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
