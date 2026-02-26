import OpenAI from 'openai';
import OpenAIClient from '../../../configurations/openai-config';
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
 * Implementación del proveedor OpenAI
 *
 * Usa la API de OpenAI para embeddings y chat completions.
 * Requiere OPENAI_API_KEY en las variables de entorno.
 */
export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';

  private readonly embeddingModel = 'text-embedding-3-small';
  private readonly embeddingDimensions = 1536;
  private readonly chatModel = 'gpt-4o-mini';
  private readonly defaultTemperature = 0.3;
  private readonly defaultMaxTokens = 1000;

  private client: OpenAI;

  constructor() {
    this.client = OpenAIClient.getInstance();
  }

  /**
   * Genera un embedding usando text-embedding-3-small
   */
  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    if (!text || text.trim().length === 0) {
      throw new HttpError(400, 'Text cannot be empty for embedding generation');
    }

    try {
      const response = await this.client.embeddings.create({
        model: this.embeddingModel,
        input: text,
        encoding_format: 'float'
      });

      const embedding = response.data[0]?.embedding;

      if (!embedding || !Array.isArray(embedding)) {
        throw new Error('Invalid embedding response from OpenAI API');
      }

      if (embedding.length !== this.embeddingDimensions) {
        throw new Error(
          `Unexpected embedding dimensions: expected ${this.embeddingDimensions}, got ${embedding.length}`
        );
      }

      return {
        embedding,
        dimensions: this.embeddingDimensions,
        model: this.embeddingModel
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[openai-provider] Error generating embedding:', errorMessage);

      if (errorMessage.includes('API key')) {
        throw new HttpError(500, 'OpenAI API key configuration error');
      } else if (errorMessage.includes('rate limit')) {
        throw new HttpError(429, 'OpenAI API rate limit exceeded');
      } else if (errorMessage.includes('quota')) {
        throw new HttpError(503, 'OpenAI API quota exceeded');
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
      const response = await this.client.embeddings.create({
        model: this.embeddingModel,
        input: texts,
        encoding_format: 'float'
      });

      return response.data.map(item => ({
        embedding: item.embedding,
        dimensions: this.embeddingDimensions,
        model: this.embeddingModel
      }));
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[openai-provider] Error generating embeddings:', errorMessage);
      throw new HttpError(500, `Failed to generate embeddings: ${errorMessage}`);
    }
  }

  /**
   * Genera una respuesta usando gpt-4o-mini
   */
  async generateResponse(prompt: string, options?: GenerationOptions): Promise<ChatResult> {
    if (!prompt || prompt.trim().length === 0) {
      throw new HttpError(400, 'Prompt cannot be empty');
    }

    const temperature = options?.temperature ?? this.defaultTemperature;
    const maxTokens = options?.maxTokens ?? this.defaultMaxTokens;
    const model = options?.model ?? this.chatModel;
    const systemMessage = options?.systemMessage;

    try {
      const messages: Array<{ role: 'system' | 'user'; content: string }> = [];

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

      console.warn(`[openai-provider] Generating response with ${model}...`);

      const response = await this.client.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxTokens
      });

      const content = response.choices[0]?.message?.content;

      if (!content) {
        throw new Error('No content in OpenAI response');
      }

      return {
        response: content.trim(),
        model,
        tokens: {
          prompt: response.usage?.prompt_tokens || 0,
          completion: response.usage?.completion_tokens || 0,
          total: response.usage?.total_tokens || 0
        }
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[openai-provider] Error generating response:', errorMessage);
      throw new HttpError(500, `Failed to generate response: ${errorMessage}`);
    }
  }

  /**
   * Clasifica un documento usando GPT
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

    const parsed = parseJsonRecord(result.response);

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

      console.error('[openai-provider] Failed to parse classification:', result.response);

    return {
      category: 'Otro',
      confidence: 0.3,
      tags: []
    };
  }

  /**
   * Resume un documento usando GPT
   */
  async summarizeDocument(text: string): Promise<SummarizationResult> {
    const prompt = `Resume el siguiente documento en 2-3 frases y extrae 3-5 puntos clave más importantes.

Texto del documento (primeros 4000 caracteres):
${text.substring(0, 4000)}

Responde ÚNICAMENTE con un objeto JSON válido (sin markdown, sin explicaciones):
{
  "summary": "Resumen en 2-3 frases",
  "keyPoints": ["punto1", "punto2", "punto3"]
}`;

    const result = await this.generateResponse(prompt, {
      temperature: 0.3,
      maxTokens: 500
    });

    const parsed = parseJsonRecord(result.response);

    if (parsed) {
      const summary =
        typeof parsed.summary === 'string' ? parsed.summary : 'No se pudo generar resumen';
      const keyPoints = parseStringArray(parsed.keyPoints);

      return {
        summary,
        keyPoints
      };
    }

      console.error('[openai-provider] Failed to parse summary:', result.response);

    return {
      summary: 'Error al generar resumen',
      keyPoints: []
    };
  }

  /**
   * Verifica conexión con OpenAI
   */
  async checkConnection(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[openai-provider] OpenAI connection failed: ${errorMessage}`);
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
