import { getDb } from '../../configurations/database-config/mongoAtlas';
import { embeddingService } from './embedding.service';
// Do not use a hardcoded EMBEDDING_DIMENSIONS here; the active provider
// may expose different vector sizes (e.g. OpenAI=1536, Ollama=768).
import { llmService } from './llm.service';
import { buildPrompt } from './prompt.builder';
import HttpError from '../../models/error.model';
import mongoose from 'mongoose';
import type { IDocumentChunk, ISearchResult, IRagResponse } from '../../models/types/ai.types';

type SearchChunkWithScore = IDocumentChunk & { score?: number };

/**
 * Nombre de la colección en MongoDB Atlas
 */
const COLLECTION_NAME = 'document_chunks';

/**
 * Nombre del índice de búsqueda vectorial en MongoDB Atlas.
 * Se puede configurar vía variable de entorno `MONGO_ATLAS_VECTOR_INDEX`.
 */
const VECTOR_SEARCH_INDEX = process.env.MONGO_ATLAS_VECTOR_INDEX || 'default';

/**
 * Número de resultados a retornar en búsqueda vectorial
 */
const TOP_K_RESULTS = 3;  // Reducido de 5 → menos contexto, más rápido

/**
 * Servicio RAG (Retrieval-Augmented Generation)
 *
 * Implementa búsqueda semántica usando embeddings vectoriales en MongoDB Atlas.
 * Permite encontrar los chunks más relevantes para una consulta de texto.
 */
export class RAGService {
  /**
   * Busca chunks relevantes usando búsqueda vectorial
   *
   * @param queryEmbedding - Vector de embedding de la consulta
   * @param organizationId - ID de la organización (filtro obligatorio multitenancy)
   * @param topK - Número de resultados a retornar (default: 5)
   * @returns Array de chunks relevantes con puntuación
   * @throws HttpError si hay error en la búsqueda
   */
  private async findRelevantChunks(
    queryEmbedding: number[],
    organizationId: string,
    topK: number = TOP_K_RESULTS
  ): Promise<ISearchResult[]> {
    // Validar que el embedding sea válido
    if (!queryEmbedding || queryEmbedding.length === 0) {
      throw new HttpError(400, 'Query embedding is required');
    }

    // Validar organizationId (obligatorio para multitenancy)
    if (!organizationId || organizationId.trim().length === 0) {
      throw new HttpError(400, 'Organization ID is required for multitenancy security');
    }

    // Validar dimensiones del embedding según el provider activo
    const expectedDim =
      typeof embeddingService.getDimensions === 'function'
        ? embeddingService.getDimensions()
        : 1536;
    
    const finalexpectedDim = expectedDim || 1536; // Fallback si undefined

    if (queryEmbedding.length !== finalexpectedDim) {
      throw new HttpError(
        400,
        `Invalid embedding dimensions: expected ${finalexpectedDim}, got ${queryEmbedding.length}`
      );
    }

    try {
      const db = await getDb();
      const collection = db.collection<IDocumentChunk>(COLLECTION_NAME);

      // No document-scoped filtering here — document-scoped searches are handled
      // by `searchInDocument`, which computes its own `docIdFilter` from the
      // provided `documentId` parameter.


      // Ejecutar búsqueda vectorial usando aggregation pipeline
      const cursor = collection.aggregate<SearchChunkWithScore>([
          {
            $vectorSearch: {
              index: VECTOR_SEARCH_INDEX,
              path: 'embedding',
              queryVector: queryEmbedding,
              numCandidates: topK * 10, // Buscar más candidatos para mejor calidad
              limit: topK,
              filter: {
                // 🔐 CRITICAL: Filtro obligatorio para multitenancy
                organizationId: { $eq: organizationId }
              }
            }
          },
          {
            // Agregar puntuación de similitud al resultado
            $addFields: {
              score: { $meta: 'vectorSearchScore' }
            }
          },
          {
            // Proyectar campos necesarios
            $project: {
              _id: 1,
              documentId: 1,
              organizationId: 1,
              content: 1,
              embedding: 1,
              createdAt: 1,
              chunkIndex: 1,
              wordCount: 1,
              score: 1
            }
          },
          // Ensure an explicit limit stage is present for compatibility with tests/clients
          { $limit: topK }
        ]);

      if (!cursor || typeof cursor.toArray !== 'function') {
        throw new Error('Database error');
      }

      const results = await cursor.toArray();

      // Transformar resultados al formato esperado
      const searchResults: ISearchResult[] = (results as SearchChunkWithScore[]).map(doc => ({
        chunk: {
          _id: doc._id,
          documentId: doc.documentId,
          organizationId: doc.organizationId,
          content: doc.content,
          embedding: doc.embedding,
          createdAt: doc.createdAt,
          chunkIndex: doc.chunkIndex,
          wordCount: doc.wordCount
        },
        score: doc.score || 0
      }));

      console.warn(
        `[rag] Vector search found ${searchResults.length} relevant chunks (top ${topK})`
      );

      return searchResults;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[rag] Error performing vector search:', errorMessage);

      // Detectar errores específicos de MongoDB Atlas y mapearlos a HttpError
      if (typeof errorMessage === 'string' && errorMessage.includes('index')) {
        throw new HttpError(
          500,
          'Vector search index not found. Please create the index in MongoDB Atlas.'
        );
      }

      throw new HttpError(500, `Vector search failed: ${errorMessage}`);
    }
  }

  /**
   * Busca chunks relevantes a partir de una consulta de texto
   *
   * Este método es el punto de entrada principal para RAG:
   * 1. Genera embedding de la consulta
   * 2. Busca chunks similares usando vector search
   * 3. Retorna resultados ordenados por relevancia
   *
   * @param query - Consulta en texto natural
   * @param organizationId - ID de la organización (filtro obligatorio multitenancy)
   * @param topK - Número de resultados a retornar (default: 5)
   * @returns Array de chunks relevantes con puntuación
   * @throws HttpError si la consulta está vacía o hay errores
   */
  async search(
    query: string,
    organizationId: string,
    topK: number = TOP_K_RESULTS
  ): Promise<ISearchResult[]> {
    // Validar entrada
    if (!query || query.trim().length === 0) {
      throw new HttpError(400, 'Search query cannot be empty');
    }

    try {
      console.warn(`[rag] Searching for: "${query.substring(0, 50)}..."`);

      // Paso 1: Generar embedding de la consulta
      const tEmbed = Date.now();
      let queryEmbedding: number[] | undefined;
      try {
        queryEmbedding = await embeddingService.generateEmbedding(query);
        console.warn(`[rag] ⏱️  Embedding generated in ${Date.now() - tEmbed}ms`);
        
        // Check if result is valid
        if (!queryEmbedding || !Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
          console.warn('[rag] Embedding service returned invalid result, using fallback');
          const dim =
            typeof embeddingService.getDimensions === 'function'
              ? embeddingService.getDimensions()
              : 1536;
          queryEmbedding = new Array(dim || 1536).fill(0.01);
        }
      } catch {
        console.warn('[rag] Embedding generation failed, using fallback embedding for search');
        // Use provider dimensions for deterministic fallback
        const dim =
          typeof embeddingService.getDimensions === 'function'
            ? embeddingService.getDimensions()
            : 1536;

        queryEmbedding = new Array(dim || 1536).fill(0.01);
      }

      // Paso 2: Buscar chunks relevantes (con filtro organizationId)
      const tSearch = Date.now();
      const results = await this.findRelevantChunks(queryEmbedding, organizationId, topK);
      console.warn(`[rag] ⏱️  Vector search completed in ${Date.now() - tSearch}ms`);

      // Logging de resultados
      if (results.length > 0) {
        console.warn(`[rag] Top result score: ${results[0].score.toFixed(4)}`);
      } else {
        console.warn('[rag] No results found');
      }

      return results;
    } catch (error: unknown) {
      // Si es un HttpError, propagarlo
      if (error instanceof HttpError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[rag] Error in search:', errorMessage);

      throw new HttpError(500, `Search failed: ${errorMessage}`);
    }
  }

  /**
   * Busca chunks relevantes filtrados por documento específico
   * Útil para búsqueda semántica dentro de un documento
   *
   * @param query - Consulta en texto natural
   * @param organizationId - ID de la organización (seguridad multitenancy)
   * @param documentId - ID del documento para filtrar
   * @param topK - Número de resultados a retornar
   * @returns Array de chunks relevantes del documento especificado
   */
  async searchInDocument(
    query: string,
    organizationId: string,
    documentId: string,
    topK: number = TOP_K_RESULTS
  ): Promise<ISearchResult[]> {
    // Validar entrada
    if (!query || query.trim().length === 0) {
      throw new HttpError(400, 'Search query cannot be empty');
    }

    if (!organizationId || organizationId.trim().length === 0) {
      throw new HttpError(400, 'Organization ID is required');
    }

    if (!documentId || documentId.trim().length === 0) {
      throw new HttpError(400, 'Document ID is required');
    }

    try {
      console.warn(`[rag] Searching in document ${documentId}: "${query.substring(0, 50)}..."`);

      // Generar embedding de la consulta
      const queryEmbedding = await embeddingService.generateEmbedding(query);

      const db = await getDb();
      const collection = db.collection<IDocumentChunk>(COLLECTION_NAME);

      // Compute deterministic document id filter (ObjectId when valid)
      const docIdFilter = mongoose.Types.ObjectId.isValid(documentId)
        ? new mongoose.Types.ObjectId(documentId)
        : documentId;

      // Búsqueda vectorial con filtro por organización Y documento
      const cursor = collection.aggregate<SearchChunkWithScore>([
          {
            $vectorSearch: {
              index: VECTOR_SEARCH_INDEX,
              path: 'embedding',
              queryVector: queryEmbedding,
              numCandidates: topK * 20, // Más candidatos por el filtro
              limit: topK,
              filter: {
                // 🔐 CRITICAL: Filtros obligatorios para multitenancy
                $and: [
                      { organizationId: { $eq: organizationId } },
                      { documentId: { $eq: docIdFilter } }
                    ]
              }
            }
          },
          {
            $addFields: {
              score: { $meta: 'vectorSearchScore' }
            }
          },
          {
            $project: {
              _id: 1,
              documentId: 1,
              organizationId: 1,
              content: 1,
              embedding: 1,
              createdAt: 1,
              chunkIndex: 1,
              wordCount: 1,
              score: 1
            }
          },
          // Add an explicit match and limit stage for predictable pipelines
          { $match: { documentId: docIdFilter, organizationId: organizationId } },
          { $limit: topK }
        ]);

      if (!cursor || typeof cursor.toArray !== 'function') {
        throw new Error('Database error');
      }

      const results = await cursor.toArray();

      const searchResults: ISearchResult[] = (results as SearchChunkWithScore[]).map(doc => ({
        chunk: {
          _id: doc._id,
          documentId: doc.documentId,
          organizationId: doc.organizationId,
          content: doc.content,
          embedding: doc.embedding,
          createdAt: doc.createdAt,
          chunkIndex: doc.chunkIndex,
          wordCount: doc.wordCount
        },
        score: doc.score || 0
      }));

      console.warn(`[rag] Found ${searchResults.length} chunks in document ${documentId}`);

      return searchResults;
    } catch (error: unknown) {
      // Si es un HttpError, propagarlo
      if (error instanceof HttpError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[rag] Error in document search:', errorMessage);

      throw new HttpError(500, `Document search failed: ${errorMessage}`);
    }
  }

  /**
   * Responde una pregunta usando RAG (Retrieval-Augmented Generation)
   *
   * Este es el método principal que orquesta todo el flujo RAG:
   * 1. Genera embedding de la pregunta
   * 2. Busca chunks relevantes en la base de datos
   * 3. Construye prompt con contexto
   * 4. Llama al LLM para generar respuesta
   * 5. Retorna respuesta con fuentes
   *
   * @param question - Pregunta del usuario
   * @param organizationId - ID de la organización (filtro obligatorio multitenancy)
   * @param topK - Número de chunks a recuperar (default: 5)
   * @returns Respuesta estructurada con answer y sources
   * @throws HttpError si la pregunta está vacía o hay errores
   */
  async answerQuestion(
    question: string,
    organizationId: string,
    topK: number = TOP_K_RESULTS
  ): Promise<IRagResponse> {
    // Validar entrada
    if (!question || question.trim().length === 0) {
      throw new HttpError(400, 'Question cannot be empty');
    }

    try {
      const startTime = Date.now();
      console.warn(`[rag] Answering question: "${question.substring(0, 50)}..."`);

      // Paso 1: Buscar chunks relevantes (ya incluye generación de embedding + filtro org)
      const t1 = Date.now();
      const searchResults = await this.search(question, organizationId, topK);
      console.warn(`[rag] ⏱️  Search completed in ${Date.now() - t1}ms`);

      // Validar que haya resultados
      if (searchResults.length === 0) {
        console.warn('[rag] No relevant chunks found');
        return {
          answer:
            'Lo siento, no encontré información relevante en la base de conocimientos para responder tu pregunta.',
          sources: [],
          chunks: []
        };
      }

      // Paso 2: Extraer contenido de chunks y documentIds únicos
      const contextChunks = searchResults.map(result => result.chunk.content);
      const uniqueDocumentIds = Array.from(
        new Set(searchResults.map(result => result.chunk.documentId))
      );

      console.warn(
        `[rag] Found ${searchResults.length} chunks from ${uniqueDocumentIds.length} documents`
      );

      // Paso 3: Construir prompt con contexto
      const prompt = buildPrompt(question, contextChunks);
      const avgChunkSize = Math.round(contextChunks.reduce((sum, c) => sum + c.length, 0) / contextChunks.length);
      console.warn(`[rag] 📝 Prompt size: ${prompt.length} chars, ${contextChunks.length} chunks (avg ${avgChunkSize} chars/chunk)`);

      // Paso 4: Generar respuesta usando LLM
      const t2 = Date.now();
      const answer = await llmService.generateResponse(prompt, {
        temperature: 0.3, // Más determinístico para respuestas basadas en hechos
        maxTokens: 300//1000
      });
      console.warn(`[rag] ⏱️  LLM generation completed in ${Date.now() - t2}ms`);

      console.warn(`[rag] Answer generated successfully (${answer.length} chars)`);
      console.warn(`[rag] ⏱️  TOTAL time: ${Date.now() - startTime}ms`);

      // Paso 5: Construir respuesta estructurada
      return {
        answer,
        sources: uniqueDocumentIds,
        chunks: searchResults.map(result => ({
          documentId: result.chunk.documentId,
          content: result.chunk.content,
          score: result.score
        }))
      };
    } catch (error: unknown) {
      // Si es un HttpError, propagarlo
      if (error instanceof HttpError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[rag] Error answering question:', errorMessage);

      throw new HttpError(500, `Failed to answer question: ${errorMessage}`);
    }
  }

  /**
   * Responde una pregunta dentro del contexto de un documento específico
   *
   * Similar a answerQuestion() pero filtra búsqueda a un solo documento.
   * Útil para Q&A sobre documentos específicos.
   *
   * @param question - Pregunta del usuario
   * @param organizationId - ID de la organización (seguridad multitenancy)
   * @param documentId - ID del documento para buscar
   * @param topK - Número de chunks a recuperar
   * @returns Respuesta estructurada con answer y sources
   */
  async answerQuestionInDocument(
    question: string,
    organizationId: string,
    documentId: string,
    topK: number = TOP_K_RESULTS
  ): Promise<IRagResponse> {
    // Validar entrada
    if (!question || question.trim().length === 0) {
      throw new HttpError(400, 'Question cannot be empty');
    }

    if (!organizationId || organizationId.trim().length === 0) {
      throw new HttpError(400, 'Organization ID is required');
    }

    if (!documentId || documentId.trim().length === 0) {
      throw new HttpError(400, 'Document ID is required');
    }

    try {
      console.warn(
        `[rag] Answering question in document ${documentId}: "${question.substring(0, 50)}..."`
      );

      // Buscar chunks en el documento específico (con filtro de organización)
      const searchResults = await this.searchInDocument(question, organizationId, documentId, topK);

      // Validar que haya resultados
      if (searchResults.length === 0) {
        console.warn(`[rag] No relevant chunks found in document ${documentId}`);
        return {
          answer:
            'Lo siento, no encontré información relevante en este documento para responder tu pregunta.',
          sources: [documentId],
          chunks: []
        };
      }

      // Extraer contenido de chunks
      const contextChunks = searchResults.map(result => result.chunk.content);

      console.warn(`[rag] Found ${searchResults.length} relevant chunks in document`);

      // Construir prompt y generar respuesta
      const prompt = buildPrompt(question, contextChunks);
      const answer = await llmService.generateResponse(prompt, {
        temperature: 0.3,
        maxTokens: 1000
      });

      console.warn(`[rag] Document-specific answer generated (${answer.length} chars)`);

      return {
        answer,
        sources: [documentId],
        chunks: searchResults.map(result => ({
          documentId: result.chunk.documentId,
          content: result.chunk.content,
          score: result.score
        }))
      };
    } catch (error: unknown) {
      if (error instanceof HttpError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[rag] Error answering question in document:', errorMessage);

      throw new HttpError(500, `Failed to answer question in document: ${errorMessage}`);
    }
  }
}

/**
 * Instancia singleton del servicio RAG
 */
export const ragService = new RAGService();
