import {
  validateWebhookUrl,
  validateImageUrl,
  validateRedirectUrl,
  validateQueryUrl,
  scanForUrls
} from '../../../src/middlewares/url-validation.middleware';
import HttpError from '../../../src/models/error.model';

describe('url-validation.middleware', () => {
  it('validateWebhookUrl rejects invalid webhookUrl when strict (private IP)', () => {
    const mw = validateWebhookUrl;
    const req: any = { body: { webhookUrl: 'http://127.0.0.1/secret' } };
    const next = jest.fn();

    mw(req as any, {} as any, next);
    expect(next).toHaveBeenCalledWith(expect.any(HttpError));
  });

  it('validateImageUrl allows valid image url when allowedDomains not set (permissive)', () => {
    const mw = validateImageUrl();
    const req: any = { body: { imageUrl: 'https://cdn.example.com/image.png' } };
    const next = jest.fn();

    mw(req as any, {} as any, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('validateRedirectUrl throws when allowedDomains missing', () => {
    expect(() => validateRedirectUrl([])).toThrow();
  });

  it('validateQueryUrl rejects invalid query url (unsupported protocol)', () => {
    const mw = validateQueryUrl(['url']);
    const req: any = { query: { url: 'ftp://example.com/path' } };
    const next = jest.fn();

    mw(req as any, {} as any, next);
    expect(next).toHaveBeenCalledWith(expect.any(HttpError));
  });

  it('scanForUrls detects suspicious urls in body strings and calls next with error', () => {
    const mw = scanForUrls(['trusted.com']);
    const req: any = { body: { text: 'Click here http://evil.com/malware' } };
    const next = jest.fn();

    mw(req as any, {} as any, next);
    expect(next).toHaveBeenCalledWith(expect.any(HttpError));
  });
});
