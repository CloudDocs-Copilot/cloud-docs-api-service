/**
 * Unit tests for LLM Service
 */

// Note: removed unused HttpError import to avoid TS6133 during CI

describe('LLMService', (): void => {
  type LLMServiceShape = {
    generateResponse: (prompt: string, opts?: unknown) => Promise<string>;
    generateResponseStream: (prompt: string, onChunk: (chunk: string) => void) => Promise<string>;
    getDefaultTemperature: () => number;
  };

  let llmService: LLMServiceShape;
  let mockProvider: {
    name: string;
    generateResponse: jest.Mock<Promise<{ response: string; usage?: unknown }>, [string, unknown?]>;
    getChatModel: jest.Mock<string, []>;
  };

  beforeEach(async (): Promise<void> => {
    jest.resetModules();

    // Mock provider with predictable behavior
    mockProvider = {
      name: 'mock',
      generateResponse: jest.fn<Promise<{ response: string; usage?: unknown }>, [string, unknown?]>(),
      getChatModel: jest.fn(() => 'mock-chat-model')
    };

    // Mock the provider factory to return our mockProvider
    jest.doMock('../../../src/services/ai/providers/provider.factory', () => ({
      getAIProvider: () => mockProvider
    }));

    // Now require the service under test so it picks up the mocked factory
    llmService = ((await import('../../../src/services/ai/llm.service')) as unknown as typeof import('../../../src/services/ai/llm.service')).llmService as LLMServiceShape;
  });

  describe('generateResponse', (): void => {
    it('should generate response for a prompt', async (): Promise<void> => {
      mockProvider.generateResponse.mockResolvedValue({
        response: 'This is a test response from the AI model.',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
      });

      const result = await llmService.generateResponse('What is AI?');

      expect(result).toBe('This is a test response from the AI model.');
      expect(mockProvider.generateResponse).toHaveBeenCalledWith('What is AI?', undefined);
    });

    it('should handle empty response from API', async (): Promise<void> => {
      mockProvider.generateResponse.mockResolvedValue({ response: '' });

      const result = await llmService.generateResponse('Test prompt');

      expect(result).toBe('');
    });

    it('should throw error when API fails', async (): Promise<void> => {
      mockProvider.generateResponse.mockRejectedValue(new Error('API unavailable'));

      await expect(llmService.generateResponse('Test prompt')).rejects.toThrow(
        /Failed to generate response/
      );
    });

    it('should handle missing choices in response', async (): Promise<void> => {
      mockProvider.generateResponse.mockResolvedValue({ response: '' });

      await expect(llmService.generateResponse('Test')).resolves.toBe('');
    });

    it('should handle long prompts', async (): Promise<void> => {
      const longPrompt = 'word '.repeat(5000);

      mockProvider.generateResponse.mockResolvedValue({ response: 'Response for long prompt' });

      const result = await llmService.generateResponse(longPrompt);

      expect(result).toBeDefined();
      expect(mockProvider.generateResponse).toHaveBeenCalled();
    });

    it('should use correct temperature setting', async (): Promise<void> => {
      mockProvider.generateResponse.mockResolvedValue({ response: 'Test response' });

      await llmService.generateResponse('Test');

      // The service delegates options to the provider; verify default temperature function
      expect(llmService.getDefaultTemperature()).toBe(0.3);
    });

    it('should handle special characters in prompt', async (): Promise<void> => {
      const specialPrompt = '¿Qué es la IA? 你好 مرحبا';

      mockProvider.generateResponse.mockResolvedValue({ response: 'Response with special chars' });

      const result = await llmService.generateResponse(specialPrompt);

      expect(result).toBeDefined();
    });

    it('should handle missing usage data gracefully', async (): Promise<void> => {
      mockProvider.generateResponse.mockResolvedValue({ response: 'Response without usage' });

      const result = await llmService.generateResponse('Test');

      expect(result).toBe('Response without usage');
    });
  });

  describe('generateResponseStream', (): void => {
    it('should handle streaming responses', async (): Promise<void> => {
      const chunks: string[] = [];
      const onChunk = (chunk: string) => chunks.push(chunk);

      // Provider abstraction returns a response string; service simulates streaming by words
      mockProvider.generateResponse.mockResolvedValue({ response: 'Streamed response' });

      const result = await llmService.generateResponseStream('Test', onChunk);

      expect(result).toBe('Streamed response');
      expect(chunks).toEqual(['Streamed ', 'response']);
    });
  });

  describe('edge cases', (): void => {
    it('should handle null or undefined prompt gracefully', async (): Promise<void> => {
      mockProvider.generateResponse.mockResolvedValue({ response: 'Response' });

      // Should throw error for empty prompt
      await expect(llmService.generateResponse('')).rejects.toThrow('Prompt cannot be empty');
    });

    it('should handle rate limit errors', async (): Promise<void> => {
      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as unknown as { status?: number }).status = 429;

      mockProvider.generateResponse.mockRejectedValue(rateLimitError);

      await expect(llmService.generateResponse('Test')).rejects.toThrow(
        /Failed to generate response/
      );
    });

    it('should handle authentication errors', async (): Promise<void> => {
      const authError = new Error('Invalid API key');
      (authError as unknown as { status?: number }).status = 401;

      mockProvider.generateResponse.mockRejectedValue(authError);

      await expect(llmService.generateResponse('Test')).rejects.toThrow(
        /Failed to generate response/
      );
    });
  });
});
