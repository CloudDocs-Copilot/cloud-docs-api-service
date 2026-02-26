import { Ollama } from 'ollama';
import HttpError from '../../../models/error.model';
import { DOCUMENT_CATEGORIES } from '../../../models/types/ai.types';
import type {
  AIProvider,
  EmbeddingResult,
  ChatResult,
  GenerationOptions,
  ClassificationResult,
  SummarizationResult
} from './ai-provider.interface';

function parseJsonRecord(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);

    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }

    return null;
  } catch {
    return null;
  }
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

/**
 * Implementación del proveedor Ollama
 *
 * Usa modelos locales ejecutados por Ollama (sin costo, sin API key).
 * Requiere que Ollama esté instalado y corriendo en localhost:11434.
 *
 * Modelos recomendados:
 * - Chat: llama3.2:3b
 * - Embeddings: nomic-embed-text (768 dims)
 */
export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';

  private readonly baseUrl: string;
  private readonly chatModel: string;
  private readonly embeddingModel: string;
  private readonly embeddingDimensions = 768; // nomic-embed-text dims
  private readonly defaultTemperature = 0.3;
  private readonly defaultMaxTokens = 1000;

  private client: Ollama;

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.chatModel = process.env.OLLAMA_CHAT_MODEL || 'llama3.2:3b';
    this.embeddingModel = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';

    this.client = new Ollama({
      host: this.baseUrl
    });

    console.warn(
      `[ollama-provider] Initialized with chat model: ${this.chatModel}, embedding model: ${this.embeddingModel}`
    );
  }

  /**
   * Genera un embedding usando nomic-embed-text (768 dims)
   */
  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    if (!text || text.trim().length === 0) {
      throw new HttpError(400, 'Text cannot be empty for embedding generation');
    }

    try {
      const response = await this.client.embeddings({
        model: this.embeddingModel,
        prompt: text
      });

      const embedding = response.embedding;

      if (!embedding || !Array.isArray(embedding)) {
        throw new Error('Invalid embedding response from Ollama');
      }

      if (embedding.length !== this.embeddingDimensions) {
        console.warn(
          `[ollama-provider] Unexpected embedding dimensions: expected ${this.embeddingDimensions}, got ${embedding.length}`
        );
        // Ajustar dimensiones si es necesario
        // this.embeddingDimensions = embedding.length;
      }

      return {
        embedding,
        dimensions: embedding.length,
        model: this.embeddingModel
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ollama-provider] Error generating embedding:', errorMessage);

      if (errorMessage.includes('not found') || errorMessage.includes('model')) {
        throw new HttpError(
          500,
          `Ollama model ${this.embeddingModel} not found. Run: ollama pull ${this.embeddingModel}`
        );
      } else if (errorMessage.includes('connection') || errorMessage.includes('ECONNREFUSED')) {
        throw new HttpError(503, 'Ollama server not running. Start it with: ollama serve');
      }

      throw new HttpError(500, `Failed to generate embedding: ${errorMessage}`);
    }
  }

  /**
   * Genera embeddings para múltiples textos en batch
   */
  async generateEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
    if (!texts || texts.length === 0) {
      throw new HttpError(400, 'Texts array cannot be empty');
    }

    if (texts.some(text => !text || text.trim().length === 0)) {
      throw new HttpError(400, 'All texts must be non-empty strings');
    }

    try {
      // Ollama no tiene batch nativo, procesamos secuencialmente
      const results = await Promise.all(texts.map(text => this.generateEmbedding(text)));

      return results;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ollama-provider] Error generating embeddings:', errorMessage);
      throw new HttpError(500, `Failed to generate embeddings: ${errorMessage}`);
    }
  }

  /**
   * Genera una respuesta usando llama3.2:3b
   */
  async generateResponse(prompt: string, options?: GenerationOptions): Promise<ChatResult> {
    if (!prompt || prompt.trim().length === 0) {
      throw new HttpError(400, 'Prompt cannot be empty');
    }

    const temperature = options?.temperature ?? this.defaultTemperature;
    const maxTokens = options?.maxTokens ?? this.defaultMaxTokens;
    const model = options?.model ?? this.chatModel;
    const systemMessage = options?.systemMessage;

    // Implement retry logic for transient "fetch failed" / network errors
    // Configurable via OLLAMA_MAX_RETRIES (default: 1 for tests, 3 for dev/prod)
    const maxRetries = process.env.OLLAMA_MAX_RETRIES 
      ? parseInt(process.env.OLLAMA_MAX_RETRIES, 10) 
      : (process.env.NODE_ENV === 'test' ? 1 : 3);
    const baseDelay = 300; // ms

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.warn(`[ollama-provider] Generating response with ${model} (attempt ${attempt})...`);

        const response = await this.client.generate({
          model,
          prompt: prompt.trim(),
          system: systemMessage?.trim(),
          options: {
            temperature,
            num_predict: maxTokens,
            num_ctx: 2048 // Optimizado para prompts ~4000 chars (suficiente, no excesivo)
          }
        });

        if (!response || !response.response) {
          throw new Error('No content in Ollama response');
        }

        return {
          response: response.response.trim(),
          model,
          tokens: {
            prompt: response.prompt_eval_count || 0,
            completion: response.eval_count || 0,
            total: (response.prompt_eval_count || 0) + (response.eval_count || 0)
          }
        };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[ollama-provider] Error generating response (attempt ${attempt}):`, errorMessage);

        // If final attempt, map to a helpful HttpError
        if (attempt === maxRetries) {
          if (errorMessage.includes('not found') || errorMessage.includes('model')) {
            throw new HttpError(500, `Ollama model ${model} not found. Run: ollama pull ${model}`);
          } else if (errorMessage.includes('connection') || errorMessage.includes('ECONNREFUSED')) {
            throw new HttpError(503, 'Ollama server not running. Start it with: ollama serve');
          } else if (errorMessage.includes('fetch failed') || errorMessage.includes('network')) {
            throw new HttpError(
              503,
              `Failed to generate response: network error or Ollama busy. Check Ollama logs and resources (RAM/CPU). Last error: ${errorMessage}`
            );
          }

          // Generic failure
          throw new HttpError(500, `Failed to generate response: ${errorMessage}`);
        }

        // Otherwise wait and retry with exponential backoff
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise(res => setTimeout(res, delay));
        // then retry
      }
    }

    // Should not reach here
    throw new HttpError(500, 'Failed to generate response: unknown error after retries');
  }

  /**
   * Clasifica un documento usando Llama
   */
  async classifyDocument(text: string): Promise<ClassificationResult> {
    const prompt = `Analiza el siguiente documento y clasifícalo.

Categorías posibles: ${DOCUMENT_CATEGORIES.join(', ')}

Texto del documento (primeros 2000 caracteres):
${text.substring(0, 2000)}

Responde ÚNICAMENTE con un objeto JSON válido (sin markdown, sin explicaciones):
{
  "category": "nombre_de_la_categoría",
  "confidence": 0.95,
  "tags": ["tag1", "tag2", "tag3"]
}`;

    const result = await this.generateResponse(prompt, {
      temperature: 0.2,
      maxTokens: 200
    });

    // Limpiar markdown si existe
    let jsonStr = result.response.trim();
    jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');

    const parsed = parseJsonRecord(jsonStr);
    if (parsed) {
      const category = typeof parsed.category === 'string' ? parsed.category : 'Otro';
      const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;
      const tags = parseStringArray(parsed.tags);

      return {
        category,
        confidence,
        tags
      };
    }

      console.error('[ollama-provider] Failed to parse classification:', result.response);

    return {
      category: 'Otro',
      confidence: 0.3,
      tags: []
    };
  }

  /**
   * Resume un documento usando Llama
   */
  async summarizeDocument(text: string): Promise<SummarizationResult> {
    try {
      const prompt = `Resume el siguiente documento en 2-3 frases y extrae 3-5 puntos clave más importantes.

Texto del documento (primeros 4000 caracteres):
${text.substring(0, 4000)}

Responde ÚNICAMENTE con un objeto JSON válido (sin markdown, sin explicaciones):
{
  "summary": "Resumen en 2-3 frases",
  "keyPoints": ["punto1", "punto2", "punto3"]
}`;

      console.warn('[ollama-provider] Requesting summarization...');
      const result = await this.generateResponse(prompt, {
        temperature: 0.3,
        maxTokens: 500
      });

      console.warn('[ollama-provider] Raw Ollama response:', result.response.substring(0, 200));

      // Limpiar markdown si existe
      let jsonStr = result.response.trim();
      jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');

      const parsed = parseJsonRecord(jsonStr);

      if (!parsed) {
        throw new Error('Invalid summary JSON payload');
      }

      const summary = typeof parsed.summary === 'string' ? parsed.summary : '';
      const keyPoints = parseStringArray(parsed.keyPoints);

      if (!summary || keyPoints.length === 0) {
        throw new Error('Invalid summary structure: missing summary or keyPoints');
      }

      console.warn('[ollama-provider] Summary generated successfully');
      return {
        summary,
        keyPoints
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ollama-provider] Summarization error:', errorMessage);
      
      // Re-throw para que el job capture el error real
      throw new HttpError(500, `Failed to generate summary: ${errorMessage}`);
    }
  }

  /**
   * Verifica conexión con Ollama
   */
  async checkConnection(): Promise<boolean> {
    try {
      await this.client.list();
      return true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `[ollama-provider] Ollama connection failed: ${errorMessage}. Is Ollama running on ${this.baseUrl}?`
      );
      return false;
    }
  }

  getEmbeddingDimensions(): number {
    return this.embeddingDimensions;
  }

  getEmbeddingModel(): string {
    return this.embeddingModel;
  }

  getChatModel(): string {
    return this.chatModel;
  }
}
