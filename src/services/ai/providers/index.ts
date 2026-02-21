/**
 * AI Providers Module
 * 
 * Exports para el sistema de proveedores de IA intercambiables.
 * Permite usar OpenAI, Ollama o Mock sin cambiar el código de negocio.
 */

// Interface base
export type {
  AIProvider,
  EmbeddingResult,
  ChatResult,
  GenerationOptions,
  ClassificationResult,
  SummarizationResult
} from './ai-provider.interface';

// Implementaciones de proveedores
export { OpenAIProvider } from './openai.provider';
export { OllamaProvider } from './ollama.provider';
export { MockAIProvider } from './mock.provider';

// Factory y utilidades
export {
  getAIProvider,
  resetAIProvider,
  getAIProviderType,
  checkAIProviderAvailability,
  getAIProviderInfo,
  type AIProviderType
} from './provider.factory';
