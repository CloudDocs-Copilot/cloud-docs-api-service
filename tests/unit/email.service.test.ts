jest.resetModules();
jest.unmock('../../src/mail/emailService');

describe('emailService', (): void => {
  it('succeeds when transporter.sendMail resolves', async (): Promise<void> => {
    jest.mock('nodemailer', () => ({
      createTransport: () => ({ sendMail: jest.fn().mockResolvedValue({ messageId: '1' }) })
    }));
    const svc = (await import('../../src/mail/emailService')) as unknown as typeof import('../../src/mail/emailService');
    await expect(svc.sendConfirmationEmail('a@b.com', 'subj', '<p>hi</p>')).resolves.toBeDefined();
  });

  it('throws when transporter.sendMail rejects', async (): Promise<void> => {
    jest.resetModules();
    jest.mock('nodemailer', () => ({
      createTransport: () => ({ sendMail: jest.fn().mockRejectedValue(new Error('fail')) })
    }));
    const svc = (await import('../../src/mail/emailService')) as unknown as typeof import('../../src/mail/emailService');
    await expect(svc.sendConfirmationEmail('a@b.com', 'subj', '<p>hi</p>')).rejects.toThrow('fail');
  });
});
