jest.resetModules();
jest.unmock('../../../src/mail/emailService');

describe('EmailService (Simple)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.EMAIL_HOST = 'smtp.example.com';
    process.env.EMAIL_PORT = '587';
    process.env.EMAIL_USER = 'sender@example.com';
    process.env.EMAIL_PASS = 'test-password';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('sendConfirmationEmail', (): void => {
    it('should send email successfully', async (): Promise<void> => {
      // Arrange
      jest.mock('nodemailer', () => ({
        createTransport: () => ({
          sendMail: jest.fn().mockResolvedValue({
            messageId: 'test-123',
            accepted: ['test@example.com']
          })
        })
      }));

      const { sendConfirmationEmail } = (await import('../../../src/mail/emailService')) as unknown as typeof import('../../../src/mail/emailService');

      // Act
      const result = await sendConfirmationEmail('test@example.com', 'Test Subject', '<p>Test</p>');

      // Assert
      expect(result).toBeDefined();
      expect(result).toHaveProperty('messageId');
      expect(result.messageId).toBe('test-123');
    });

    it('should call sendMail with correct parameters', async (): Promise<void> => {
      // Arrange
      const mockSendMail: jest.Mock = jest.fn().mockResolvedValue({ messageId: 'test-456' });

      jest.mock('nodemailer', () => ({
        createTransport: () => ({ sendMail: mockSendMail })
      }));

      const { sendConfirmationEmail } = (await import('../../../src/mail/emailService')) as unknown as typeof import('../../../src/mail/emailService');

      // Act
      await sendConfirmationEmail('user@test.com', 'Welcome', '<h1>Hello</h1>');

      // Assert
      expect(mockSendMail).toHaveBeenCalledTimes(1);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@test.com',
          subject: 'Welcome',
          html: '<h1>Hello</h1>'
        })
      );
    });
  });
});
