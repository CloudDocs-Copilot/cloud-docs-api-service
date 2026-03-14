jest.resetModules();
jest.unmock('../../../src/mail/emailService');

describe('EmailService (Simple)', () => {
  beforeAll(() => {
    process.env.SENDGRID_API_KEY = 'SG.test-key';
    process.env.EMAIL_USER = 'sender@example.com';
  });

  describe('sendConfirmationEmail', (): void => {
    it('should be a callable async function', async (): Promise<void> => {
      const { sendConfirmationEmail } = (await import('../../../src/mail/emailService')) as Record<
        string,
        unknown
      >;
      expect(typeof sendConfirmationEmail).toBe('function');
    });
  });
});
