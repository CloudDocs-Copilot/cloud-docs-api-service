import '../../setup';
import path from 'path';
import fs from 'fs';

/**
 * Integration-style tests for OCR paths. These tests still mock tesseract
 * but run within the integration test harness (memory mongo, app bootstrapping)
 */

describe('OCR Integration Tests', () => {
  const fixturesDir = path.join(process.cwd(), 'tests', 'fixtures', 'test-files');

  beforeAll(() => {
    if (!fs.existsSync(fixturesDir)) fs.mkdirSync(fixturesDir, { recursive: true });
  });

  afterAll(() => {
    // cleanup
    if (fs.existsSync(fixturesDir)) {
      const files = fs.readdirSync(fixturesDir);
      files.forEach(f => fs.unlinkSync(path.join(fixturesDir, f)));
    }
  });

  it('integration: textExtractionService.extractText uses OCR for images when enabled', async () => {
    jest.resetModules();
    process.env.OCR_ENABLED = 'true';

    const imgPath = path.join(fixturesDir, 'int-dummy.png');
    fs.writeFileSync(imgPath, 'PNGDATA');

    jest.doMock('tesseract.js', () => ({
      createWorker: () => ({
        load: async () => {},
        loadLanguage: async () => {},
        initialize: async () => {},
        recognize: async () => ({ data: { text: 'Integration OCR text' } }),
        terminate: async () => {}
      })
    }));

    const { textExtractionService } = require('../../../src/services/ai/text-extraction.service');

    const res = await textExtractionService.extractText(imgPath, 'image/png');
    expect(res.text).toBe('Integration OCR text');
  });
});
