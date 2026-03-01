/**
 * Unit tests for Text Extraction Service
 */

import {
  textExtractionService,
  SUPPORTED_MIME_TYPES
} from '../../../src/services/ai/text-extraction.service';
import path from 'path';
import fs from 'fs';
import HttpError from '../../../src/models/error.model';

describe('TextExtractionService', (): void => {
  const testFilesDir = path.join(process.cwd(), 'tests', 'fixtures', 'test-files');

  beforeAll(() => {
    // Crear directorio para archivos de prueba si no existe
    if (!fs.existsSync(testFilesDir)) {
      fs.mkdirSync(testFilesDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Limpiar archivos de prueba
    if (fs.existsSync(testFilesDir)) {
      const files = fs.readdirSync(testFilesDir);
      files.forEach(file => {
        fs.unlinkSync(path.join(testFilesDir, file));
      });
      fs.rmdirSync(testFilesDir);
    }
  });

  describe('extractText', (): void => {
    it('should extract text from TXT file', async (): Promise<void> => {
      const testContent = 'Este es un archivo de texto plano para testing.';
      const testFile = path.join(testFilesDir, 'test.txt');
      fs.writeFileSync(testFile, testContent);

      const result = await textExtractionService.extractText(testFile, SUPPORTED_MIME_TYPES.TXT);

      expect(result.text).toBe(testContent);
      expect(result.charCount).toBe(testContent.length);
      expect(result.wordCount).toBe(9);
      expect(result.mimeType).toBe(SUPPORTED_MIME_TYPES.TXT);
    });

    it('should extract text from MD file', async (): Promise<void> => {
      const testContent = '# Título\n\nEste es un archivo markdown.';
      const testFile = path.join(testFilesDir, 'test.md');
      fs.writeFileSync(testFile, testContent);

      const result = await textExtractionService.extractText(testFile, SUPPORTED_MIME_TYPES.MD);

      expect(result.text).toBe(testContent);
      expect(result.mimeType).toBe(SUPPORTED_MIME_TYPES.MD);
      expect(result.wordCount).toBeGreaterThan(0);
    });

    it('should throw error for non-existent file', async (): Promise<void> => {
      const nonExistentFile = path.join(testFilesDir, 'does-not-exist.txt');

      await expect(
        textExtractionService.extractText(nonExistentFile, SUPPORTED_MIME_TYPES.TXT)
      ).rejects.toThrow(HttpError);

      await expect(
        textExtractionService.extractText(nonExistentFile, SUPPORTED_MIME_TYPES.TXT)
      ).rejects.toThrow('File not found');
    });

    it('should throw error for unsupported MIME type', async (): Promise<void> => {
      const testFile = path.join(testFilesDir, 'test.txt');
      fs.writeFileSync(testFile, 'content');

      await expect(
        textExtractionService.extractText(testFile, 'application/unsupported')
      ).rejects.toThrow(HttpError);

      await expect(
        textExtractionService.extractText(testFile, 'application/unsupported')
      ).rejects.toThrow('Unsupported file type');
    });

    it('should throw error for directory instead of file', async (): Promise<void> => {
      await expect(
        textExtractionService.extractText(testFilesDir, SUPPORTED_MIME_TYPES.TXT)
      ).rejects.toThrow(HttpError);

      await expect(
        textExtractionService.extractText(testFilesDir, SUPPORTED_MIME_TYPES.TXT)
      ).rejects.toThrow('Path is not a file');
    });
  });

  describe('isSupportedMimeType', (): void => {
    it('should return true for supported MIME types', (): void => {
      expect(textExtractionService.isSupportedMimeType(SUPPORTED_MIME_TYPES.PDF)).toBe(true);
      expect(textExtractionService.isSupportedMimeType(SUPPORTED_MIME_TYPES.DOCX)).toBe(true);
      expect(textExtractionService.isSupportedMimeType(SUPPORTED_MIME_TYPES.DOC)).toBe(true);
      expect(textExtractionService.isSupportedMimeType(SUPPORTED_MIME_TYPES.TXT)).toBe(true);
      expect(textExtractionService.isSupportedMimeType(SUPPORTED_MIME_TYPES.MD)).toBe(true);
      // Images supported via OCR
      expect(textExtractionService.isSupportedMimeType('image/png')).toBe(true);
    });

    it('should return false for unsupported MIME types', (): void => {
      expect(textExtractionService.isSupportedMimeType('application/json')).toBe(false);
      expect(textExtractionService.isSupportedMimeType('image/webp')).toBe(false);
      expect(textExtractionService.isSupportedMimeType('video/mp4')).toBe(false);
    });
  });

  describe('getSupportedMimeTypes', (): void => {
    it('should return array of supported MIME types', (): void => {
      const types = textExtractionService.getSupportedMimeTypes();

      expect(Array.isArray(types)).toBe(true);
      expect(types).toContain(SUPPORTED_MIME_TYPES.PDF);
      expect(types).toContain(SUPPORTED_MIME_TYPES.DOCX);
      expect(types).toContain(SUPPORTED_MIME_TYPES.DOC);
      expect(types).toContain(SUPPORTED_MIME_TYPES.TXT);
      expect(types).toContain(SUPPORTED_MIME_TYPES.MD);
      // Added 4 image types (png/jpg/tiff/bmp)
      expect(types.length).toBe(9);
    });
  });

  describe('word counting', (): void => {
    it('should count words correctly', async (): Promise<void> => {
      const testCases = [
        { content: 'one two three', expected: 3 },
        { content: 'single', expected: 1 },
        { content: 'multiple   spaces   between', expected: 3 },
        { content: 'line\nbreak\nwords', expected: 3 },
        { content: '', expected: 0 },
        { content: '   ', expected: 0 }
      ];

      for (const testCase of testCases) {
        const testFile = path.join(testFilesDir, 'word-count-test.txt');
        fs.writeFileSync(testFile, testCase.content);

        const result = await textExtractionService.extractText(testFile, SUPPORTED_MIME_TYPES.TXT);
        expect(result.wordCount).toBe(testCase.expected);
      }
    });
  });
});
