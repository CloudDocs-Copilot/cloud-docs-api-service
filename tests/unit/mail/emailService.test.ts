import { jest } from '@jest/globals';

describe('emailService', (): void => {
  const sendMailMock: jest.Mock = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    process.env.EMAIL_USER = 'me@example.com';
    process.env.EMAIL_HOST = 'smtp.example.com';
    process.env.EMAIL_PORT = '587';
    process.env.EMAIL_SECURE = 'false';
    process.env.EMAIL_ALLOW_INSECURE_TLS = 'false';
    sendMailMock.mockReset();
  });

  it('sends an email using nodemailer transport', async (): Promise<void> => {
    jest.resetModules();
    jest.mock('nodemailer', () => ({
      default: { createTransport: jest.fn(() => ({ sendMail: sendMailMock })) },
      createTransport: jest.fn(() => ({ sendMail: sendMailMock }))
    }));
    const { sendConfirmationEmail } = (await import('../../../src/mail/emailService')) as unknown as typeof import('../../../src/mail/emailService');

    sendMailMock.mockResolvedValueOnce({ messageId: 'ok' });

    const res = await sendConfirmationEmail('to@example.com', 'subj', '<b>hi</b>');
    expect(res).toEqual({ messageId: 'ok' });
    const nodemailer = jest.requireMock('nodemailer') as unknown as { createTransport: jest.Mock };
    expect(nodemailer.createTransport).toHaveBeenCalled();
    expect(sendMailMock).toHaveBeenCalledWith({ from: 'me@example.com', to: 'to@example.com', subject: 'subj', html: '<b>hi</b>' });
  });

  it('respects EMAIL_ALLOW_INSECURE_TLS=true', async (): Promise<void> => {
    process.env.EMAIL_ALLOW_INSECURE_TLS = 'true';
    jest.resetModules();
    jest.mock('nodemailer', () => ({
      default: { createTransport: jest.fn((_cfg: unknown) => ({ sendMail: sendMailMock })) },
      createTransport: jest.fn((_cfg: unknown) => ({ sendMail: sendMailMock }))
    }));
    const { sendConfirmationEmail } = (await import('../../../src/mail/emailService')) as unknown as typeof import('../../../src/mail/emailService');
    sendMailMock.mockResolvedValueOnce({ messageId: 'x' });
    await sendConfirmationEmail('a@b', 's', 'h');
    const nodemailer = jest.requireMock('nodemailer') as unknown as { createTransport: jest.Mock };
    const cfg = (nodemailer.createTransport as unknown as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect((cfg.tls as Record<string, unknown>).rejectUnauthorized).toBe(false);
  });

  it('uses secure=true when EMAIL_SECURE=true', async (): Promise<void> => {
    process.env.EMAIL_SECURE = 'true';
    jest.resetModules();
    jest.mock('nodemailer', () => ({
      default: { createTransport: jest.fn((_cfg: unknown) => ({ sendMail: sendMailMock })) },
      createTransport: jest.fn((_cfg: unknown) => ({ sendMail: sendMailMock }))
    }));
    const { sendConfirmationEmail } = (await import('../../../src/mail/emailService')) as unknown as typeof import('../../../src/mail/emailService');
    sendMailMock.mockResolvedValueOnce({});
    await sendConfirmationEmail('a@b', 's', 'h');
    const nodemailer = jest.requireMock('nodemailer') as unknown as { createTransport: jest.Mock };
    const cfg = (nodemailer.createTransport as unknown as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(cfg.secure).toBe(true);
  });

  it('uses secure=true when port is 465', async (): Promise<void> => {
    process.env.EMAIL_PORT = '465';
    process.env.EMAIL_SECURE = 'false';
    jest.resetModules();
    jest.mock('nodemailer', () => ({
      default: { createTransport: jest.fn((_cfg: unknown) => ({ sendMail: sendMailMock })) },
      createTransport: jest.fn((_cfg: unknown) => ({ sendMail: sendMailMock }))
    }));
    const { sendConfirmationEmail } = (await import('../../../src/mail/emailService')) as unknown as typeof import('../../../src/mail/emailService');
    sendMailMock.mockResolvedValueOnce({});
    await sendConfirmationEmail('a@b', 's', 'h');
    const cfgRec = ((jest.requireMock('nodemailer') as unknown as { createTransport: jest.Mock }).createTransport as unknown as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect((cfgRec.secure as boolean)).toBe(true);
  });

  it('throws when transporter.sendMail rejects', async (): Promise<void> => {
    jest.resetModules();
    jest.mock('nodemailer', () => ({
      __esModule: true,
      default: { createTransport: () => ({ sendMail: sendMailMock }) },
      createTransport: () => ({ sendMail: sendMailMock })
    }));
    const _mod = (await import('../../../src/mail/emailService')) as unknown as typeof import('../../../src/mail/emailService');
    const { sendConfirmationEmail } = _mod;
    sendMailMock.mockRejectedValueOnce(new Error('fail'));
    await expect(sendConfirmationEmail('x', 'y', 'z')).rejects.toThrow('fail');
  });

  it('passes correct auth credentials from env', async (): Promise<void> => {
    process.env.EMAIL_USER = 'user1';
    process.env.EMAIL_PASS = 'pass1';
    jest.resetModules();
    let capturedCfg: unknown = null;
    jest.mock('nodemailer', () => ({
      __esModule: true,
      default: { createTransport: (_cfg: unknown) => { capturedCfg = _cfg; return { sendMail: sendMailMock }; } },
      createTransport: (cfg: unknown) => { capturedCfg = cfg; return { sendMail: sendMailMock }; }
    }));
    const _mod2 = (await import('../../../src/mail/emailService')) as unknown as typeof import('../../../src/mail/emailService');
    const { sendConfirmationEmail } = _mod2;
    sendMailMock.mockResolvedValueOnce({});
    await sendConfirmationEmail('to', 's', 'h');
    const cfg = capturedCfg as Record<string, unknown>;
    const auth = cfg.auth as Record<string, unknown>;
    expect(auth.user).toBe('user1');
    expect(auth.pass).toBe('pass1');
  });

  it('supports different ports and host settings', async (): Promise<void> => {
    process.env.EMAIL_PORT = '2525';
    process.env.EMAIL_HOST = 'mail.test';
    jest.resetModules();
    let capturedCfg: unknown = null;
    jest.mock('nodemailer', () => ({
      __esModule: true,
      default: { createTransport: (cfg: unknown) => { capturedCfg = cfg; return { sendMail: sendMailMock }; } },
      createTransport: (cfg: unknown) => { capturedCfg = cfg; return { sendMail: sendMailMock }; }
    }));
    const _mod3 = (await import('../../../src/mail/emailService')) as unknown as typeof import('../../../src/mail/emailService');
    const { sendConfirmationEmail } = _mod3;
    sendMailMock.mockResolvedValueOnce({});
    await sendConfirmationEmail('to', 's', 'h');
    const cfg = capturedCfg as Record<string, unknown>;
    expect(cfg.port).toBe(2525);
    expect(cfg.host).toBe('mail.test');
  });
});
jest.resetModules();
jest.unmock('../../../src/mail/emailService');

describe('Email Service', (): void => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.EMAIL_HOST = 'smtp.example.com';
    process.env.EMAIL_PORT = '587';
    process.env.EMAIL_USER = 'sender@example.com';
    process.env.EMAIL_PASS = 'secret-password';
    process.env.EMAIL_ALLOW_INSECURE_TLS = 'false';
    process.env.EMAIL_SECURE = 'false';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('sendConfirmationEmail', (): void => {
    it('should send email successfully and return message info', async (): Promise<void> => {
      // Arrange
      jest.mock('nodemailer', () => ({
        default: { createTransport: () => ({
          sendMail: jest.fn().mockResolvedValue({
            accepted: ['recipient@example.com'],
            messageId: '<test-id@example.com>'
          })
        }) },
        createTransport: () => ({
          sendMail: jest.fn().mockResolvedValue({
            accepted: ['recipient@example.com'],
            messageId: '<test-id@example.com>'
          })
        })
      }));

      const svc = (await import('../../../src/mail/emailService')) as unknown as typeof import('../../../src/mail/emailService');

      // Act & Assert
      await expect(
        svc.sendConfirmationEmail('recipient@example.com', 'Test', '<p>Test</p>')
      ).resolves.toBeDefined();
    });

    it('should call sendMail with correct parameters', async (): Promise<void> => {
      // Arrange
      const mockSendMail = jest.fn().mockResolvedValue({ accepted: [], messageId: 'test' });
      jest.mock('nodemailer', () => ({
        default: { createTransport: () => ({ sendMail: mockSendMail }) },
        createTransport: () => ({ sendMail: mockSendMail })
      }));

      const svc = (await import('../../../src/mail/emailService')) as unknown as typeof import('../../../src/mail/emailService');

      // Act
      await svc.sendConfirmationEmail('user@test.com', 'Welcome', '<h1>Hello</h1>');

      // Assert
      expect(mockSendMail).toHaveBeenCalledWith({
        from: 'sender@example.com',
        to: 'user@test.com',
        subject: 'Welcome',
        html: '<h1>Hello</h1>'
      });
    });

    it('should use secure TLS by default', async (): Promise<void> => {
      // Arrange
      let capturedConfig: unknown;
      jest.mock('nodemailer', () => ({
        default: { createTransport: (config: unknown) => {
          capturedConfig = config;
          return {sendMail: jest.fn().mockResolvedValue({}) };
        } },
        createTransport: (config: unknown) => {
          capturedConfig = config;
          return {sendMail: jest.fn().mockResolvedValue({}) };
        }
      }));

      const svc = (await import('../../../src/mail/emailService')) as unknown as typeof import('../../../src/mail/emailService');

      // Act
      await svc.sendConfirmationEmail('test@test.com', 'Test', '<p>Test</p>');

      // Assert
      const config = capturedConfig as Record<string, unknown>;
      expect((config.tls as Record<string, unknown>).rejectUnauthorized).toBe(true);
    });

    it('should allow insecure TLS when flag is true', async (): Promise<void> => {
      // Arrange
      jest.resetModules();
      process.env.EMAIL_ALLOW_INSECURE_TLS = 'true';

      let capturedConfig: unknown;
      jest.mock('nodemailer', () => ({
        default: { createTransport: (config: unknown) => {
          capturedConfig = config;
          return { sendMail: jest.fn().mockResolvedValue({}) };
        } },
        createTransport: (config: unknown) => {
          capturedConfig = config;
          return { sendMail: jest.fn().mockResolvedValue({}) };
        }
      }));

      const svc = (await import('../../../src/mail/emailService')) as unknown as typeof import('../../../src/mail/emailService');

      // Act
      await svc.sendConfirmationEmail('test@test.com', 'Test', '<p>Test</p>');

      // Assert
      const config = capturedConfig as Record<string, unknown>;
      expect((config.tls as Record<string, unknown>).rejectUnauthorized).toBe(false);
    });

    it('should set secure true for port 465', async (): Promise<void> => {
      // Arrange
      jest.resetModules();
      process.env.EMAIL_PORT = '465';

      let capturedConfig: unknown;
      jest.mock('nodemailer', () => ({
        default: { createTransport: (config: unknown) => {
          capturedConfig = config;
          return { sendMail: jest.fn().mockResolvedValue({}) };
        } },
        createTransport: (config: unknown) => {
          capturedConfig = config;
          return { sendMail: jest.fn().mockResolvedValue({}) };
        }
      }));

      const svc = (await import('../../../src/mail/emailService')) as unknown as typeof import('../../../src/mail/emailService');

      // Act
      await svc.sendConfirmationEmail('test@test.com', 'Test', '<p>Test</p>');

      // Assert
      const config = capturedConfig as Record<string, unknown>;
      expect(config.port).toBe(465);
      expect(config.secure).toBe(true);
    });

    it('should propagate transporter errors', async (): Promise<void> => {
      // Arrange
      jest.mock('nodemailer', () => ({
        default: { createTransport: () => ({
          sendMail: jest.fn().mockRejectedValue(new Error('SMTP failed'))
        }) },
        createTransport: () => ({
          sendMail: jest.fn().mockRejectedValue(new Error('SMTP failed'))
        })
      }));

      const svc = (await import('../../../src/mail/emailService')) as unknown as typeof import('../../../src/mail/emailService');

      // Act & Assert
      await expect(
        svc.sendConfirmationEmail('test@test.com', 'Test', '<p>Test</p>')
      ).rejects.toThrow('SMTP failed');
    });

    it('should set secure true when EMAIL_SECURE is explicitly true', async (): Promise<void> => {
      // Arrange
      jest.resetModules();
      process.env.EMAIL_SECURE = 'true';

      let capturedConfig: unknown;
      jest.mock('nodemailer', () => ({
        default: { createTransport: (config: unknown) => {
          capturedConfig = config;
          return { sendMail: jest.fn().mockResolvedValue({}) };
        } },
        createTransport: (config: unknown) => {
          capturedConfig = config;
          return { sendMail: jest.fn().mockResolvedValue({}) };
        }
      }));

      const svc = (await import('../../../src/mail/emailService')) as unknown as typeof import('../../../src/mail/emailService');

      // Act
      await svc.sendConfirmationEmail('test@test.com', 'Test', '<p>Test</p>');

      // Assert
      const config = capturedConfig as Record<string, unknown>;
      expect(config.secure).toBe(true);
    });

    it('should use default port 587 when EMAIL_PORT is not set', async (): Promise<void> => {
      // Arrange
      jest.resetModules();
      delete process.env.EMAIL_PORT;

      let capturedConfig: unknown;
      jest.mock('nodemailer', () => ({
        createTransport: (config: unknown) => {
          capturedConfig = config;
          return { sendMail: jest.fn().mockResolvedValue({}) };
        }
      }));

      const svc = (await import('../../../src/mail/emailService')) as unknown as typeof import('../../../src/mail/emailService');

      // Act
      await svc.sendConfirmationEmail('test@test.com', 'Test', '<p>Test</p>');

      // Assert
      const config = capturedConfig as Record<string, unknown>;
      expect(config.port).toBe(587);
    });

    it('should handle authentication errors', async (): Promise<void> => {
      // Arrange
      jest.mock('nodemailer', () => ({
        default: { createTransport: () => ({
          sendMail: jest.fn().mockRejectedValue(
            new Error('Invalid login: 535 Authentication failed')
          )
        }) },
        createTransport: () => ({
          sendMail: jest.fn().mockRejectedValue(
            new Error('Invalid login: 535 Authentication failed')
          )
        })
      }));

      const svc = (await import('../../../src/mail/emailService')) as unknown as typeof import('../../../src/mail/emailService');

      // Act & Assert
      await expect(
        svc.sendConfirmationEmail('test@test.com', 'Test', '<p>Test</p>')
      ).rejects.toThrow('Invalid login');
    });

    it('should send email with HTML content', async (): Promise<void> => {
      // Arrange
      const mockSendMail = jest.fn().mockResolvedValue({
        accepted: ['user@example.com'],
        messageId: '<test@example.com>'
      });

      jest.mock('nodemailer', () => ({
        default: { createTransport: () => ({ sendMail: mockSendMail }) },
        createTransport: () => ({ sendMail: mockSendMail })
      }));

      const svc = (await import('../../../src/mail/emailService')) as unknown as typeof import('../../../src/mail/emailService');
      const htmlContent = '<div><h1>News</h1><p>Content here</p></div>';

      // Act
      await svc.sendConfirmationEmail('user@example.com', 'Newsletter', htmlContent);

      // Assert
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ html: htmlContent })
      );
    });

    it('should use EMAIL_USER as from address', async (): Promise<void> => {
      // Arrange
      jest.resetModules();
      process.env.EMAIL_USER = 'noreply@company.com';

      const mockSendMail = jest.fn().mockResolvedValue({
        accepted: ['customer@example.com'],
        messageId: '<test@example.com>'
      });

      jest.mock('nodemailer', () => ({
        default: { createTransport: () => ({ sendMail: mockSendMail }) },
        createTransport: () => ({ sendMail: mockSendMail })
      }));

      const svc = (await import('../../../src/mail/emailService')) as unknown as typeof import('../../../src/mail/emailService');

      // Act
      await svc.sendConfirmationEmail('customer@example.com', 'Notification', '<p>Important</p>');

      // Assert
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'noreply@company.com' })
      );
    });
  });
});
