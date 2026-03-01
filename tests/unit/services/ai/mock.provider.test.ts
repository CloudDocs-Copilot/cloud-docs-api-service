import { jest } from '@jest/globals';

jest.resetModules();

import { MockAIProvider } from '../../../../src/services/ai/providers/mock.provider';

type MockProv = {
  generateResponse: (prompt: string, opts?: Record<string, unknown>) => Promise<{ response: string } & Record<string, unknown>>;
  generateEmbedding: (text: string) => Promise<{ embedding: number[] }>;
};

describe('Mock AI Provider', (): void => {
  it('generateResponse returns expected shape', async (): Promise<void> => {
    const provider = new MockAIProvider() as unknown as MockProv;
    const res = await provider.generateResponse('prompt', { temperature: 0.5 });
    // Mock provider returns `response` (string) and `model`/`tokens` fields
    expect(res).toHaveProperty('response');
    expect(typeof res.response).toBe('string');
  });

  it('generateEmbedding returns embedding object with numeric array', async (): Promise<void> => {
    const provider = new MockAIProvider() as unknown as MockProv;
    const embRes = await provider.generateEmbedding('text');
    expect(embRes).toHaveProperty('embedding');
    expect(Array.isArray(embRes.embedding)).toBe(true);
    expect(typeof embRes.embedding[0]).toBe('number');
  });
});
