import OpenAIClient from '../../configurations/openai-config';
import HttpError from '../../models/error.model';
import { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from '../../models/types/ai.types';

/**
 * EMBEDDING_MODEL y EMBEDDING_DIMENSIONS ahora se importan desde ai.types.ts
 *
 * text-embedding-3-small: Recomendado para la mayoría de casos
 * - Dimensiones: 1536
 * - Costo: Económico
 * - Rendimiento: Excelente balance calidad/precio
 *
 * Alternativas:
 * - text-embedding-3-large: Mayor calidad (3072 dims) pero más costoso
 * - text-embedding-ada-002: Modelo legacy (1536 dims)
 */

/**
 * Servicio para generar embeddings vectoriales usando OpenAI
 *
 * Este servicio se encarga exclusivamente de convertir texto en vectores numéricos.
 * NO maneja almacenamiento ni lógica de búsqueda - solo generación de embeddings.
 */
export class EmbeddingService {
  /**
   * Genera un embedding vectorial a partir de texto
   *
   * @param text - Texto a convertir en vector de embeddings
   * @returns Vector numérico de 1536 dimensiones
   * @throws HttpError si el texto está vacío o hay error en la API
   */
  async generateEmbedding(text: string): Promise<number[]> {
    // Validar que el texto no esté vacío
    if (!text || text.trim().length === 0) {
      throw new HttpError(400, 'Text cannot be empty for embedding generation');
    }

    try {
      const openai = OpenAIClient.getInstance();

      // Generar embedding usando OpenAI API
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text,
        encoding_format: 'float' // Formato de punto flotante estándar
      });

      // Extraer el vector de embedding
      const embedding = response.data[0]?.embedding;

      if (!embedding || !Array.isArray(embedding)) {
        throw new Error('Invalid embedding response from OpenAI API');
      }

      // Validar dimensiones del vector
      if (embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Unexpected embedding dimensions: expected ${EMBEDDING_DIMENSIONS}, got ${embedding.length}`
        );
      }

      return embedding;
    } catch (error: unknown) {
      // Manejo de errores de OpenAI API
      if (error instanceof HttpError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[embedding] Error generating embedding:', errorMessage);

      // Convertir a HttpError apropiado
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
   * Genera embeddings para múltiples textos en lote
   * Más eficiente que llamar a generateEmbedding() múltiples veces
   *
   * @param texts - Array de textos a procesar
   * @returns Array de vectores de embeddings
   * @throws HttpError si algún texto está vacío o hay error en la API
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    // Validar que el array no esté vacío
    if (!texts || texts.length === 0) {
      throw new HttpError(400, 'Texts array cannot be empty');
    }

    // Validar que ningún texto esté vacío
    if (texts.some(text => !text || text.trim().length === 0)) {
      throw new HttpError(400, 'All texts must be non-empty for embedding generation');
    }

    try {
      const openai = OpenAIClient.getInstance();

      // Generar embeddings en lote
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: texts,
        encoding_format: 'float'
      });

      // Extraer vectores en el orden correcto
      const embeddings = response.data
        .sort((a: { index: number }, b: { index: number }) => a.index - b.index) // Ordenar por índice
        .map((item: { index: number; embedding: number[] }) => item.embedding);

      // Validar que se generaron todos los embeddings
      if (embeddings.length !== texts.length) {
        throw new Error(`Expected ${texts.length} embeddings, got ${embeddings.length}`);
      }

      // Validar dimensiones de cada vector
      for (const embedding of embeddings) {
        if (embedding.length !== EMBEDDING_DIMENSIONS) {
          throw new Error(
            `Unexpected embedding dimensions: expected ${EMBEDDING_DIMENSIONS}, got ${embedding.length}`
          );
        }
      }

      return embeddings;
    } catch (error: unknown) {
      // Manejo de errores similar a generateEmbedding
      if (error instanceof HttpError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[embedding] Error generating embeddings batch:', errorMessage);

      if (errorMessage.includes('API key')) {
        throw new HttpError(500, 'OpenAI API key configuration error');
      } else if (errorMessage.includes('rate limit')) {
        throw new HttpError(429, 'OpenAI API rate limit exceeded');
      } else if (errorMessage.includes('quota')) {
        throw new HttpError(503, 'OpenAI API quota exceeded');
      }

      throw new HttpError(500, `Failed to generate embeddings: ${errorMessage}`);
    }
  }

  /**
   * Obtiene el modelo de embeddings utilizado
   * Útil para logging y debugging
   *
   * @returns Nombre del modelo de OpenAI
   */
  getModel(): string {
    return EMBEDDING_MODEL;
  }

  /**
   * Obtiene las dimensiones del vector de embedding
   *
   * @returns Número de dimensiones (1536 para text-embedding-3-small)
   */
  getDimensions(): number {
    return EMBEDDING_DIMENSIONS;
  }
}

/**
 * Instancia singleton del servicio de embeddings
 * Exportada para uso en toda la aplicación
 */
export const embeddingService = new EmbeddingService();
