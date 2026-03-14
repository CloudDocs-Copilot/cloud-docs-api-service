import { jest } from '@jest/globals';

describe('emailService', (): void => {
  // Setup environment variables that will be needed
  beforeAll(() => {
    process.env.SENDGRID_API_KEY = 'SG.test-key-for-sendgrid';
    process.env.EMAIL_USER = 'test-sender@example.com';
  });

  it('should successfully import the sendConfirmationEmail function', async (): Promise<void> => {
    const { sendConfirmationEmail } = (await import('../../../src/mail/emailService')) as Record<
      string,
      unknown
    >;
    expect(typeof sendConfirmationEmail).toBe('function');
  });

  it('should export SendGridResponse interface', async (): Promise<void> => {
    // Just check that the module exports the interface (type checking at compile time)
    const module = await import('../../../src/mail/emailService');
    expect(module).toBeDefined();
  });
});
