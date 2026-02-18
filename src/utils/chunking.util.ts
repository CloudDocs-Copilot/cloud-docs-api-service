import type { IChunkConfig, IChunkWithMetadata } from '../models/types/ai.types';

/**
 * Configuración para el chunking de documentos
 */
export const CHUNK_CONFIG: IChunkConfig = {
  /**
   * Tamaño objetivo de cada chunk en palabras
   */
  TARGET_WORDS: 800,

  /**
   * Tamaño mínimo de un chunk en palabras
   * Chunks más pequeños se fusionan con el anterior
   */
  MIN_WORDS: 100,

  /**
   * Tamaño máximo de un chunk en palabras
   * Evita chunks excesivamente grandes
   */
  MAX_WORDS: 1000,

  /**
   * Separadores de párrafo (en orden de prioridad)
   */
  PARAGRAPH_SEPARATORS: ['\n\n', '\n', '. ', '! ', '? ']
};

/**
 * Cuenta el número de palabras en un texto
 *
 * @param text - Texto a analizar
 * @returns Número de palabras
 */
function countWords(text: string): number {
  if (!text || text.trim().length === 0) {
    return 0;
  }

  // Dividir por espacios en blanco y filtrar elementos vacíos
  return text
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0).length;
}

/**
 * Divide un texto en chunks de tamaño aproximado, preservando límites de párrafo
 *
 * Esta función divide documentos largos en fragmentos más pequeños para:
 * - Generar embeddings vectoriales
 * - Procesamiento por LLM con límites de tokens
 * - Búsqueda semántica granular
 *
 * @param text - Texto completo a dividir
 * @param targetWords - Tamaño objetivo en palabras (default: 800)
 * @returns Array de chunks de texto
 *
 * @example
 * ```typescript
 * const text = "Este es un documento largo...";
 * const chunks = splitIntoChunks(text);
 * // → ["chunk 1...", "chunk 2...", ...]
 * ```
 */
export function splitIntoChunks(
  text: string,
  targetWords: number = CHUNK_CONFIG.TARGET_WORDS
): string[] {
  // Validar entrada
  if (!text || text.trim().length === 0) {
    return [];
  }

  // Si el texto es suficientemente corto, retornarlo completo
  const totalWords = countWords(text);
  if (totalWords <= targetWords) {
    return [text.trim()];
  }

  const chunks: string[] = [];
  let currentChunk = '';
  let currentWordCount = 0;

  // Dividir por párrafos primero (doble salto de línea)
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);

  for (const paragraph of paragraphs) {
    const paragraphWords = countWords(paragraph);

    // Si agregar este párrafo excede el límite, guardar el chunk actual
    if (currentWordCount > 0 && currentWordCount + paragraphWords > CHUNK_CONFIG.MAX_WORDS) {
      // Guardar chunk actual si tiene contenido significativo
      if (currentWordCount >= CHUNK_CONFIG.MIN_WORDS) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
        currentWordCount = 0;
      }
    }

    // Si un solo párrafo es muy grande, dividirlo por oraciones
    if (paragraphWords > targetWords) {
      // Guardar chunk actual primero si hay contenido
      if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
        currentWordCount = 0;
      }

      // Dividir el párrafo largo
      const subChunks = splitLargeParagraph(paragraph, targetWords);
      chunks.push(...subChunks);
    } else {
      // Agregar párrafo al chunk actual
      if (currentChunk.length > 0) {
        currentChunk += '\n\n' + paragraph;
      } else {
        currentChunk = paragraph;
      }
      currentWordCount += paragraphWords;

      // Si alcanzamos el tamaño objetivo, guardar el chunk
      if (currentWordCount >= targetWords) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
        currentWordCount = 0;
      }
    }
  }

  // Agregar el último chunk si tiene contenido
  if (currentChunk.trim().length > 0) {
    // Si es muy pequeño y hay chunks anteriores, fusionarlo con el último
    if (currentWordCount < CHUNK_CONFIG.MIN_WORDS && chunks.length > 0) {
      const lastChunk = chunks.pop()!;
      chunks.push(lastChunk + '\n\n' + currentChunk.trim());
    } else {
      chunks.push(currentChunk.trim());
    }
  }

  return chunks.filter(chunk => chunk.trim().length > 0);
}

/**
 * Divide un párrafo grande en chunks más pequeños por oraciones
 *
 * @param paragraph - Párrafo a dividir
 * @param targetWords - Tamaño objetivo en palabras
 * @returns Array de chunks
 */
function splitLargeParagraph(paragraph: string, targetWords: number): string[] {
  const chunks: string[] = [];
  let currentChunk = '';
  let currentWordCount = 0;

  // Dividir por oraciones (punto seguido de espacio)
  const sentences = paragraph.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);

  for (const sentence of sentences) {
    const sentenceWords = countWords(sentence);

    // Si una sola oración excede el límite, dividirla por palabras
    if (sentenceWords > CHUNK_CONFIG.MAX_WORDS) {
      // Guardar chunk actual si hay contenido
      if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
        currentWordCount = 0;
      }

      // Dividir la oración larga por palabras
      const words = sentence.split(/\s+/);
      let wordChunk = '';
      let wordCount = 0;

      for (const word of words) {
        if (wordCount >= targetWords) {
          chunks.push(wordChunk.trim());
          wordChunk = word;
          wordCount = 1;
        } else {
          wordChunk += (wordChunk.length > 0 ? ' ' : '') + word;
          wordCount++;
        }
      }

      if (wordChunk.trim().length > 0) {
        chunks.push(wordChunk.trim());
      }
    } else if (currentWordCount + sentenceWords > CHUNK_CONFIG.MAX_WORDS) {
      // Guardar chunk actual y comenzar uno nuevo
      if (currentWordCount >= CHUNK_CONFIG.MIN_WORDS) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
        currentWordCount = sentenceWords;
      } else {
        // Si el chunk es muy pequeño, agregar de todas formas
        currentChunk += ' ' + sentence;
        currentWordCount += sentenceWords;
      }
    } else {
      // Agregar oración al chunk actual
      currentChunk += (currentChunk.length > 0 ? ' ' : '') + sentence;
      currentWordCount += sentenceWords;

      // Si alcanzamos el tamaño objetivo, guardar
      if (currentWordCount >= targetWords) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
        currentWordCount = 0;
      }
    }
  }

  // Agregar el último chunk
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Genera metadata para cada chunk
 * Útil para tracking y debugging
 *
 * @param chunks - Array de chunks de texto
 * @returns Array de objetos con chunk y metadata
 */
export function addChunkMetadata(chunks: string[]): IChunkWithMetadata[] {
  return chunks.map((text, index) => ({
    text,
    index,
    wordCount: countWords(text),
    charCount: text.length
  }));
}

/**
 * Exportar función de conteo de palabras para uso externo
 */
export { countWords };
