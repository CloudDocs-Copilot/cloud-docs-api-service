import ElasticsearchClient from '../configurations/elasticsearch-config';
import { IDocument } from '../models/document.model';

/**
 * Interfaz para par├ímetros de b├║squeda
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
 * Interfaz para documento de b├║squeda
 */
interface SearchDocument {
  id: string;
  filename?: string;
  originalname?: string;
  mimeType?: string;
  score?: number;
  extractedContent?: string;
  size?: number;
  uploadedBy?: string;
  organization?: string;
  folder?: string;
  uploadedAt?: string;
  path?: string;
  content?: string;
}

/**
 * Interfaz para resultados de b├║squeda
 */
export interface SearchResult {
  documents: SearchDocument[];
  total: number;
  took: number;
}

/**
 * Tipos para Elasticsearch
 */
interface ESTermFilter {
  term: Record<string, string>;
}

interface ESRangeFilter {
  range: {
    uploadedAt: {
      gte?: string;
      lte?: string;
    };
  };
}

type ESFilter = ESTermFilter | ESRangeFilter;

interface ESSource {
  filename?: string;
  originalname?: string;
  mimeType?: string;
  extractedContent?: string;
  size?: number;
  uploadedBy?: string;
  organization?: string;
  folder?: string;
  uploadedAt?: string;
  path?: string;
  content?: string;
}

interface ESHit {
  _id: string;
  _score: number;
  _source: ESSource;
}

/**
 * Indexar un documento en Elasticsearch
 * @param document - Documento a indexar
 * @param extractedText - Texto extraído (opcional, se limita a 100KB para performance)
 */
export async function indexDocument(document: IDocument, extractedText?: string): Promise<void> {
  try {
    const client = ElasticsearchClient.getInstance();
    
    await client.index({
      index: 'documents',
      id: document._id.toString(),
      document: {
        filename: document.filename || '',
        originalname: document.originalname || '',
        extractedContent: document.extractedContent || '',
        mimeType: document.mimeType,
        size: document.size,
        uploadedBy: document.uploadedBy.toString(),
        organization: document.organization ? document.organization.toString() : null,
        folder: document.folder ? document.folder.toString() : null,
        uploadedAt: document.uploadedAt,
        path: document.path || '',
        
        // Contenido para búsqueda full-text (limitado a 100KB para performance)
        content: extractedText ? extractedText.slice(0, 100000) : null
      }
    });

    console.warn(`✅ Document indexed: ${document._id}`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Error indexing document ${document._id}:`, errorMessage);
    throw error;
  }
}

/**
 * Eliminar un documento del ├¡ndice de Elasticsearch
 */
export async function removeDocumentFromIndex(documentId: string): Promise<void> {
  try {
    const client = ElasticsearchClient.getInstance();
    
    await client.delete({
      index: 'documents',
      id: documentId
    });

    console.warn(`✅ Document removed from index: ${documentId}`);
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'meta' in error) {
      const esError = error as { meta?: { statusCode?: number } };
      if (esError.meta?.statusCode === 404) {
        console.warn(`⚠️  Document not found in index: ${documentId}`);
        return;
      }
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Error removing document from index:`, errorMessage);
    throw error;
  }
}

/**
 * Buscar documentos por nombre
 */
export async function searchDocuments(params: SearchParams): Promise<SearchResult> {
  try {
    const client = ElasticsearchClient.getInstance();
    const { query, userId, organizationId, mimeType, fromDate, toDate, limit = 20, offset = 0 } = params;

    // Construir filtros
    const filters: ESFilter[] = [];

    // Filtrar por organizaci├│n si se proporciona, sino por usuario
    if (organizationId) {
      filters.push({ term: { organization: organizationId } });
    } else {
      filters.push({ term: { uploadedBy: userId } });
    }

    if (mimeType) {
      console.warn(`🔍 [Elasticsearch] Filtering by mimeType: ${mimeType}`);
      
      // Usar coincidencia exacta para el mimeType sin .keyword
      // El campo mimeType puede no estar mapeado como keyword en el índice
      filters.push({ 
        term: { 
          mimeType: mimeType 
        } 
      });
      
      console.warn(`📌 [Elasticsearch] Added exact mimeType filter: ${mimeType}`);
    }

    if (fromDate || toDate) {
      const dateRange: { gte?: string; lte?: string } = {};
      if (fromDate) dateRange.gte = fromDate.toISOString();
      if (toDate) dateRange.lte = toDate.toISOString();
      filters.push({ range: { uploadedAt: dateRange } });
    }

    // Realizar b├║squeda con query_string para mayor flexibilidad
    // Agregar wildcards autom├íticamente para b├║squeda parcial
    const searchQuery = `*${query.toLowerCase()}*`;
    
    console.warn(`🔍 [Elasticsearch] Searching with query: "${searchQuery}"`);
    console.warn(`📊 [Elasticsearch] Filters:`, JSON.stringify(filters, null, 2));
    
    const result = await client.search({
      index: 'documents',
      query: {
        bool: {
          must: [
            {
              query_string: {
                query: searchQuery,
                fields: ['filename', 'originalname', 'content', 'extractedContent'],
                default_operator: 'AND',
                analyze_wildcard: true
              }
            }
          ],
          filter: filters
        }
      },
      from: offset,
      size: limit,
      sort: [
        { _score: { order: 'desc' } },
        { uploadedAt: { order: 'desc' } }
      ]
    });

    console.warn(`✅ [Elasticsearch] Found ${typeof result.hits.total === 'object' ? result.hits.total.value : result.hits.total} documents in ${result.took}ms`);

    const documents = result.hits.hits.map((hit: ESHit): SearchDocument => {
      const doc: SearchDocument = {
        id: hit._id,
        score: hit._score,
        ...hit._source
      };
      
      // Debug: Log cada documento encontrado
      console.warn(`📄 [Elasticsearch] Document found:`, {
        id: doc.id,
        filename: doc.filename ?? doc.originalname,
        mimeType: doc.mimeType,
        score: doc.score
      });
      
      return doc;
    });

    // TODO: Temporal - Validación desactivada hasta re-indexar documentos con campo 'path'
    // La validación de archivos físicos requiere que todos los documentos en ES tengan el campo 'path'
    return {
      documents,
      total: typeof result.hits.total === 'object' ? result.hits.total.value : (result.hits.total || 0),
      took: result.took
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error searching documents:', errorMessage);
    throw error;
  }
}

/**
 * Obtener sugerencias de autocompletado
 */
export async function getAutocompleteSuggestions(query: string, userId: string, organizationId?: string, limit: number = 5): Promise<string[]> {
  try {
    const client = ElasticsearchClient.getInstance();

    // Construir filtros
    const filters: ESFilter[] = [];
    if (organizationId) {
      filters.push({ term: { organization: organizationId } });
    } else {
      filters.push({ term: { uploadedBy: userId } });
    }

    const searchQuery = `*${query.toLowerCase()}*`;
    
    const result = await client.search({
      index: 'documents',
      query: {
        bool: {
          must: [
            {
              query_string: {
                query: searchQuery,
                fields: ['filename', 'originalname'],
                analyze_wildcard: true
              }
            }
          ],
          filter: filters
        }
      },
      size: limit,
      _source: ['filename', 'originalname']
    });

    const suggestions = result.hits.hits.map((hit: ESHit): string => {
      const name = hit._source.originalname ?? hit._source.filename ?? '';
      return String(name);
    });

    // Eliminar duplicados manteniendo el orden y respetar el l├¡mite
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
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error getting autocomplete suggestions:', errorMessage);
    return [];
  }
}

export default {
  indexDocument,
  removeDocumentFromIndex,
  searchDocuments,
  getAutocompleteSuggestions
};
