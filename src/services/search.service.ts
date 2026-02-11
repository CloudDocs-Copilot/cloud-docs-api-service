import ElasticsearchClient from '../configurations/elasticsearch-config';
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
 */
export async function indexDocument(document: IDocument): Promise<void> {
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
        uploadedAt: document.uploadedAt
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
    const client = ElasticsearchClient.getInstance();
    
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
    const client = ElasticsearchClient.getInstance();
    const { query, userId, organizationId, mimeType, fromDate, toDate, limit = 20, offset = 0 } = params;

    // Construir filtros
    const filters: any[] = [];

    // Filtrar por organización si se proporciona, sino por usuario
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

    // Realizar búsqueda con query_string para mayor flexibilidad
    // Agregar wildcards automáticamente para búsqueda parcial
    const searchQuery = `*${query.toLowerCase()}*`;
    
    console.log(`🔍 [Elasticsearch] Searching with query: "${searchQuery}"`);
    console.log(`📊 [Elasticsearch] Filters:`, JSON.stringify(filters, null, 2));
    
    const result = await client.search({
      index: 'documents',
      query: {
        bool: {
          must: [
            {
              query_string: {
                query: searchQuery,
                fields: ['filename', 'originalname', 'extractedContent'],
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

    console.log(`✅ [Elasticsearch] Found ${typeof result.hits.total === 'object' ? result.hits.total.value : result.hits.total} documents in ${result.took}ms`);

    const documents = result.hits.hits.map((hit: any) => ({
      id: hit._id,
      score: hit._score,
      ...hit._source
    }));

    return {
      documents,
      total: typeof result.hits.total === 'object' ? result.hits.total.value : (result.hits.total || 0),
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
export async function getAutocompleteSuggestions(query: string, userId: string, organizationId?: string, limit: number = 5): Promise<string[]> {
  try {
    const client = ElasticsearchClient.getInstance();

    // Construir filtros
    const filters: any[] = [];
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
