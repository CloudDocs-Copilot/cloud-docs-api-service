import { jest } from '@jest/globals';

describe('LlmService', (): void => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('generateResponse returns trimmed provider response', async (): Promise<void> => {
    const provider = {
      name: 'mock',
      generateResponse: jest.fn().mockResolvedValue({ response: '  hello world  ' }),
      getChatModel: jest.fn().mockReturnValue('mock-chat')
    };

    jest.doMock('../../../../src/services/ai/providers', () => ({ getAIProvider: () => provider }));

    const { LlmService } = await import('../../../../src/services/ai/llm.service');
    const svc = new LlmService();
    const res = await svc.generateResponse('prompt');
    expect(res).toBe('hello world');
  });

  it('generateResponse throws 400 on empty prompt', async (): Promise<void> => {
    const { LlmService } = await import('../../../../src/services/ai/llm.service');
    const svc = new LlmService();
    await expect(svc.generateResponse('')).rejects.toThrow('Prompt cannot be empty');
  });

  it('generateResponse throws when provider returns invalid response', async (): Promise<void> => {
    const provider = { name: 'p', generateResponse: jest.fn().mockResolvedValue({ response: undefined }), getChatModel: jest.fn() };
    jest.doMock('../../../../src/services/ai/providers', () => ({ getAIProvider: () => provider }));
    const { LlmService } = await import('../../../../src/services/ai/llm.service');
    const svc = new LlmService();
    await expect(svc.generateResponse('x')).rejects.toThrow('Failed to generate response');
  });

  it('generateResponse forwards HttpError from provider', async (): Promise<void> => {
    const provider = { name: 'p', generateResponse: jest.fn().mockRejectedValue(new (class extends Error { status = 400; constructor(){super('bad');} })()), getChatModel: jest.fn() };
    jest.doMock('../../../../src/services/ai/providers', () => ({ getAIProvider: () => provider }));
    const { LlmService } = await import('../../../../src/services/ai/llm.service');
    const svc = new LlmService();
    await expect(svc.generateResponse('x')).rejects.toBeDefined();
  });

  it('generateResponseStream calls onChunk for each word', async (): Promise<void> => {
    const provider = { name: 'p', generateResponse: jest.fn().mockResolvedValue({ response: 'one two' }), getChatModel: jest.fn() };
    jest.doMock('../../../../src/services/ai/providers', () => ({ getAIProvider: () => provider }));
    const { LlmService } = await import('../../../../src/services/ai/llm.service');
    const svc = new LlmService();
    const chunks: string[] = [];
    const res = await svc.generateResponseStream('p', c => chunks.push(c));
    expect(res).toBe('one two');
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it('getModel returns provider model', async (): Promise<void> => {
    const provider = { name: 'p', generateResponse: jest.fn(), getChatModel: jest.fn().mockReturnValue('mymodel') };
    jest.doMock('../../../../src/services/ai/providers', () => ({ getAIProvider: () => provider }));
    const { LlmService } = await import('../../../../src/services/ai/llm.service');
    const svc = new LlmService();
    expect(svc.getModel()).toBe('mymodel');
  });

  it('getDefaultTemperature and getMaxTokens return defaults', async (): Promise<void> => {
    const provider = { name: 'p', generateResponse: jest.fn(), getChatModel: jest.fn() };
    jest.doMock('../../../../src/services/ai/providers', () => ({ getAIProvider: () => provider }));
    const { LlmService } = await import('../../../../src/services/ai/llm.service');
    const svc = new LlmService();
    expect(svc.getDefaultTemperature()).toBe(0.3);
    expect(svc.getMaxTokens()).toBe(1000);
  });
});
