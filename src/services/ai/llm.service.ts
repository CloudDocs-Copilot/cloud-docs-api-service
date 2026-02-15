import HttpError from '../../models/error.model';
import type { IGenerationOptions } from '../../models/types/ai.types';

/**
 * Modelo de chat de OpenAI a utilizar
 *
 * gpt-4o-mini: Recomendado para la mayoría de casos
 * - Costo: Económico
 * - Velocidad: Rápida
 * - Calidad: Excelente para tareas generales
 *
 * Alternativas:
 * - gpt-4o: Mayor calidad pero más costoso
 * - gpt-4-turbo: Balance calidad/costo
 * - gpt-3.5-turbo: Más económico pero menor calidad
 */
const CHAT_MODEL = 'gpt-4o-mini';

/**
 * Temperatura por defecto para generación de respuestas
 * 0.0 = Más determinístico
 * 1.0 = Más creativo
 */
const DEFAULT_TEMPERATURE = 0.3;

/**
 * Máximo de tokens a generar en la respuesta
 */
const MAX_TOKENS = 1000;

/**
 * Servicio para interactuar con el LLM de OpenAI
 *
 * Este servicio maneja la comunicación con la API de chat completions
 * para generar respuestas basadas en prompts proporcionados.
 */
export class LlmService {
  /**
   * Genera una respuesta usando el modelo de chat de OpenAI
   *
   * @param prompt - Prompt o pregunta para el modelo
   * @param options - Opciones de configuración (temperatura, maxTokens, etc.)
   * @returns Respuesta generada por el modelo
   * @throws HttpError si el prompt está vacío o hay error en la API
   */
  async generateResponse(prompt: string, options?: IGenerationOptions): Promise<string> {
    // Validar que el prompt no esté vacío
    if (!prompt || prompt.trim().length === 0) {
      throw new HttpError(400, 'Prompt cannot be empty');
    }

    const temperature = options?.temperature ?? DEFAULT_TEMPERATURE;
    const maxTokens = options?.maxTokens ?? MAX_TOKENS;
    const model = options?.model ?? CHAT_MODEL;
    const systemMessage = options?.systemMessage;

    try {
      const envForce = process.env.USE_OPENAI_GLOBAL_MOCK === 'true';
      const globalCreate = (global as any).__OPENAI_CREATE__;

      let openai: any;
      let chatCreate: any;

      if (!envForce) {
        // Load OpenAI client at runtime to allow tests to mock the module
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const OpenAIClientRuntime = require('../../configurations/openai-config').default;
        openai = OpenAIClientRuntime.getInstance();
        chatCreate = openai?.chat?.completions?.create;
      }

      // Construir mensajes para el chat
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

      // Agregar mensaje de sistema si se proporciona
      if (systemMessage && systemMessage.trim().length > 0) {
        messages.push({
          role: 'system',
          content: systemMessage.trim()
        });
      }

      // Agregar el prompt del usuario
      messages.push({
        role: 'user',
        content: prompt.trim()
      });

      console.log(`[llm] Generating response with model ${model}...`);

      // Llamar a la API de chat completions
      const useGlobal =
        envForce || (typeof globalCreate === 'function' && typeof chatCreate !== 'function');

      const response = useGlobal
        ? await globalCreate({
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0
          })
        : await openai.chat.completions.create({
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0
          });

      // Extraer la respuesta del asistente
      const assistantMessage = response.choices[0]?.message?.content;

      // If choices exist but content is an empty string, treat it as a valid empty response
      if (assistantMessage === undefined || assistantMessage === null) {
        throw new Error('Empty response from OpenAI API');
      }

      // Logging de metadata
      const tokensUsed = response.usage?.total_tokens || 0;
      const finishReason = response.choices[0]?.finish_reason;

      console.log(`[llm] Response generated: ${tokensUsed} tokens, finish_reason: ${finishReason}`);

      // Advertir si se alcanzó el límite de tokens
      if (finishReason === 'length') {
        console.warn('[llm] Response was truncated due to max_tokens limit');
      }

      return typeof assistantMessage === 'string'
        ? assistantMessage.trim()
        : String(assistantMessage);
    } catch (error: unknown) {
      // Manejo de errores de OpenAI API
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[llm] Error generating response:', errorMessage);

      // Convertir a HttpError apropiado
      if (errorMessage.includes('API key')) {
        throw new HttpError(500, 'OpenAI API key configuration error');
      } else if (errorMessage.includes('rate limit')) {
        throw new HttpError(429, 'OpenAI API rate limit exceeded');
      } else if (errorMessage.includes('quota')) {
        throw new HttpError(503, 'OpenAI API quota exceeded');
      } else if (errorMessage.includes('context length')) {
        throw new HttpError(400, 'Prompt is too long (exceeds context length)');
      }

      throw new HttpError(500, `Failed to generate response: ${errorMessage}`);
    }
  }

  /**
   * Genera una respuesta con streaming (para futuras implementaciones)
   * Útil para mostrar respuestas en tiempo real
   *
   * @param prompt - Prompt para el modelo
   * @param onChunk - Callback que recibe cada chunk de texto
   * @param options - Opciones de configuración
   * @returns Respuesta completa
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

    const temperature = options?.temperature ?? DEFAULT_TEMPERATURE;
    const maxTokens = options?.maxTokens ?? MAX_TOKENS;
    const model = options?.model ?? CHAT_MODEL;
    const systemMessage = options?.systemMessage;

    try {
      const globalCreate = (global as any).__OPENAI_CREATE__;
      const envForce = process.env.USE_OPENAI_GLOBAL_MOCK === 'true';

      let openai: any;
      let chatCreate: any;

      if (!envForce) {
        // Load OpenAI client at runtime to allow tests to mock the module
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const OpenAIClientRuntime = require('../../configurations/openai-config').default;
        openai = OpenAIClientRuntime.getInstance();
        chatCreate = openai?.chat?.completions?.create;
      }

      // Construir mensajes
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

      if (systemMessage && systemMessage.trim().length > 0) {
        messages.push({
          role: 'system',
          content: systemMessage.trim()
        });
      }

      messages.push({
        role: 'user',
        content: prompt.trim()
      });

      console.log(`[llm] Generating streaming response with model ${model}...`);

      // Llamar a la API con streaming
      const useGlobal =
        envForce || (typeof globalCreate === 'function' && typeof chatCreate !== 'function');

      const stream = useGlobal
        ? await globalCreate({ model, messages, temperature, max_tokens: maxTokens, stream: true })
        : await openai.chat.completions.create({
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
            stream: true
          });

      let fullResponse = '';

      // Procesar stream
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullResponse += content;
          onChunk(content);
        }
      }

      console.log(`[llm] Streaming response completed: ${fullResponse.length} chars`);

      return fullResponse.trim();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[llm] Error in streaming response:', errorMessage);

      if (errorMessage.includes('API key')) {
        throw new HttpError(500, 'OpenAI API key configuration error');
      } else if (errorMessage.includes('rate limit')) {
        throw new HttpError(429, 'OpenAI API rate limit exceeded');
      } else if (errorMessage.includes('quota')) {
        throw new HttpError(503, 'OpenAI API quota exceeded');
      }

      throw new HttpError(500, `Failed to generate streaming response: ${errorMessage}`);
    }
  }

  /**
   * Obtiene el modelo utilizado por defecto
   *
   * @returns Nombre del modelo
   */
  getModel(): string {
    return CHAT_MODEL;
  }

  /**
   * Obtiene la temperatura por defecto
   *
   * @returns Valor de temperatura
   */
  getDefaultTemperature(): number {
    return DEFAULT_TEMPERATURE;
  }

  /**
   * Obtiene el límite de tokens por defecto
   *
   * @returns Máximo de tokens
   */
  getMaxTokens(): number {
    return MAX_TOKENS;
  }
}

/**
 * Instancia singleton del servicio LLM
 */
export const llmService = new LlmService();
