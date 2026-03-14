jest.resetModules();
jest.unmock('../../src/mail/emailService');

describe('emailService', (): void => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.SENDGRID_API_KEY = 'SG.test-key-123';
    process.env.EMAIL_USER = 'sender@example.com';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('succeeds when sgMail.send resolves', async (): Promise<void> => {
    const mockSend = jest.fn().mockResolvedValue([{ 
      statusCode: 202, 
      body: {}, 
      headers: {} 
    }]);

    jest.mock('@sendgrid/mail', () => ({
      default: {
        setApiKey: jest.fn(),
        send: mockSend
      }
    }));

    const svc = (await import('../../src/mail/emailService')) as unknown as typeof import('../../src/mail/emailService');
    await expect(
      svc.sendConfirmationEmail('a@b.com', 'subj', '<p>hi</p>')
    ).resolves.toBeDefined();
  });

  it('throws when sgMail.send rejects', async (): Promise<void> => {
    jest.resetModules();
    const mockSend = jest.fn().mockRejectedValue(new Error('API error'));

    jest.mock('@sendgrid/mail', () => ({
      default: {
        setApiKey: jest.fn(),
        send: mockSend
      }
    }));

    const svc = (await import('../../src/mail/emailService')) as unknown as typeof import('../../src/mail/emailService');
    await expect(
      svc.sendConfirmationEmail('a@b.com', 'subj', '<p>hi</p>')
    ).rejects.toThrow('API error');
  });
});
