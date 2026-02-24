import HttpError from '../../models/error.model';
import { getAIProvider } from './providers';

/**
 * Servicio para generar embeddings vectoriales
 *
 * MIGRADO A PROVIDER ABSTRACTION (RFE-AI-001)
 *
 * Este servicio ahora delega toda la lógica de generación de embeddings
 * al provider configurado (OpenAI, Ollama, Mock, etc.), permitiendo:
 * - Cambiar de proveedor sin modificar código
 * - Soportar múltiples modelos de embeddings
 * - Dimensiones dinámicas según provider (1536, 768, etc.)
 *
 * Proveedores soportados:
 * - OpenAI: text-embedding-3-small (1536 dims)
 * - Ollama: nomic-embed-text (768 dims)
 * - Mock: Embeddings determinísticos para tests
 *
 * Este servicio se encarga exclusivamente de convertir texto en vectores numéricos.
 * NO maneja almacenamiento ni lógica de búsqueda - solo generación de embeddings.
 */
export class EmbeddingService {
  /**
   * Genera un embedding vectorial a partir de texto
   *
   * Delega al provider activo configurado via AI_PROVIDER env var.
   *
   * @param text - Texto a convertir en vector de embeddings
   * @returns Vector numérico (dimensiones dependen del provider)
   * @throws HttpError si el texto está vacío o hay error en el provider
   */
  async generateEmbedding(text: string): Promise<number[]> {
    // Validar que el texto no esté vacío
    if (!text || text.trim().length === 0) {
      throw new HttpError(400, 'Text cannot be empty for embedding generation');
    }

    try {
      const provider = getAIProvider();

      // Delegar al provider - maneja su propia implementación y errores
      const result = await provider.generateEmbedding(text);

      if (
        !result ||
        !result.embedding ||
        !Array.isArray(result.embedding) ||
        result.embedding.length === 0
      ) {
        throw new Error('Provider returned invalid embedding (empty or not an array)');
      }

      return result.embedding;
    } catch (error: unknown) {
      // Manejo de errores genérico - providers lanzan HttpError directamente
      if (error instanceof HttpError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[embedding] Error generating embedding:', errorMessage);

      throw new HttpError(500, `Failed to generate embedding: ${errorMessage}`);
    }
  }

  /**
   * Genera embeddings para múltiples textos en lote
   * Más eficiente que llamar a generateEmbedding() múltiples veces
   *
   * Delega al provider activo - algunos providers (como OpenAI) optimizan
   * procesamiento en lote, mientras que otros procesan secuencialmente.
   *
   * @param texts - Array de textos a procesar
   * @returns Array de vectores de embeddings
   * @throws HttpError si algún texto está vacío o hay error en el provider
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
      const provider = getAIProvider();

      // Delegar al provider - maneja batch processing según sus capacidades
      const results = await provider.generateEmbeddings(texts);

      // Validar que se generaron todos los embeddings
      if (results.length !== texts.length) {
        throw new Error(`Expected ${texts.length} embeddings, got ${results.length}`);
      }

      // Extraer los embeddings de los resultados y validar
      const embeddings: number[][] = [];
      for (let i = 0; i < results.length; i++) {
        const embedding = results[i].embedding;
        if (!Array.isArray(embedding) || embedding.length === 0) {
          throw new Error(`Invalid embedding at index ${i}: not a valid array`);
        }
        embeddings.push(embedding);
      }

      return embeddings;
    } catch (error: unknown) {
      // Manejo de errores genérico
      if (error instanceof HttpError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[embedding] Error generating embeddings batch:', errorMessage);

      throw new HttpError(500, `Failed to generate embeddings: ${errorMessage}`);
    }
  }

  /**
   * Obtiene el modelo de embeddings utilizado por el provider activo
   * Útil para logging y debugging
   *
   * @returns Nombre del modelo (e.g., 'text-embedding-3-small', 'nomic-embed-text')
   */
  getModel(): string {
    const provider = getAIProvider();
    return provider.getEmbeddingModel();
  }

  /**
   * Obtiene las dimensiones del vector de embedding del provider activo
   * IMPORTANTE: Las dimensiones varían según el provider:
   * - OpenAI text-embedding-3-small: 1536
   * - Ollama nomic-embed-text: 768
   * - Mock: 1536 (compatible con OpenAI)
   *
   * @returns Número de dimensiones del vector
   */
  getDimensions(): number {
    const provider = getAIProvider();
    return provider.getEmbeddingDimensions();
  }
}

/**
 * Instancia singleton del servicio de embeddings
 * Exportada para uso en toda la aplicación
 */
export const embeddingService = new EmbeddingService();
