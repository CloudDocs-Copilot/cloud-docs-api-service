import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import {
  sanitizePath,
  sanitizePathOrThrow,
  isPathWithinBase,
  validateDownloadPath,
  generateSafeFileName,
  validateMultiplePaths,
  areAllPathsValid
} from '../../../src/utils/path-sanitizer';

describe('path-sanitizer utilities', (): void => {
  test('sanitizePath: valid simple path', (): void => {
    const res = sanitizePath('uploads/file.txt');
    expect(res.isValid).toBe(true);
    expect(res.sanitizedPath).toBeDefined();
    expect(res.errors).toHaveLength(0);
  });

  test('sanitizePath: detects traversal attempts', (): void => {
    const res = sanitizePath('../etc/passwd');
    expect(res.isValid).toBe(false);
    expect(res.errors).toContain('Path traversal attempt detected');
  });

  test('sanitizePathOrThrow throws on invalid path', (): void => {
    expect(() => sanitizePathOrThrow('../../../secret')).toThrow();
  });

  test('isPathWithinBase returns true/false correctly', (): void => {
    const base = path.resolve(process.cwd(), 'tests', 'tmp');
    expect(isPathWithinBase('file.txt', base)).toBe(true);
    // A path that resolves outside
    expect(isPathWithinBase('../outside.txt', base)).toBe(false);
  });

  test('validateDownloadPath resolves existing file and rejects missing', async (): Promise<void> => {
    const tmpDir = path.join(os.tmpdir(), 'cdctest_tmp');
    await fs.mkdir(tmpDir, { recursive: true });
    const filePath = path.join(tmpDir, 'myfile.txt');
    await fs.writeFile(filePath, 'hello');

    const abs = await validateDownloadPath('myfile.txt', tmpDir);
    expect(abs).toBe(path.resolve(tmpDir, 'myfile.txt'));

    await expect(validateDownloadPath('missing.txt', tmpDir)).rejects.toThrow(/File does not exist|no such file or directory/i);
  });

  test('generateSafeFileName preserves extension and can drop extension', (): void => {
    const nameWithExt = generateSafeFileName('my report.pdf');
    // Implementation preserves spaces in sanitized name
    expect(nameWithExt).toMatch(/my report-\d+\.pdf$/);

    const nameNoExt = generateSafeFileName('my report.pdf', false);
    expect(nameNoExt).toMatch(/^my report$/);
  });

  test('validateMultiplePaths and areAllPathsValid behave correctly', (): void => {
    const results = validateMultiplePaths(['a.txt', '../etc/passwd']);
    expect(results.length).toBe(2);
    expect(results[0].isValid).toBe(true);
    expect(results[1].isValid).toBe(false);

    expect(areAllPathsValid(['a.txt'])).toBe(true);
    expect(areAllPathsValid(['a.txt', '../b'])).toBe(false);
  });
});
