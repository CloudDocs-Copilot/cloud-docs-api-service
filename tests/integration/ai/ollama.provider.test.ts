/**
 * Tests de integración para Ollama Provider
 *
 * IMPORTANTE: Estos tests requieren que Ollama esté instalado y corriendo:
 * 1. Instalar Ollama: winget install Ollama.Ollama
 * 2. Descargar modelos: ollama pull llama3.2:3b && ollama pull nomic-embed-text
 * 3. Iniciar servidor: ollama serve (normalmente se inicia automáticamente)
 *
 * Para ejecutar estos tests (se omiten por defecto):
 * RUN_OLLAMA_TESTS=true npm test -- tests/integration/ai/ollama.provider.test.ts
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import {
  getAIProvider,
  resetAIProvider,
  checkAIProviderAvailability
} from '../../../src/services/ai/providers';

// Configurar timeout largo para tests con Ollama (puede ser lento)
jest.setTimeout(30000);

// Only run Ollama integration tests if explicitly enabled via environment variable
// This prevents CI failures when Ollama is not installed/running
const runOllamaTests = process.env.RUN_OLLAMA_TESTS === 'true';
const describeOllama = runOllamaTests ? describe : describe.skip;

describeOllama('Ollama Provider Integration', () => {
  beforeAll(() => {
    process.env.AI_PROVIDER = 'ollama';
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
    process.env.OLLAMA_CHAT_MODEL = 'llama3.2:3b';
    process.env.OLLAMA_EMBEDDING_MODEL = 'nomic-embed-text';
    resetAIProvider();
  });

  describe('Connection', (): void => {
    it('should connect to Ollama server', async (): Promise<void> => {
      const provider = getAIProvider();
      expect(provider.name).toBe('ollama');

      const available = await checkAIProviderAvailability();
      expect(available).toBe(true);
    });

    it('should have correct configuration', (): void => {
      const provider = getAIProvider();
      expect(provider.getEmbeddingModel()).toBe('nomic-embed-text');
      expect(provider.getChatModel()).toBe('llama3.2:3b');
      expect(provider.getEmbeddingDimensions()).toBe(768);
    });
  });

  describe('Embeddings', (): void => {
    it('should generate embedding with nomic-embed-text (768 dims)', async () => {
      const provider = getAIProvider();
      const result = await provider.generateEmbedding('Test text for embedding with Ollama');

      expect(result.embedding).toBeDefined();
      expect(result.embedding).toHaveLength(768);
      expect(result.dimensions).toBe(768);
      expect(result.model).toBe('nomic-embed-text');
    });

    it('should generate embeddings in batch', async (): Promise<void> => {
      const provider = getAIProvider();
      const texts = ['First text', 'Second text', 'Third text'];
      const results = await provider.generateEmbeddings(texts);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.embedding).toHaveLength(768);
        expect(result.dimensions).toBe(768);
      });
    });

    it('should throw error for empty text', async (): Promise<void> => {
      const provider = getAIProvider();
      await expect(provider.generateEmbedding('')).rejects.toThrow();
    });

    it('should generate different embeddings for different texts', async (): Promise<void> => {
      const provider = getAIProvider();
      const result1 = await provider.generateEmbedding('Hello world');
      const result2 = await provider.generateEmbedding('Goodbye world');

      // Los embeddings deben ser diferentes (verificar cosine similarity)
      // En vez de comparar todo el array, verificar que la similitud no sea perfecta
      const dotProduct = result1.embedding.reduce(
        (sum, val, i) => sum + val * result2.embedding[i],
        0
      );
      const norm1 = Math.sqrt(result1.embedding.reduce((sum, val) => sum + val * val, 0));
      const norm2 = Math.sqrt(result2.embedding.reduce((sum, val) => sum + val * val, 0));
      const cosineSimilarity = dotProduct / (norm1 * norm2);

      // La similitud debe ser alta pero no perfecta (embeddings diferentes)
      expect(cosineSimilarity).toBeLessThan(1.0);
      expect(cosineSimilarity).toBeGreaterThan(0.5);
    });
  });

  describe('Chat/Text Generation', (): void => {
    it('should generate response with llama3.2:3b', async (): Promise<void> => {
      const provider = getAIProvider();
      const result = await provider.generateResponse('What is 2+2? Answer with just the number.');

      expect(result.response).toBeTruthy();
      expect(result.model).toBe('llama3.2:3b');
      expect(result.tokens).toBeDefined();
      expect(result.tokens?.total).toBeGreaterThan(0);
    });

    it('should respect temperature parameter', async (): Promise<void> => {
      const provider = getAIProvider();
      const prompt = 'Say hello';

      const result1 = await provider.generateResponse(prompt, { temperature: 0 });
      const result2 = await provider.generateResponse(prompt, { temperature: 0 });

      // Con temperatura 0, las respuestas deben ser idénticas (determinísticas)
      expect(result1.response).toBe(result2.response);
    });

    it('should respect max tokens parameter', async (): Promise<void> => {
      const provider = getAIProvider();
      const result = await provider.generateResponse('Write a long story', { maxTokens: 50 });

      expect(result.tokens?.completion).toBeLessThanOrEqual(50);
    });

    it('should use system message when provided', async (): Promise<void> => {
      const provider = getAIProvider();
      const result = await provider.generateResponse('What is your role?', {
        systemMessage: 'You are a helpful math tutor.'
      });

      expect(result.response).toBeTruthy();
    });
  });

  describe('Document Classification', (): void => {
    it('should classify invoice correctly', async (): Promise<void> => {
      const provider = getAIProvider();
      const invoiceText = `
        FACTURA No. 12345
        Fecha: 2026-02-20
        Cliente: Acme Corp
        Total: $1,000.00
      `;

      const result = await provider.classifyDocument(invoiceText);

      expect(result.category).toBeTruthy();
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.tags).toBeInstanceOf(Array);
    });

    it('should classify contract correctly', async (): Promise<void> => {
      const provider = getAIProvider();
      const contractText = `
        CONTRATO DE PRESTACIÓN DE SERVICIOS
        Entre las partes A y B se acuerda lo siguiente...
      `;

      const result = await provider.classifyDocument(contractText);

      expect(result.category).toBeTruthy();
      expect(result.tags).toBeInstanceOf(Array);
    });
  });

  describe('Document Summarization', (): void => {
    it('should summarize document correctly', async (): Promise<void> => {
      const provider = getAIProvider();
      const longText = `
        Este es un documento extenso que habla sobre inteligencia artificial.
        La IA ha revolucionado muchos aspectos de la tecnología moderna.
        Los modelos de lenguaje como GPT y Llama permiten procesar texto natural.
        Las aplicaciones van desde chatbots hasta análisis de documentos.
        El futuro de la IA es prometedor y seguirá evolucionando.
      `;

      const result = await provider.summarizeDocument(longText);

      expect(result.summary).toBeTruthy();
      expect(result.summary.length).toBeGreaterThan(10);
      expect(result.keyPoints).toBeInstanceOf(Array);
      expect(result.keyPoints.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', (): void => {
    it('should throw error for empty prompt', async (): Promise<void> => {
      const provider = getAIProvider();
      await expect(provider.generateResponse('')).rejects.toThrow('Prompt cannot be empty');
    });

    it('should throw error for empty text in embedding', async (): Promise<void> => {
      const provider = getAIProvider();
      await expect(provider.generateEmbedding('')).rejects.toThrow();
    });

    it('should throw error for empty array in batch embeddings', async (): Promise<void> => {
      const provider = getAIProvider();
      await expect(provider.generateEmbeddings([])).rejects.toThrow();
    });

    it('should handle invalid model gracefully', async (): Promise<void> => {
      const provider = getAIProvider();

      // Intentar usar un modelo que no existe
      await expect(
        provider.generateResponse('test', { model: 'nonexistent-model' })
      ).rejects.toThrow();
    });
  });
});

describe('Ollama Provider - Fallback Behavior', (): void => {
  it('should handle Ollama server not running', async (): Promise<void> => {
    process.env.AI_PROVIDER = 'ollama';
    process.env.OLLAMA_BASE_URL = 'http://localhost:99999'; // Puerto inválido
    resetAIProvider();

    const isAvailable = await checkAIProviderAvailability();
    expect(isAvailable).toBe(false);
  });
});
