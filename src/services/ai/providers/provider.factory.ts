import type { AIProvider } from './ai-provider.interface';
import { OpenAIProvider } from './openai.provider';
import { OllamaProvider } from './ollama.provider';
import { MockAIProvider } from './mock.provider';

/**
 * Tipos de proveedores disponibles
 */
export type AIProviderType = 'openai' | 'ollama' | 'mock';

/**
 * Singleton para el proveedor de IA actual
 */
let currentProvider: AIProvider | null = null;

/**
 * Factory para obtener el proveedor de IA configurado
 *
 * Lee la variable de entorno AI_PROVIDER para determinar qué proveedor usar:
 * - 'openai': Usa OpenAI API (requiere OPENAI_API_KEY)
 * - 'ollama': Usa Ollama local (requiere Ollama corriendo)
 * - 'mock': Usa respuestas mock (para tests)
 *
 * Por defecto usa 'openai' si no está configurado.
 *
 * @returns Instancia del proveedor de IA
 * @throws Error si el proveedor especificado no es válido
 */
export function getAIProvider(): AIProvider {
  // Si ya existe una instancia, reutilizarla (singleton)
  if (currentProvider) {
    return currentProvider;
  }

  const providerType = (process.env.AI_PROVIDER || 'openai').toLowerCase() as AIProviderType;

  console.log(`[ai-provider-factory] Initializing AI provider: ${providerType}`);
  // Respect explicit AI_PROVIDER. Do not force the mock provider based on
  // NODE_ENV here so unit tests can mock provider clients as needed. Tests
  // that require the mock provider should explicitly set AI_PROVIDER=mock.
  switch (providerType as AIProviderType) {
    case 'openai':
      currentProvider = new OpenAIProvider();
      break;

    case 'ollama':
      currentProvider = new OllamaProvider();
      break;

    case 'mock':
      currentProvider = new MockAIProvider();
      break;

    default:
      throw new Error(
        `Invalid AI provider: ${providerType}. Valid options: 'openai', 'ollama', 'mock'`
      );
  }

  console.log(`[ai-provider-factory] AI provider initialized: ${currentProvider.name}`);
  return currentProvider;
}

/**
 * Reinicia el proveedor de IA (útil para tests)
 * Fuerza la recreación del proveedor en la próxima llamada a getAIProvider()
 */
export function resetAIProvider(): void {
  currentProvider = null;
  console.log('[ai-provider-factory] AI provider reset');
}

/**
 * Obtiene el tipo de proveedor actual desde las variables de entorno
 * @returns Tipo de proveedor configurado
 */
export function getAIProviderType(): AIProviderType {
  return (process.env.AI_PROVIDER || 'openai').toLowerCase() as AIProviderType;
}

/**
 * Verifica si el proveedor actual está disponible y funcionando
 * @returns Promise<boolean> true si está disponible
 */
export async function checkAIProviderAvailability(): Promise<boolean> {
  try {
    const provider = getAIProvider();
    await provider.checkConnection();
    console.log(`[ai-provider-factory] Provider ${provider.name} is available`);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ai-provider-factory] Provider check failed: ${errorMessage}`);
    return false;
  }
}

/**
 * Obtiene información del proveedor actual
 * @returns Información del proveedor (nombre, modelos, dimensiones)
 */
export function getAIProviderInfo() {
  const provider = getAIProvider();
  return {
    name: provider.name,
    chatModel: provider.getChatModel(),
    embeddingModel: provider.getEmbeddingModel(),
    embeddingDimensions: provider.getEmbeddingDimensions()
  };
}
