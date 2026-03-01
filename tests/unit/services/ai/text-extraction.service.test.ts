import { jest } from '@jest/globals';
import fs from 'fs';

jest.resetModules();

type TextExtractionServiceType = {
  countWords: (text: string) => number;
  isSupportedMimeType: (mime: string) => boolean;
  getSupportedMimeTypes: () => string[];
  extractFromTextAsync: (filePath: string, mimeType: string) => Promise<{ text: string; wordCount: number; mimeType: string }>;
};

import { textExtractionService as importedTextExtractionService } from '../../../../src/services/ai/text-extraction.service';
const textExtractionService = importedTextExtractionService as unknown as TextExtractionServiceType;

describe('TextExtractionService (unit, deterministic)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('countWords via private method works', (): void => {
    const n = textExtractionService.countWords('one two  three');
    expect(n).toBe(3);
  });

  it('isSupportedMimeType and getSupportedMimeTypes', (): void => {
    expect(textExtractionService.isSupportedMimeType('text/plain')).toBe(true);
    expect(Array.isArray(textExtractionService.getSupportedMimeTypes())).toBe(true);
  });

  it('extractFromTextAsync reads file and returns expected shape', async (): Promise<void> => {
    // Mock fs.promises.readFile with proper typing
    type FSProms = { readFile: (path: string, enc?: string) => Promise<string | Buffer> };
    jest.spyOn(fs.promises as unknown as FSProms, 'readFile').mockResolvedValueOnce('hello world');

    const res = await textExtractionService.extractFromTextAsync('file.txt', 'text/plain');
    expect(res.text).toBe('hello world');
    expect(res.wordCount).toBeGreaterThan(0);
    expect(res.mimeType).toBe('text/plain');
  });
});
