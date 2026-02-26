import { jest } from '@jest/globals';

jest.resetModules();

// Mock the Ollama client used inside the provider
jest.mock('ollama', () => {
  return {
    __esModule: true,
    Ollama: class {
      host: string;
      constructor(opts: any) {
        this.host = opts.host;
      }
      async embeddings(opts: any) {
        // deterministic embedding of fixed length 768
        return { embedding: Array(768).fill(0.123) };
      }
    }
  };
});

const { OllamaProvider } = require('../../../../src/services/ai/providers/ollama.provider');

describe('OllamaProvider (unit, deterministic)', () => {
  it('generateEmbedding returns embedding with correct dimensions and model', async () => {
    const provider = new OllamaProvider();

    const res = await provider.generateEmbedding('hello');
    expect(res).toHaveProperty('embedding');
    expect(res.embedding.length).toBe(provider.getEmbeddingDimensions());
    expect(res.model).toBe(provider.getEmbeddingModel());
  });

  it('generateEmbedding rejects empty text', async () => {
    const provider = new OllamaProvider();
    await expect(provider.generateEmbedding('')).rejects.toThrow('Text cannot be empty');
  });

  it('generateEmbeddings processes array and returns same length', async () => {
    const provider = new OllamaProvider();
    const texts = ['a', 'b', 'c'];
    const res = await provider.generateEmbeddings(texts);
    expect(res.length).toBe(3);
    expect(res[0].embedding.length).toBe(provider.getEmbeddingDimensions());
  });

  it('classifyDocument parses JSON response from generateResponse', async () => {
    const provider = new OllamaProvider();

    // Spy generateResponse to return deterministic JSON string
    jest.spyOn(OllamaProvider.prototype as any, 'generateResponse').mockResolvedValueOnce({ response: JSON.stringify({ category: 'Factura', confidence: 0.92, tags: ['finanzas'] }) });

    const cls = await provider.classifyDocument('some text');
    expect(cls.category).toBe('Factura');
    expect(cls.confidence).toBeCloseTo(0.92);
    expect(Array.isArray(cls.tags)).toBe(true);
  });

  it('summarizeDocument parses JSON response from generateResponse', async () => {
    const provider = new OllamaProvider();
    const payload = { summary: 'short', keyPoints: ['a', 'b', 'c'] };
    jest.spyOn(OllamaProvider.prototype as any, 'generateResponse').mockResolvedValueOnce({ response: JSON.stringify(payload) });

    const s = await provider.summarizeDocument('long text');
    expect(s.summary).toBe('short');
    expect(Array.isArray(s.keyPoints)).toBe(true);
  });
});
