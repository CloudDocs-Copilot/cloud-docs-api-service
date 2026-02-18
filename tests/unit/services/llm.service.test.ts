/**
 * Unit tests for LLM Service
 */

import { llmService } from '../../../src/services/ai/llm.service';
import OpenAIClient from '../../../src/configurations/openai-config';
import HttpError from '../../../src/models/error.model';

// Mock OpenAI configuration
jest.mock('../../../src/configurations/openai-config');

describe('LLMService', () => {
  let mockCreate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockCreate = jest.fn();

    (OpenAIClient.getInstance as jest.Mock) = jest.fn().mockReturnValue({
      chat: {
        completions: {
          create: mockCreate
        }
      }
    });
  });

  describe('generateResponse', () => {
    it('should generate response for a prompt', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: 'This is a test response from the AI model.'
            }
          }
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30
        }
      });

      const result = await llmService.generateResponse('What is AI?');

      expect(result).toBe('This is a test response from the AI model.');
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: 'What is AI?'
          }
        ],
        temperature: 0.3,
        max_tokens: 1000,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0
      });
    });

    it('should handle empty response from API', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: ''
            }
          }
        ]
      });

      const result = await llmService.generateResponse('Test prompt');

      expect(result).toBe('');
    });

    it('should throw error when API fails', async () => {
      mockCreate.mockRejectedValue(new Error('API unavailable'));

      await expect(llmService.generateResponse('Test prompt')).rejects.toThrow(HttpError);
    });

    it('should handle missing choices in response', async () => {
      mockCreate.mockResolvedValue({
        choices: []
      });

      await expect(llmService.generateResponse('Test')).rejects.toThrow(
        'Empty response from OpenAI API'
      );
    });

    it('should handle long prompts', async () => {
      const longPrompt = 'word '.repeat(5000);

      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: 'Response for long prompt'
            }
          }
        ]
      });

      const result = await llmService.generateResponse(longPrompt);

      expect(result).toBeDefined();
      expect(mockCreate).toHaveBeenCalled();
    });

    it('should use correct temperature setting', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: 'Test response'
            }
          }
        ]
      });

      await llmService.generateResponse('Test');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.3
        })
      );
    });

    it('should handle special characters in prompt', async () => {
      const specialPrompt = '¿Qué es la IA? 你好 مرحبا';

      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: 'Response with special chars'
            }
          }
        ]
      });

      const result = await llmService.generateResponse(specialPrompt);

      expect(result).toBeDefined();
    });

    it('should handle missing usage data gracefully', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: 'Response without usage'
            }
          }
        ]
        // No usage field
      });

      const result = await llmService.generateResponse('Test');

      expect(result).toBe('Response without usage');
    });
  });

  describe('generateResponseStream', () => {
    it('should handle streaming responses', async () => {
      const chunks: string[] = [];
      const onChunk = (chunk: string) => chunks.push(chunk);

      // Mock async iterator for streaming
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { choices: [{ delta: { content: 'Streamed ' } }] };
          yield { choices: [{ delta: { content: 'response' } }] };
        }
      };

      mockCreate.mockResolvedValue(mockStream);

      const result = await llmService.generateResponseStream('Test', onChunk);

      expect(result).toBe('Streamed response');
      expect(chunks).toEqual(['Streamed ', 'response']);
    });
  });

  describe('edge cases', () => {
    it('should handle null or undefined prompt gracefully', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: 'Response'
            }
          }
        ]
      });

      // Should throw error for empty prompt
      await expect(llmService.generateResponse('')).rejects.toThrow(HttpError);
    });

    it('should handle rate limit errors', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).status = 429;

      mockCreate.mockRejectedValue(rateLimitError);

      await expect(llmService.generateResponse('Test')).rejects.toThrow(HttpError);
    });

    it('should handle authentication errors', async () => {
      const authError = new Error('Invalid API key');
      (authError as any).status = 401;

      mockCreate.mockRejectedValue(authError);

      await expect(llmService.generateResponse('Test')).rejects.toThrow(HttpError);
    });
  });
});
