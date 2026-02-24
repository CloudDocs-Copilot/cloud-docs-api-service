import HttpError from '../../models/error.model';
import type { IGenerationOptions } from '../../models/types/ai.types';
import { getAIProvider } from './providers';

/**
 * Servicio para interactuar con Large Language Models (LLMs)
 *
 * MIGRADO A PROVIDER ABSTRACTION (RFE-AI-001)
 *
 * Este servicio ahora delega toda la lógica de generación de texto
 * al provider configurado (OpenAI, Ollama, Mock, etc.), permitiendo:
 * - Cambiar de proveedor sin modificar código
 * - Soportar múltiples modelos de chat
 * - Configuración dinámica según provider
 *
 * Proveedores soportados:
 * - OpenAI: gpt-4o-mini, gpt-4o, gpt-4-turbo, etc.
 * - Ollama: llama3.2:3b, llama3.1, mistral, etc.
 * - Mock: Respuestas determinísticas para tests
 */
export class LlmService {
  /**
   * Genera una respuesta usando el modelo de chat del provider activo
   *
   * Delega al provider configurado via AI_PROVIDER env var.
   *
   * @param prompt - Prompt o pregunta para el modelo
   * @param options - Opciones de configuración (temperatura, maxTokens, systemMessage, etc.)
   * @returns Respuesta generada por el modelo
   * @throws HttpError si el prompt está vacío o hay error en el provider
   */
  async generateResponse(prompt: string, options?: IGenerationOptions): Promise<string> {
    // Validar que el prompt no esté vacío
    if (!prompt || prompt.trim().length === 0) {
      throw new HttpError(400, 'Prompt cannot be empty');
    }

    try {
      const provider = getAIProvider();

      console.log(`[llm] Generating response with provider ${provider.name}...`);

      // Delegar al provider - maneja toda la lógica de generación
      const result = await provider.generateResponse(prompt, options);

      if (result === undefined || result === null || result.response === undefined) {
        throw new Error('Provider returned invalid response (undefined or null)');
      }

      // Extraer la respuesta del resultado y trim
      return result.response.trim();
    } catch (error: unknown) {
      // Manejo de errores genérico - providers lanzan HttpError directamente
      if (error instanceof HttpError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[llm] Error generating response:', errorMessage);

      throw new HttpError(500, `Failed to generate response: ${errorMessage}`);
    }
  }

  /**
   * Genera una respuesta con streaming (para futuras implementaciones)
   * Útil para mostrar respuestas en tiempo real
   *
   * NOTA: Actualmente NO implementado en todos los providers.
   * Solo OpenAI soporta streaming nativo.
   * Otros providers pueden simular streaming procesando la respuesta completa.
   *
   * @param prompt - Prompt para el modelo
   * @param onChunk - Callback que recibe cada chunk de texto
   * @param options - Opciones de configuración
   * @returns Respuesta completa
   * @throws HttpError si el prompt está vacío o hay error
   */
  async generateResponseStream(
    prompt: string,
    onChunk: (chunk: string) => void,
    options?: IGenerationOptions
  ): Promise<string> {
    // Validar que el prompt no esté vacío
    if (!prompt || prompt.trim().length === 0) {
      throw new HttpError(400, 'Prompt cannot be empty');
    }

    try {
      const provider = getAIProvider();

      console.log(`[llm] Generating streaming response with provider ${provider.name}...`);

      // NOTA: No todos los providers implementan streaming
      // Si el provider no lo soporta, generamos la respuesta completa y simulamos streaming
      // Por ahora, simplificamos usando generateResponse()
      // TODO: Implementar streaming nativo en providers que lo soporten

      const result = await provider.generateResponse(prompt, options);
      const response = result.response;

      // Simular streaming enviando la respuesta completa en chunks
      if (onChunk && response) {
        // Dividir en palabras para simular streaming
        const words = response.split(' ');
        for (let i = 0; i < words.length; i++) {
          const chunk = i === words.length - 1 ? words[i] : words[i] + ' ';
          onChunk(chunk);
        }
      }

      return response;
    } catch (error: unknown) {
      if (error instanceof HttpError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[llm] Error in streaming response:', errorMessage);

      throw new HttpError(500, `Failed to generate streaming response: ${errorMessage}`);
    }
  }

  /**
   * Obtiene el modelo de chat utilizado por el provider activo
   *
   * Modelos según provider:
   * - OpenAI: gpt-4o-mini, gpt-4o, gpt-4-turbo, etc.
   * - Ollama: llama3.2:3b, llama3.1, mistral, etc.
   * - Mock: mock-chat-model
   *
   * @returns Nombre del modelo
   */
  getModel(): string {
    const provider = getAIProvider();
    return provider.getChatModel();
  }

  /**
   * Obtiene la temperatura por defecto del provider activo
   *
   * La temperatura controla la aleatoriedad de las respuestas:
   * - 0.0: Más determinístico y conservador
   * - 1.0: Más creativo y aleatorio
   *
   * @returns Valor de temperatura (típicamente 0.3)
   */
  getDefaultTemperature(): number {
    // Por ahora retornamos un valor fijo
    // TODO: Algunos providers podrían tener diferentes defaults
    return 0.3;
  }

  /**
   * Obtiene el límite de tokens por defecto del provider activo
   *
   * Los tokens limitan la longitud de la respuesta generada.
   *
   * @returns Máximo de tokens (típicamente 1000)
   */
  getMaxTokens(): number {
    // Por ahora retornamos un valor fijo
    // TODO: Algunos providers podrían tener diferentes límites
    return 1000;
  }
}

/**
 * Instancia singleton del servicio LLM
 */
export const llmService = new LlmService();
