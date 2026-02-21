import { ObjectId } from 'mongodb';

/**
 * Modelo de embeddings de OpenAI utilizado
 */
export const EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * Dimensiones del vector de embedding según el modelo
 */
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * Interface para un chunk de documento almacenado en MongoDB Atlas
 */
export interface IDocumentChunk {
  _id?: ObjectId;
  documentId: string;
  organizationId: string; // 🔐 Multitenancy: filtrado obligatorio en búsquedas vectoriales
  content: string;
  embedding: number[];
  createdAt: Date;
  chunkIndex: number;
  wordCount: number;
}

/**
 * Resultado del procesamiento de un documento
 */
export interface IProcessingResult {
  documentId: string;
  chunksCreated: number;
  totalWords: number;
  processingTime: number;
  /** Dimensiones del vector de embedding utilizado */
  dimensions?: number;
}

/**
 * Configuración para el chunking de documentos
 */
export interface IChunkConfig {
  /**
   * Tamaño objetivo de cada chunk en palabras
   */
  readonly TARGET_WORDS: number;

  /**
   * Tamaño mínimo de un chunk en palabras
   */
  readonly MIN_WORDS: number;

  /**
   * Tamaño máximo de un chunk en palabras
   */
  readonly MAX_WORDS: number;

  /**
   * Separadores de párrafo (en orden de prioridad)
   */
  readonly PARAGRAPH_SEPARATORS: readonly string[];
}

/**
 * Chunk con metadata adicional
 */
export interface IChunkWithMetadata {
  text: string;
  index: number;
  wordCount: number;
  charCount: number;
}

/**
 * Estadísticas de chunks almacenados
 */
export interface IChunkStatistics {
  totalChunks: number;
  totalDocuments: number;
}

/**
 * Resultado de búsqueda vectorial con puntuación
 */
export interface ISearchResult {
  chunk: IDocumentChunk;
  score: number;
}

/**
 * Opciones de configuración para generación de respuestas LLM
 */
export interface IGenerationOptions {
  /**
   * Temperatura de generación (0.0 - 2.0)
   * Valores bajos = más determinístico
   * Valores altos = más creativo
   */
  temperature?: number;

  /**
   * Máximo de tokens a generar
   */
  maxTokens?: number;

  /**
   * Mensajes de sistema adicionales
   */
  systemMessage?: string;

  /**
   * Modelo específico a usar (override)
   */
  model?: string;
}

/**
 * Respuesta estructurada de RAG con fuentes
 */
export interface IRagResponse {
  /**
   * Respuesta generada por el LLM
   */
  answer: string;

  /**
   * ID de documentos fuente utilizados
   */
  sources: string[];

  /**
   * Chunks utilizados para generar la respuesta (opcional)
   */
  chunks?: Array<{
    documentId: string;
    content: string;
    score: number;
  }>;
}

/**
 * Taxonomía de categorías para clasificación de documentos
 */
export const DOCUMENT_CATEGORIES = [
  'Contrato',
  'Factura',
  'Informe',
  'Manual',
  'Política',
  'Presentación',
  'Reporte Financiero',
  'Acta de Reunión',
  'Propuesta',
  'Otro'
] as const;

export type DocumentCategory = typeof DOCUMENT_CATEGORIES[number];
