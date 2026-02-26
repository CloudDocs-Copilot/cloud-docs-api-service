import { jest } from '@jest/globals';

jest.resetModules();

const fs = require('fs');
const { textExtractionService } = require('../../../../src/services/ai/text-extraction.service');

describe('TextExtractionService (unit, deterministic)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('countWords via private method works', () => {
    const n = (textExtractionService as any).countWords('one two  three');
    expect(n).toBe(3);
  });

  it('isSupportedMimeType and getSupportedMimeTypes', () => {
    expect((textExtractionService as any).isSupportedMimeType('text/plain')).toBe(true);
    expect(Array.isArray((textExtractionService as any).getSupportedMimeTypes())).toBe(true);
  });

  it('extractFromTextAsync reads file and returns expected shape', async () => {
    // Mock fs.promises.readFile
    jest.spyOn(fs.promises, 'readFile' as any).mockResolvedValueOnce('hello world');

    const res = await (textExtractionService as any).extractFromTextAsync('file.txt', 'text/plain');
    expect(res.text).toBe('hello world');
    expect(res.wordCount).toBeGreaterThan(0);
    expect(res.mimeType).toBe('text/plain');
  });
});
