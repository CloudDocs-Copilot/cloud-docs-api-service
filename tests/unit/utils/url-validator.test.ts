import {
  validateUrl,
  validateUrlOrThrow,
  validateMultipleUrls,
  areAllUrlsValid,
  sanitizeUrl,
  extractBaseDomain
} from '../../../src/utils/url-validator';

describe('url-validator utilities', (): void => {
  it('rejects invalid URL format', (): void => {
    const res = validateUrl('not-a-url');
    expect(res.isValid).toBe(false);
    expect(res.errors).toContain('Invalid URL format');
  });

  it('detects blocked domain and private IPs', (): void => {
    const res = validateUrl('http://127.0.0.1/');
    expect(res.isValid).toBe(false);
    expect(res.errors.some(e => e.includes('private'))).toBeTruthy();
  });

  it('detects blocked ports', (): void => {
    const res = validateUrl('http://example.com:9200/');
    expect(res.isValid).toBe(false);
    expect(res.errors.some(e => e.includes('Port'))).toBeTruthy();
  });

  it('validateUrlOrThrow throws on invalid', (): void => {
    expect(() => validateUrlOrThrow('://bad')).toThrow();
  });

  it('validateMultipleUrls and areAllUrlsValid', (): void => {
    const list = ['https://example.com', 'https://localhost'];
    const results = validateMultipleUrls(list);
    expect(results).toHaveLength(2);
    expect(areAllUrlsValid(['https://example.com'])).toBe(true);
  });

  it('sanitizeUrl removes credentials and hash', (): void => {
    const sanitized = sanitizeUrl('https://user:pass@example.com/path#section');
    expect(sanitized).not.toContain('user:pass');
    expect(sanitized).not.toContain('#');
  });

  it('extractBaseDomain returns hostname', (): void => {
    expect(extractBaseDomain('https://Sub.Example.COM/path')).toBe('sub.example.com');
  });
});
