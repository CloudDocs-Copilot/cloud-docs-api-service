/**
 * Unit tests for OCR paths in TextExtractionService
 */
import path from 'path';
import fs from 'fs';

describe('TextExtractionService OCR unit tests', (): void => {
  const fixturesDir = path.join(process.cwd(), 'tests', 'fixtures', 'test-files');

  beforeAll((): void => {
    if (!fs.existsSync(fixturesDir)) fs.mkdirSync(fixturesDir, { recursive: true });
  });

  afterAll((): void => {
    // cleanup fixture files
    if (fs.existsSync(fixturesDir)) {
      const files = fs.readdirSync(fixturesDir);
      files.forEach(f => fs.unlinkSync(path.join(fixturesDir, f)));
    }
  });

  it('extracts text from image via OCR when OCR enabled', async (): Promise<void> => {
    jest.resetModules();
    process.env.OCR_ENABLED = 'true';

    // create a dummy file to satisfy fs.stat
    const imgPath = path.join(fixturesDir, 'dummy.png');
    fs.writeFileSync(imgPath, 'PNGDATA');

    // mock tesseract.js
    jest.doMock('tesseract.js', () => ({
      createWorker: () => ({
        load: async () => {},
        loadLanguage: async () => {},
        initialize: async () => {},
        recognize: async () => ({ data: { text: 'Detected OCR text' } }),
        terminate: async () => {}
      })
    }));

    const mod = await import('../../../src/services/ai/text-extraction.service');
    const { textExtractionService } = mod;

    const res = await textExtractionService.extractText(imgPath, 'image/png');

    expect(res.text).toBe('Detected OCR text');
    expect(res.wordCount).toBeGreaterThan(0);
  });

  it('falls back to PDF OCR when pdf parsing returns empty text', async (): Promise<void> => {
    jest.resetModules();
    process.env.OCR_ENABLED = 'true';

    // create dummy pdf file
    const pdfPath = path.join(fixturesDir, 'empty.pdf');
    fs.writeFileSync(pdfPath, 'PDFDATA');

    // Mock tesseract and stub the internal PDF extractor to simulate empty PDF text
    jest.doMock('tesseract.js', () => ({
      createWorker: () => ({
        load: async () => {},
        loadLanguage: async () => {},
        initialize: async () => {},
        recognize: async () => ({ data: { text: 'OCR from PDF' } }),
        terminate: async () => {}
      })
    }));

    const mod = await import('../../../src/services/ai/text-extraction.service');
    const { textExtractionService } = mod;
    // stub the internal PDF extractor to return empty text so the OCR fallback is exercised
    jest.spyOn(textExtractionService as unknown as { extractFromPdf: jest.Mock }, 'extractFromPdf').mockResolvedValue({
      text: '',
      charCount: 0,
      wordCount: 0,
      mimeType: 'application/pdf'
    });

    const res = await textExtractionService.extractText(pdfPath, 'application/pdf');
    expect(res.text).toBe('OCR from PDF');
  });

  it('rejects image extraction when OCR is disabled', async (): Promise<void> => {
    jest.resetModules();
    process.env.OCR_ENABLED = 'false';

    const imgPath = path.join(fixturesDir, 'dummy2.png');
    fs.writeFileSync(imgPath, 'PNGDATA');

    const mod = await import('../../../src/services/ai/text-extraction.service');
    const { textExtractionService } = mod;

    await expect(textExtractionService.extractText(imgPath, 'image/png')).rejects.toThrow(
      'OCR is disabled'
    );
  });
});
