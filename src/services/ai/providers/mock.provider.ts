import HttpError from '../../../models/error.model';
import type {
  AIProvider,
  EmbeddingResult,
  ChatResult,
  GenerationOptions,
  ClassificationResult,
  SummarizationResult
} from './ai-provider.interface';

/**
 * Implementación Mock del proveedor de IA
 *
 * Retorna respuestas determinísticas sin llamar a ningún LLM real.
 * Útil para:
 * - Tests automatizados (rápidos y confiables)
 * - Desarrollo sin conectividad
 * - CI/CD sin API keys
 */
export class MockAIProvider implements AIProvider {
  readonly name = 'mock';

  private readonly embeddingDimensions = 1536; // Simula OpenAI por defecto
  private readonly embeddingModel = 'mock-embedding-model';
  private readonly chatModel = 'mock-chat-model';

  /**
   * Genera un embedding mock (vector de números determinísticos)
   */
  generateEmbedding(text: string): Promise<EmbeddingResult> {
    if (!text || text.trim().length === 0) {
      throw new HttpError(400, 'Text cannot be empty for embedding generation');
    }

    // Genera vector determinístico basado en hash del texto
    const hash = this.simpleHash(text);
    const embedding = Array.from({ length: this.embeddingDimensions }, (_, i) => {
      return Math.sin((hash + i) * 0.01) * 0.1;
    });

    return Promise.resolve({
      embedding,
      dimensions: this.embeddingDimensions,
      model: this.embeddingModel
    });
  }

  /**
   * Genera embeddings para múltiples textos
   */
  generateEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
    if (!texts || texts.length === 0) {
      throw new HttpError(400, 'Texts array cannot be empty');
    }

    if (texts.some(text => !text || text.trim().length === 0)) {
      throw new HttpError(400, 'All texts must be non-empty strings');
    }

    return Promise.all(texts.map(text => this.generateEmbedding(text)));
  }

  /**
   * Genera una respuesta mock
   */
  generateResponse(prompt: string, _options?: GenerationOptions): Promise<ChatResult> {
    if (!prompt || prompt.trim().length === 0) {
      throw new HttpError(400, 'Prompt cannot be empty');
    }

    // Respuesta determinística basada en el prompt
    let response: string;

    if (prompt.toLowerCase().includes('what is')) {
      response =
        'This is a mock response to your question. In a real scenario, an AI model would provide a detailed answer.';
    } else if (
      prompt.toLowerCase().includes('classify') ||
      prompt.toLowerCase().includes('categoría')
    ) {
      response = JSON.stringify({
        category: 'Informe',
        confidence: 0.85,
        tags: ['mock', 'test', 'document']
      });
    } else if (
      prompt.toLowerCase().includes('resume') ||
      prompt.toLowerCase().includes('summarize')
    ) {
      response = JSON.stringify({
        summary:
          'Este es un resumen mock del documento. En un escenario real, la IA generaría un resumen detallado basado en el contenido.',
        keyPoints: [
          'Punto clave 1 del documento',
          'Punto clave 2 del documento',
          'Punto clave 3 del documento'
        ]
      });
    } else {
      response = `Mock AI response for prompt: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`;
    }

    return Promise.resolve({
      response,
      model: this.chatModel,
      tokens: {
        prompt: Math.floor(prompt.length / 4),
        completion: Math.floor(response.length / 4),
        total: Math.floor((prompt.length + response.length) / 4)
      }
    });
  }

  /**
   * Clasifica un documento (respuesta mock)
   */
  classifyDocument(text: string): Promise<ClassificationResult> {
    // Clasificación determinística basada en palabras clave
    const lowerText = text.toLowerCase();

    let category = 'Otro';
    let confidence = 0.7;
    const tags: string[] = ['mock', 'test'];

    if (lowerText.includes('factura') || lowerText.includes('invoice')) {
      category = 'Factura';
      confidence = 0.9;
      tags.push('financial', 'billing');
    } else if (lowerText.includes('contrato') || lowerText.includes('contract')) {
      category = 'Contrato';
      confidence = 0.85;
      tags.push('legal', 'agreement');
    } else if (lowerText.includes('informe') || lowerText.includes('report')) {
      category = 'Informe';
      confidence = 0.8;
      tags.push('report', 'analysis');
    } else if (lowerText.includes('manual') || lowerText.includes('guide')) {
      category = 'Manual';
      confidence = 0.75;
      tags.push('documentation', 'guide');
    }

    return Promise.resolve({
      category,
      confidence,
      tags
    });
  }

  /**
   * Resume un documento (respuesta mock)
   */
  summarizeDocument(text: string): Promise<SummarizationResult> {
    const wordCount = text.split(/\s+/).length;

    return Promise.resolve({
      summary: `Este documento contiene aproximadamente ${wordCount} palabras. Es un documento mock generado para pruebas. En un escenario real, la IA analizaría el contenido y generaría un resumen detallado.`,
      keyPoints: [
        `El documento tiene ${wordCount} palabras`,
        'Punto clave 2 extraído del contenido',
        'Punto clave 3 identificado automáticamente',
        'Conclusión principal del documento'
      ]
    });
  }

  /**
   * Verifica conexión (siempre exitosa para mock)
   */
  checkConnection(): Promise<boolean> {
    // Mock provider siempre está disponible
    return Promise.resolve(true);
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

  /**
   * Función helper para generar hash simple de un string
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}
