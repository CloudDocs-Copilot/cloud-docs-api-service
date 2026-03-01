// Consolidated and professional auth.service unit tests
jest.resetModules();

import mongoose from 'mongoose';

const mockUserCreate = jest.fn();
const mockUserFindOne = jest.fn();
const mockUserFindById = jest.fn();

jest.mock('../../../src/models/user.model', () => ({
  __esModule: true,
  default: {
    create: mockUserCreate,
    findOne: mockUserFindOne,
    findById: mockUserFindById
  }
}));

const mockBcryptHash = jest.fn();
const mockBcryptCompare = jest.fn();
jest.mock('bcryptjs', () => ({ hash: mockBcryptHash, compare: mockBcryptCompare }));

const mockSignToken = jest.fn(() => 'signed-token');
jest.mock('../../../src/services/jwt.service', () => ({ signToken: mockSignToken }));

jest.mock('../../../src/utils/password-validator', () => ({ validatePasswordOrThrow: jest.fn() }));
jest.mock('../../../src/mail/emailService', () => ({ sendConfirmationEmail: jest.fn() }));
jest.mock('jsonwebtoken', () => ({
  __esModule: true,
  default: { verify: jest.fn(), sign: jest.fn() }
}));

afterEach(() => {
  jest.clearAllMocks();
  delete process.env.SEND_CONFIRMATION_EMAIL;
  delete process.env.NODE_ENV;
});

describe('Auth Service (consolidated)', () => {
  it('registerUser rejects invalid name or email', async (): Promise<void> => {
    const { registerUser } = (await import('../../../src/services/auth.service')) as unknown as typeof import('../../../src/services/auth.service');
    type RegisterDto = { name: string; email: string; password: string };
    const payload = { name: 'bad<>', email: 'a@b', password: 'P@ssw0rd!' } as unknown as RegisterDto;
    await expect(registerUser(payload)).rejects.toThrow();
  });

  it('registerUser creates user in test env and returns sanitized object', async (): Promise<void> => {
    process.env.NODE_ENV = 'test';
    process.env.SEND_CONFIRMATION_EMAIL = 'false';
    mockBcryptHash.mockResolvedValue('hashed');
    const id = new mongoose.Types.ObjectId().toString();
    const fakeUser = {
      _id: id,
      email: 'x@y.com',
      name: 'X',
      toJSON: jest.fn(() => ({ _id: id, email: 'x@y.com' }))
    };
    mockUserCreate.mockResolvedValue(fakeUser);
    const { registerUser } = (await import('../../../src/services/auth.service')) as unknown as typeof import('../../../src/services/auth.service');
    const res = await registerUser({ name: 'X', email: 'x@y.com', password: 'P@ssw0rd!' });
    expect(mockUserCreate).toHaveBeenCalled();
    expect(res).toHaveProperty('_id');
  });

  it('loginUser handles not found, inactive and bad password', async () => {
    const { loginUser } = (await import('../../../src/services/auth.service')) as unknown as typeof import('../../../src/services/auth.service');
    mockUserFindOne.mockResolvedValue(null);
    await expect(loginUser({ email: 'a@b.com', password: 'p' })).rejects.toThrow('User not found');

    mockUserFindOne.mockResolvedValue({
      _id: new mongoose.Types.ObjectId().toString(),
      email: 'a@b.com',
      password: 'p',
      active: false
    });
    await expect(loginUser({ email: 'a@b.com', password: 'p' })).rejects.toThrow(
      'User account is not active'
    );

    mockUserFindOne.mockResolvedValue({
      _id: new mongoose.Types.ObjectId().toString(),
      email: 'a@b.com',
      password: 'p',
      active: true,
      role: 'user',
      tokenVersion: 0,
      toJSON: jest.fn(() => ({ email: 'a@b.com' }))
    });
    mockBcryptCompare.mockResolvedValue(false);
    await expect(loginUser({ email: 'a@b.com', password: 'p' })).rejects.toThrow(
      'Invalid password'
    );
  });

  it('loginUser returns token and user on success', async (): Promise<void> => {
    mockUserFindOne.mockResolvedValue({
      _id: 'u1',
      email: 'a@b.com',
      password: 'p',
      active: true,
      role: 'user',
      tokenVersion: 0,
      toJSON: jest.fn(() => ({ email: 'a@b.com' }))
    });
    mockBcryptCompare.mockResolvedValue(true);
    const { loginUser } = (await import('../../../src/services/auth.service')) as unknown as typeof import('../../../src/services/auth.service');
    const res = await loginUser({ email: 'a@b.com', password: 'p' });
    expect(res).toHaveProperty('token');
    expect(res.user.email).toBe('a@b.com');
  });

  it('requestPasswordReset and resetPassword flows', async (): Promise<void> => {
    process.env.SEND_CONFIRMATION_EMAIL = 'false';
    const saveMock = jest.fn().mockResolvedValue(true);
    mockUserFindOne.mockResolvedValue({
      _id: new mongoose.Types.ObjectId().toString(),
      name: 'X',
      email: 'a@b.com',
      active: true,
      save: saveMock
    });
    const { requestPasswordReset, resetPassword } = (await import('../../../src/services/auth.service')) as unknown as typeof import('../../../src/services/auth.service');
    const token = await requestPasswordReset('a@b.com');
    expect(typeof token).toBe('string');
    expect(saveMock).toHaveBeenCalled();

    mockUserFindOne.mockResolvedValue({ _id: new mongoose.Types.ObjectId().toString(), tokenVersion: 0, save: saveMock });
    const bcrypt = jest.requireMock('bcryptjs') as unknown as { hash: jest.Mock };
    bcrypt.hash.mockResolvedValue('newhash');
    await expect(
      resetPassword({ token: 't', newPassword: 'P@ssw0rd1', confirmPassword: 'P@ssw0rd1' })
    ).resolves.toBeUndefined();
    expect(saveMock).toHaveBeenCalled();
  });

  it('confirmUserAccount handles jwt verify paths', async (): Promise<void> => {
    const jwt = jest.requireMock('jsonwebtoken') as unknown as { default: { verify: jest.Mock } };
    jwt.default = { verify: jest.fn(() => ({ userId: 'u1' })) };
    mockUserFindById.mockResolvedValue({ _id: 'u1', name: 'U', active: true });
    const { confirmUserAccount } = (await import('../../../src/services/auth.service')) as unknown as typeof import('../../../src/services/auth.service');
    const res = await confirmUserAccount('token');
    expect(res.userAlreadyActive).toBe(true);
  });

  it('escapeHtml and hashResetToken utilities work', (): void => {
    // Use dynamic import to obtain utilities
    return (async () => {
      const svc = (await import('../../../src/services/auth.service')) as unknown as typeof import('../../../src/services/auth.service');
    expect(svc.escapeHtml('<a>"')).toContain('&lt;');
    expect(typeof svc.hashResetToken('t')).toBe('string');
    })();
  });
});
