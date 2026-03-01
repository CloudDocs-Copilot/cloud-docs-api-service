jest.mock('../../../../src/configurations/openai-config', () => ({
  __esModule: true,
  default: { getInstance: () => ({
    embeddings: { create: jest.fn().mockResolvedValue({ data: [{ embedding: new Array(1536).fill(0) }] }) },
    chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { content: '{}' } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }) } },
    models: { list: jest.fn().mockResolvedValue([]) }
  }) }
}));

import { OpenAIProvider } from '../../../../src/services/ai/providers/openai.provider';

describe('OpenAIProvider', (): void => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    provider = new OpenAIProvider();
  });

  test('getters return expected values', (): void => {
    expect(provider.getEmbeddingDimensions()).toBe(1536);
    expect(typeof provider.getEmbeddingModel()).toBe('string');
    expect(typeof provider.getChatModel()).toBe('string');
  });

  test('generateEmbedding throws on empty text', async (): Promise<void> => {
    await expect(provider.generateEmbedding('')).rejects.toThrow('Text cannot be empty');
  });

  test('generateEmbeddings throws on empty array', async (): Promise<void> => {
    await expect(provider.generateEmbeddings([])).rejects.toThrow('Texts array cannot be empty');
  });

  test('generateResponse throws on empty prompt', async (): Promise<void> => {
    await expect(provider.generateResponse('')).rejects.toThrow('Prompt cannot be empty');
  });

  test('classifyDocument returns fallback on invalid JSON', async (): Promise<void> => {
    // spy generateResponse to return non-json
    const mockResp = { response: 'not json', model: 'm', tokens: { prompt: 0, completion: 0, total: 0 } };
    type ResponseShape = { response: string; model: string; tokens: { prompt: number; completion: number; total: number } };
    type GenResp = { generateResponse: (input: string) => Promise<ResponseShape> };
    jest.spyOn(provider as unknown as GenResp, 'generateResponse').mockResolvedValue(mockResp as unknown as ResponseShape);
    const res = await provider.classifyDocument('hello');
    expect(res).toHaveProperty('category');
    expect(res).toHaveProperty('confidence');
  });

  test('summarizeDocument returns fallback on invalid JSON', async (): Promise<void> => {
    const mockResp = { response: 'no json', model: 'm', tokens: { prompt: 0, completion: 0, total: 0 } };
    type ResponseShape = { response: string; model: string; tokens: { prompt: number; completion: number; total: number } };
    type GenResp = { generateResponse: (input: string) => Promise<ResponseShape> };
    jest.spyOn(provider as unknown as GenResp, 'generateResponse').mockResolvedValue(mockResp as unknown as ResponseShape);
    const res = await provider.summarizeDocument('hello');
    expect(res).toHaveProperty('summary');
  });
});
