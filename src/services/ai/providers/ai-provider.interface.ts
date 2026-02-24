/**
 * Interfaz base para proveedores de IA
 *
 * Define el contrato que todos los proveedores (OpenAI, Ollama, Mock)
 * deben implementar para garantizar intercambiabilidad.
 */

/**
 * Resultado de generación de embeddings
 */
export interface EmbeddingResult {
  /** Vector de embedding numérico */
  embedding: number[];
  /** Dimensiones del vector */
  dimensions: number;
  /** Modelo utilizado */
  model: string;
}

/**
 * Resultado de generación de texto/chat
 */
export interface ChatResult {
  /** Texto generado por el modelo */
  response: string;
  /** Modelo utilizado */
  model: string;
  /** Tokens usados (si está disponible) */
  tokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

/**
 * Opciones de configuración para generación de texto
 */
export interface GenerationOptions {
  /** Temperatura (0-2): valores bajos = más determinístico */
  temperature?: number;
  /** Máximo número de tokens a generar */
  maxTokens?: number;
  /** Mensaje de sistema (instrucciones) */
  systemMessage?: string;
  /** Modelo específico a usar (override) */
  model?: string;
}

/**
 * Resultado de clasificación de documentos
 */
export interface ClassificationResult {
  /** Categoría asignada al documento */
  category: string;
  /** Confianza de la clasificación (0-1) */
  confidence: number;
  /** Tags descriptivos */
  tags: string[];
}

/**
 * Resultado de resumir documento
 */
export interface SummarizationResult {
  /** Resumen en 2-3 frases */
  summary: string;
  /** Puntos clave (3-5 items) */
  keyPoints: string[];
}

/**
 * Interface principal para proveedores de IA
 */
export interface AIProvider {
  /** Nombre del proveedor para logging */
  readonly name: string;

  /**
   * Genera un embedding vectorial a partir de texto
   * @param text - Texto a convertir en vector
   * @returns Promise con el resultado del embedding
   */
  generateEmbedding(text: string): Promise<EmbeddingResult>;

  /**
   * Genera embeddings para múltiples textos en batch
   * @param texts - Array de textos a procesar
   * @returns Promise con array de resultados
   */
  generateEmbeddings(texts: string[]): Promise<EmbeddingResult[]>;

  /**
   * Genera una respuesta de texto usando el LLM
   * @param prompt - Prompt o pregunta para el modelo
   * @param options - Opciones de configuración
   * @returns Promise con el resultado de la generación
   */
  generateResponse(prompt: string, options?: GenerationOptions): Promise<ChatResult>;

  /**
   * Clasifica un documento en categorías predefinidas
   * @param text - Texto del documento a clasificar
   * @returns Promise con el resultado de clasificación
   */
  classifyDocument(text: string): Promise<ClassificationResult>;

  /**
   * Genera un resumen de un documento
   * @param text - Texto del documento a resumir
   * @returns Promise con el resumen y puntos clave
   */
  summarizeDocument(text: string): Promise<SummarizationResult>;

  /**
   * Verifica si el proveedor está disponible y funcionando
   * @returns Promise<true> si está disponible, lanza error si no
   */
  checkConnection(): Promise<boolean>;

  /**
   * Obtiene las dimensiones del vector de embedding
   * @returns Número de dimensiones (ej: 1536 para OpenAI, 768 para Ollama)
   */
  getEmbeddingDimensions(): number;

  /**
   * Obtiene el nombre del modelo de embedding actual
   * @returns Nombre del modelo
   */
  getEmbeddingModel(): string;

  /**
   * Obtiene el nombre del modelo de chat actual
   * @returns Nombre del modelo
   */
  getChatModel(): string;
}
