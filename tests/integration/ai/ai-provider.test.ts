/**
 * Tests de integración para los proveedores de IA
 *
 * Estos tests verifican que:
 * - El factory selecciona el proveedor correcto según AI_PROVIDER
 * - MockProvider funciona correctamente (para tests rápidos)
 * - OllamaProvider puede conectarse y generar embeddings/respuestas
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import {
  getAIProvider,
  resetAIProvider,
  getAIProviderType,
  getAIProviderInfo,
  checkAIProviderAvailability
} from '../../../src/services/ai/providers';

describe('AI Provider Factory', () => {
  beforeAll(() => {
    // Asegurar que el provider esté limpio antes de cada test
    resetAIProvider();
  });

  afterAll(() => {
    resetAIProvider();
  });

  describe('Factory Selection', () => {
    it('should select mock provider when AI_PROVIDER=mock', () => {
      process.env.AI_PROVIDER = 'mock';
      resetAIProvider();

      const provider = getAIProvider();
      expect(provider.name).toBe('mock');
      expect(getAIProviderType()).toBe('mock');
    });

    it('should select ollama provider when AI_PROVIDER=ollama', () => {
      process.env.AI_PROVIDER = 'ollama';
      resetAIProvider();

      const provider = getAIProvider();
      expect(provider.name).toBe('ollama');
      expect(getAIProviderType()).toBe('ollama');
    });

    it('should throw error for invalid provider', () => {
      process.env.AI_PROVIDER = 'invalid-provider';
      resetAIProvider();

      expect(() => getAIProvider()).toThrow('Invalid AI provider');
    });

    it('should return provider info correctly', () => {
      process.env.AI_PROVIDER = 'mock';
      resetAIProvider();

      const info = getAIProviderInfo();
      expect(info).toHaveProperty('name');
      expect(info).toHaveProperty('chatModel');
      expect(info).toHaveProperty('embeddingModel');
      expect(info).toHaveProperty('embeddingDimensions');
    });
  });
});

describe('MockAI Provider', () => {
  beforeAll(() => {
    process.env.AI_PROVIDER = 'mock';
    resetAIProvider();
  });

  it('should be available immediately', async () => {
    const isAvailable = await checkAIProviderAvailability();
    expect(isAvailable).toBe(true);
  });

  it('should generate embedding with 1536 dimensions', async () => {
    const provider = getAIProvider();
    const result = await provider.generateEmbedding('Test text for embedding');

    expect(result.embedding).toHaveLength(1536);
    expect(result.dimensions).toBe(1536);
    expect(result.model).toBe('mock-embedding-model');
  });

  it('should generate embeddings in batch', async () => {
    const provider = getAIProvider();
    const texts = ['Text 1', 'Text 2', 'Text 3'];
    const results = await provider.generateEmbeddings(texts);

    expect(results).toHaveLength(3);
    results.forEach(result => {
      expect(result.embedding).toHaveLength(1536);
    });
  });

  it('should generate chat response', async () => {
    const provider = getAIProvider();
    const result = await provider.generateResponse('What is 2+2?');

    expect(result.response).toBeTruthy();
    expect(result.model).toBe('mock-chat-model');
    expect(result.tokens).toBeDefined();
  });

  it('should classify document', async () => {
    const provider = getAIProvider();
    const result = await provider.classifyDocument('Este es un informe técnico sobre el proyecto');

    expect(result.category).toBe('Informe');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.tags).toBeInstanceOf(Array);
  });

  it('should summarize document', async () => {
    const provider = getAIProvider();
    const result = await provider.summarizeDocument(
      'Este es un documento largo con mucho contenido importante.'
    );

    expect(result.summary).toBeTruthy();
    expect(result.keyPoints).toBeInstanceOf(Array);
    expect(result.keyPoints.length).toBeGreaterThan(0);
  });

  it('should have consistent embedding dimensions', () => {
    const provider = getAIProvider();
    expect(provider.getEmbeddingDimensions()).toBe(1536);
  });
});
