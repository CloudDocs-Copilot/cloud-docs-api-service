jest.resetModules();
jest.unmock('../../src/mail/emailService');

describe('emailService', () => {
  it('succeeds when transporter.sendMail resolves', async () => {
    jest.mock('nodemailer', () => ({
      createTransport: () => ({ sendMail: jest.fn().mockResolvedValue({ messageId: '1' }) })
    }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const svc = require('../../src/mail/emailService');
    await expect(svc.sendConfirmationEmail('a@b.com', 'subj', '<p>hi</p>')).resolves.toBeDefined();
  });

  it('throws when transporter.sendMail rejects', async () => {
    jest.resetModules();
    jest.mock('nodemailer', () => ({
      createTransport: () => ({ sendMail: jest.fn().mockRejectedValue(new Error('fail')) })
    }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const svc = require('../../src/mail/emailService');
    await expect(svc.sendConfirmationEmail('a@b.com', 'subj', '<p>hi</p>')).rejects.toThrow('fail');
  });
});
