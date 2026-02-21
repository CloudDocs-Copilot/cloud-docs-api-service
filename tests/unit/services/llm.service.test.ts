/**
 * Unit tests for LLM Service
 */

// Note: removed unused HttpError import to avoid TS6133 during CI

describe('LLMService', () => {
  let llmService: any;
  let mockProvider: any;

  beforeEach(() => {
    jest.resetModules();

    // Mock provider with predictable behavior
    mockProvider = {
      name: 'mock',
      generateResponse: jest.fn(),
      getChatModel: jest.fn(() => 'mock-chat-model')
    };

    // Mock the provider factory to return our mockProvider
    jest.doMock('../../../src/services/ai/providers/provider.factory', () => ({
      getAIProvider: () => mockProvider
    }));

    // Now require the service under test so it picks up the mocked factory
    llmService = require('../../../src/services/ai/llm.service').llmService;
  });

  describe('generateResponse', () => {
    it('should generate response for a prompt', async () => {
      mockProvider.generateResponse.mockResolvedValue({
        response: 'This is a test response from the AI model.',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
      });

      const result = await llmService.generateResponse('What is AI?');

      expect(result).toBe('This is a test response from the AI model.');
      expect(mockProvider.generateResponse).toHaveBeenCalledWith('What is AI?', undefined);
    });

    it('should handle empty response from API', async () => {
      mockProvider.generateResponse.mockResolvedValue({ response: '' });

      const result = await llmService.generateResponse('Test prompt');

      expect(result).toBe('');
    });

    it('should throw error when API fails', async () => {
      mockProvider.generateResponse.mockRejectedValue(new Error('API unavailable'));

      await expect(llmService.generateResponse('Test prompt')).rejects.toThrow(/Failed to generate response/);
    });

    it('should handle missing choices in response', async () => {
      mockProvider.generateResponse.mockResolvedValue({ response: '' });

      await expect(llmService.generateResponse('Test')).resolves.toBe('');
    });

    it('should handle long prompts', async () => {
      const longPrompt = 'word '.repeat(5000);

      mockProvider.generateResponse.mockResolvedValue({ response: 'Response for long prompt' });

      const result = await llmService.generateResponse(longPrompt);

      expect(result).toBeDefined();
      expect(mockProvider.generateResponse).toHaveBeenCalled();
    });

    it('should use correct temperature setting', async () => {
      mockProvider.generateResponse.mockResolvedValue({ response: 'Test response' });

      await llmService.generateResponse('Test');

      // The service delegates options to the provider; verify default temperature function
      expect(llmService.getDefaultTemperature()).toBe(0.3);
    });

    it('should handle special characters in prompt', async () => {
      const specialPrompt = '¿Qué es la IA? 你好 مرحبا';

      mockProvider.generateResponse.mockResolvedValue({ response: 'Response with special chars' });

      const result = await llmService.generateResponse(specialPrompt);

      expect(result).toBeDefined();
    });

    it('should handle missing usage data gracefully', async () => {
      mockProvider.generateResponse.mockResolvedValue({ response: 'Response without usage' });

      const result = await llmService.generateResponse('Test');

      expect(result).toBe('Response without usage');
    });
  });

  describe('generateResponseStream', () => {
    it('should handle streaming responses', async () => {
      const chunks: string[] = [];
      const onChunk = (chunk: string) => chunks.push(chunk);

      // Provider abstraction returns a response string; service simulates streaming by words
      mockProvider.generateResponse.mockResolvedValue({ response: 'Streamed response' });

      const result = await llmService.generateResponseStream('Test', onChunk);

      expect(result).toBe('Streamed response');
      expect(chunks).toEqual(['Streamed ', 'response']);
    });
  });

  describe('edge cases', () => {
    it('should handle null or undefined prompt gracefully', async () => {
      mockProvider.generateResponse.mockResolvedValue({ response: 'Response' });

      // Should throw error for empty prompt
      await expect(llmService.generateResponse('')).rejects.toThrow('Prompt cannot be empty');
    });

    it('should handle rate limit errors', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).status = 429;

      mockProvider.generateResponse.mockRejectedValue(rateLimitError);

      await expect(llmService.generateResponse('Test')).rejects.toThrow(/Failed to generate response/);
    });

    it('should handle authentication errors', async () => {
      const authError = new Error('Invalid API key');
      (authError as any).status = 401;

      mockProvider.generateResponse.mockRejectedValue(authError);

      await expect(llmService.generateResponse('Test')).rejects.toThrow(/Failed to generate response/);
    });
  });
});
