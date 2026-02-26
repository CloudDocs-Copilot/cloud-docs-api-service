import { jest } from '@jest/globals';

jest.resetModules();

const { MockAIProvider } = require('../../../../src/services/ai/providers/mock.provider');

describe('Mock AI Provider', () => {
  it('generateResponse returns expected shape', async () => {
    const provider = new MockAIProvider();
    const res = await provider.generateResponse('prompt', { temperature: 0.5 });
    // Mock provider returns `response` (string) and `model`/`tokens` fields
    expect(res).toHaveProperty('response');
    expect(typeof res.response).toBe('string');
  });

  it('generateEmbedding returns embedding object with numeric array', async () => {
    const provider = new MockAIProvider();
    const embRes = await provider.generateEmbedding('text');
    expect(embRes).toHaveProperty('embedding');
    expect(Array.isArray(embRes.embedding)).toBe(true);
    expect(typeof embRes.embedding[0]).toBe('number');
  });
});
