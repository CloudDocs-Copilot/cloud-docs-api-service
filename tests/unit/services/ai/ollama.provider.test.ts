import { jest } from '@jest/globals';

jest.resetModules();

// Mock the Ollama client used inside the provider
jest.mock('ollama', () => {
  type OllamaCtorOpts = { host?: string };
  return {
    __esModule: true,
    Ollama: class {
      host: string;
      constructor(opts: OllamaCtorOpts) {
        this.host = opts?.host ?? '';
      }
      async embeddings(_opts?: unknown) {
        // deterministic embedding of fixed length 768
        return { embedding: Array(768).fill(0.123) };
      }
    }
  };
});

import { OllamaProvider } from '../../../../src/services/ai/providers/ollama.provider';

type GenResp = { response: string };

describe('OllamaProvider (unit, deterministic)', () => {
  it('generateEmbedding returns embedding with correct dimensions and model', async (): Promise<void> => {
    const provider = new OllamaProvider();

    const res = await provider.generateEmbedding('hello');
    expect(res).toHaveProperty('embedding');
    expect(res.embedding.length).toBe(provider.getEmbeddingDimensions());
    expect(res.model).toBe(provider.getEmbeddingModel());
  });

  it('generateEmbedding rejects empty text', async (): Promise<void> => {
    const provider = new OllamaProvider();
    await expect(provider.generateEmbedding('')).rejects.toThrow('Text cannot be empty');
  });

  it('generateEmbeddings processes array and returns same length', async (): Promise<void> => {
    const provider = new OllamaProvider();
    const texts = ['a', 'b', 'c'];
    const res = await provider.generateEmbeddings(texts);
    expect(res.length).toBe(3);
    expect(res[0].embedding.length).toBe(provider.getEmbeddingDimensions());
  });

  it('classifyDocument parses JSON response from generateResponse', async (): Promise<void> => {
    const provider = new OllamaProvider();

    // Spy on the instance method and return typed response
    const mockValue = {
      response: JSON.stringify({ category: 'Factura', confidence: 0.92, tags: ['finanzas'] }),
      model: provider.getChatModel(), // or a string like 'ollama-default'
    };
    jest.spyOn(provider, 'generateResponse').mockResolvedValueOnce(mockValue);

    const cls = await provider.classifyDocument('some text');
    expect(cls.category).toBe('Factura');
    expect(cls.confidence).toBeCloseTo(0.92);
    expect(Array.isArray(cls.tags)).toBe(true);
  });

  it('summarizeDocument parses JSON response from generateResponse', async (): Promise<void> => {
    const provider = new OllamaProvider();
    const payload = { summary: 'short', keyPoints: ['a', 'b', 'c'] };
      const mockValue = {
        response: JSON.stringify(payload),
        model: provider.getChatModel(),
      };
      jest.spyOn(provider, 'generateResponse').mockResolvedValueOnce(mockValue);

    const s = await provider.summarizeDocument('long text');
    expect(s.summary).toBe('short');
    expect(Array.isArray(s.keyPoints)).toBe(true);
  });
});
