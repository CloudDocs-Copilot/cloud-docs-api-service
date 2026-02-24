// Resolve Elasticsearch client at runtime to make the module easier to mock in tests
function getEsModule() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const esMod = require('../configurations/elasticsearch-config');
  return esMod && esMod.getInstance ? esMod : esMod && esMod.default ? esMod.default : esMod;
}

export let getEsClient = () => {
  const mod = getEsModule();
  return mod.getInstance();
};
import { IDocument } from '../models/document.model';

/**
 * Interfaz para parámetros de búsqueda
 */
export interface SearchParams {
  query: string;
  userId: string;
  organizationId?: string;
  mimeType?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Interfaz para resultados de búsqueda
 */
export interface SearchResult {
  documents: any[];
  total: number;
  took: number;
}

/**
 * Indexar un documento en Elasticsearch
 *
 * ACTUALIZADO (RFE-AI-004): Ahora incluye:
 * - Campo 'content' para búsqueda full-text (antes 'extractedContent' nunca se indexaba)
 * - Campos AI: aiCategory, aiTags, aiProcessingStatus
 *
 * @param document - Documento de MongoDB a indexar
 * @param extractedText - Contenido extraído del documento (opcional)
 */
export async function indexDocument(document: IDocument, extractedText?: string): Promise<void> {
  try {
    const client = getEsModule().getInstance();

    await client.index({
      index: 'documents',
      id: document._id.toString(),
      document: {
        // Campos básicos
        filename: document.filename || '',
        originalname: document.originalname || '',
        mimeType: document.mimeType,
        size: document.size,
        uploadedBy: document.uploadedBy.toString(),
        organization: document.organization ? document.organization.toString() : null,
        folder: document.folder ? document.folder.toString() : null,
        uploadedAt: document.uploadedAt,

        // 🔍 NUEVO: Contenido extraído para búsqueda full-text
        // Limitado a 100KB para no saturar Elasticsearch
        content: extractedText ? extractedText.slice(0, 100000) : null,

        // 🤖 NUEVO: Campos AI para búsqueda facetada y filtrado (RFE-AI-002, RFE-AI-004)
        aiCategory: (document as any).aiCategory || null,
        aiTags: (document as any).aiTags || [],
        aiSummary: (document as any).aiSummary || null,
        aiKeyPoints: (document as any).aiKeyPoints || [],
        aiProcessingStatus: (document as any).aiProcessingStatus || 'none',
        aiConfidence: (document as any).aiConfidence || null
      }
    });

    console.log(`✅ Document indexed: ${document._id}`);
  } catch (error: any) {
    console.error(`❌ Error indexing document ${document._id}:`, error.message);
    throw error;
  }
}

/**
 * Eliminar un documento del índice de Elasticsearch
 */
export async function removeDocumentFromIndex(documentId: string): Promise<void> {
  try {
    const client = getEsModule().getInstance();

    await client.delete({
      index: 'documents',
      id: documentId
    });

    console.log(`✅ Document removed from index: ${documentId}`);
  } catch (error: any) {
    if (error.meta?.statusCode === 404) {
      console.warn(`⚠️  Document not found in index: ${documentId}`);
    } else {
      console.error(`❌ Error removing document from index:`, error.message);
      throw error;
    }
  }
}

/**
 * Buscar documentos por nombre
 */
export async function searchDocuments(params: SearchParams): Promise<SearchResult> {
  try {
    const client = getEsModule().getInstance();
    const {
      query,
      userId,
      organizationId,
      mimeType,
      fromDate,
      toDate,
      limit = 20,
      offset = 0
    } = params;

    // Construir filtros
    const filters: any[] = [];

    // Si hay organizationId, buscar en toda la organización
    // Si NO hay organizationId, buscar solo documentos del usuario
    if (organizationId) {
      filters.push({ term: { organization: organizationId } });
    } else {
      filters.push({ term: { uploadedBy: userId } });
    }

    if (mimeType) {
      filters.push({ term: { mimeType } });
    }

    if (fromDate || toDate) {
      const dateRange: any = {};
      if (fromDate) dateRange.gte = fromDate.toISOString();
      if (toDate) dateRange.lte = toDate.toISOString();
      filters.push({ range: { uploadedAt: dateRange } });
    }

    // Realizar búsqueda
    const result = await client.search({
      index: 'documents',
      query: {
        bool: {
          must: [
            {
              multi_match: {
                query,
                // 🔍 CORREGIDO (RFE-AI-004): Cambiado 'extractedContent' → 'content'
                // El campo 'content' ahora se indexa correctamente en indexDocument()
                fields: ['filename^3', 'originalname^2', 'content'],
                type: 'best_fields',
                fuzziness: 'AUTO'
              }
            }
          ],
          filter: filters
        }
      },
      from: offset,
      size: limit,
      sort: [{ _score: { order: 'desc' } }, { uploadedAt: { order: 'desc' } }]
    });

    const documents = result.hits.hits.map((hit: any) => ({
      id: hit._id,
      score: hit._score,
      ...hit._source
    }));

    return {
      documents,
      total:
        typeof result.hits.total === 'object' ? result.hits.total.value : result.hits.total || 0,
      took: result.took
    };
  } catch (error: any) {
    console.error('❌ Error searching documents:', error.message);
    throw error;
  }
}

/**
 * Obtener sugerencias de autocompletado
 */
export async function getAutocompleteSuggestions(
  query: string,
  userId: string,
  limit: number = 5
): Promise<string[]> {
  try {
    const client = getEsModule().getInstance();

    const result = await client.search({
      index: 'documents',
      query: {
        bool: {
          must: [
            {
              multi_match: {
                query,
                fields: ['filename', 'originalname'],
                type: 'phrase_prefix'
              }
            }
          ],
          filter: [{ term: { uploadedBy: userId } }]
        }
      },
      size: limit,
      _source: ['filename', 'originalname']
    });

    const suggestions = result.hits.hits.map((hit: any) =>
      (hit._source.originalname || hit._source.filename || '').toString()
    );

    // Eliminar duplicados manteniendo el orden y respetar el límite
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const s of suggestions) {
      if (!s) continue;
      if (!seen.has(s)) {
        seen.add(s);
        unique.push(s);
        if (unique.length >= limit) break;
      }
    }

    return unique;
  } catch (error: any) {
    console.error('❌ Error getting autocomplete suggestions:', error.message);
    return [];
  }
}

export default {
  indexDocument,
  removeDocumentFromIndex,
  searchDocuments,
  getAutocompleteSuggestions
};
