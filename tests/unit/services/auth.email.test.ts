jest.resetModules();

const mockUserCreateEmail = jest.fn();
const mockSendEmail = jest.fn();
const mockBcryptHashEmail = jest.fn();

jest.mock('../../../src/models/user.model', () => ({
  __esModule: true,
  default: {
    create: mockUserCreateEmail
  }
}));

jest.mock('bcryptjs', () => ({ hash: mockBcryptHashEmail }));

jest.mock('../../../src/mail/emailService', () => ({ sendConfirmationEmail: mockSendEmail }));

jest.mock('fs', () => ({
  readFileSync: jest.fn(() => '<html>{{name}}{{confirmationUrl}}</html>')
}));
jest.mock('path', () => ({ join: jest.fn(() => 'template.html') }));
jest.mock('jsonwebtoken', () => ({ __esModule: true, default: { sign: jest.fn(() => 'tok') } }));

afterEach(() => {
  jest.clearAllMocks();
  delete process.env.SEND_CONFIRMATION_EMAIL;
  delete process.env.NODE_ENV;
});

describe('Auth Service - email branches', () => {
  it('registerUser sends confirmation email when enabled', async () => {
    process.env.SEND_CONFIRMATION_EMAIL = 'true';
    process.env.NODE_ENV = 'production';
    mockBcryptHashEmail.mockResolvedValue('h');
    const fakeUser = {
      _id: 'u1',
      email: 'x@y.com',
      name: 'X',
      toJSON: jest.fn(() => ({ _id: 'u1', email: 'x@y.com' }))
    };
    mockUserCreateEmail.mockResolvedValue(fakeUser);

    const { registerUser } = require('../../../src/services/auth.service');
    const res = await registerUser({ name: 'X', email: 'x@y.com', password: 'P@ssw0rd!' } as any);

    expect(mockUserCreateEmail).toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalled();
    expect(res).toHaveProperty('_id');
  });

  it('registerUser swallows email errors and still returns user', async () => {
    process.env.SEND_CONFIRMATION_EMAIL = 'true';
    process.env.NODE_ENV = 'production';
    mockBcryptHashEmail.mockResolvedValue('h');
    const fakeUser = {
      _id: 'u2',
      email: 'y@z.com',
      name: 'Y',
      toJSON: jest.fn(() => ({ _id: 'u2', email: 'y@z.com' }))
    };
    mockUserCreateEmail.mockResolvedValue(fakeUser);
    mockSendEmail.mockRejectedValue(new Error('SMTP fail'));

    const { registerUser } = require('../../../src/services/auth.service');
    const res = await registerUser({ name: 'Y', email: 'y@z.com', password: 'P@ssw0rd!' } as any);

    expect(mockUserCreateEmail).toHaveBeenCalled();
    expect(res._id).toBe('u2');
  });
});
