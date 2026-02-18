// Consolidated and professional auth.service unit tests
jest.resetModules();

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
  it('registerUser rejects invalid name or email', async () => {
    const { registerUser } = require('../../../src/services/auth.service');
    await expect(
      registerUser({ name: 'bad<>', email: 'a@b', password: 'P@ssw0rd!' } as any)
    ).rejects.toThrow();
  });

  it('registerUser creates user in test env and returns sanitized object', async () => {
    process.env.NODE_ENV = 'test';
    process.env.SEND_CONFIRMATION_EMAIL = 'false';
    mockBcryptHash.mockResolvedValue('hashed');
    const fakeUser = {
      _id: 'u1',
      email: 'x@y.com',
      name: 'X',
      toJSON: jest.fn(() => ({ _id: 'u1', email: 'x@y.com' }))
    };
    mockUserCreate.mockResolvedValue(fakeUser);
    const { registerUser } = require('../../../src/services/auth.service');
    const res = await registerUser({ name: 'X', email: 'x@y.com', password: 'P@ssw0rd!' });
    expect(mockUserCreate).toHaveBeenCalled();
    expect(res).toHaveProperty('_id');
  });

  it('loginUser handles not found, inactive and bad password', async () => {
    const { loginUser } = require('../../../src/services/auth.service');
    mockUserFindOne.mockResolvedValue(null);
    await expect(loginUser({ email: 'a@b.com', password: 'p' })).rejects.toThrow('User not found');

    mockUserFindOne.mockResolvedValue({
      _id: 'u1',
      email: 'a@b.com',
      password: 'p',
      active: false
    });
    await expect(loginUser({ email: 'a@b.com', password: 'p' })).rejects.toThrow(
      'User account is not active'
    );

    mockUserFindOne.mockResolvedValue({
      _id: 'u1',
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

  it('loginUser returns token and user on success', async () => {
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
    const { loginUser } = require('../../../src/services/auth.service');
    const res = await loginUser({ email: 'a@b.com', password: 'p' });
    expect(res).toHaveProperty('token');
    expect(res.user.email).toBe('a@b.com');
  });

  it('requestPasswordReset and resetPassword flows', async () => {
    process.env.SEND_CONFIRMATION_EMAIL = 'false';
    const saveMock = jest.fn().mockResolvedValue(true);
    mockUserFindOne.mockResolvedValue({
      _id: 'u1',
      name: 'X',
      email: 'a@b.com',
      active: true,
      save: saveMock
    });
    const { requestPasswordReset, resetPassword } = require('../../../src/services/auth.service');
    const token = await requestPasswordReset('a@b.com');
    expect(typeof token).toBe('string');
    expect(saveMock).toHaveBeenCalled();

    mockUserFindOne.mockResolvedValue({ _id: 'u1', tokenVersion: 0, save: saveMock });
    const bcrypt = require('bcryptjs');
    bcrypt.hash.mockResolvedValue('newhash');
    await expect(
      resetPassword({ token: 't', newPassword: 'P@ssw0rd1', confirmPassword: 'P@ssw0rd1' })
    ).resolves.toBeUndefined();
    expect(saveMock).toHaveBeenCalled();
  });

  it('confirmUserAccount handles jwt verify paths', async () => {
    const jwt = require('jsonwebtoken');
    jwt.default = { verify: jest.fn(() => ({ userId: 'u1' })) };
    mockUserFindById.mockResolvedValue({ _id: 'u1', name: 'U', active: true });
    const { confirmUserAccount } = require('../../../src/services/auth.service');
    const res = await confirmUserAccount('token');
    expect(res.userAlreadyActive).toBe(true);
  });

  it('escapeHtml and hashResetToken utilities work', () => {
    const svc = require('../../../src/services/auth.service');
    expect(svc.escapeHtml('<a>"')).toContain('&lt;');
    expect(typeof svc.hashResetToken('t')).toBe('string');
  });
});
