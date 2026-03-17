import ElasticsearchClient from '../configurations/elasticsearch-config';
import { IDocument } from '../models/document.model';
import Document from '../models/document.model';
import HttpError from '../models/error.model';

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
 * Escapa caracteres especiales de expresiones regulares en una cadena de entrada.
 * Esto asegura que el texto del usuario se trate como literal en la expresión regular.
 */
function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
 * Búsqueda en MongoDB como fallback cuando Elasticsearch no está disponible
 * Utiliza expresiones regulares para búsqueda parcial case-insensitive
 */
async function searchDocumentsInMongoDB(params: SearchParams): Promise<SearchResult> {
  const startTime = Date.now();
  const { query, userId, organizationId, mimeType, fromDate, toDate, limit = 20, offset = 0 } = params;

  // Normalizar y validar parámetros potencialmente controlados por el usuario
  const safeOrganizationId =
    typeof organizationId === 'string' && organizationId.trim() !== '' ? organizationId.trim() : undefined;
  const safeMimeType =
    typeof mimeType === 'string' && mimeType.trim() !== '' ? mimeType.trim() : undefined;

  // Construir filtros MongoDB
  const filters: Record<string, unknown> = {
    isDeleted: false // Excluir documentos eliminados
  };

  // Filtrar por organización si se proporciona, sino por usuario
  if (organizationId !== undefined && typeof organizationId !== 'string') {
    throw new HttpError(400, 'Invalid organizationId parameter');
  }
  if (safeOrganizationId) {
    filters.organization = safeOrganizationId;
  } else {
    filters.uploadedBy = userId;
  }

  // Filtro por tipo MIME
  if (mimeType !== undefined && typeof mimeType !== 'string') {
    throw new HttpError(400, 'Invalid mimeType parameter');
  }
  if (safeMimeType) {
    filters.mimeType = safeMimeType;
  }

  // Filtro por rango de fechas
  if (fromDate || toDate) {
    filters.uploadedAt = {};
    if (fromDate) {
      (filters.uploadedAt as Record<string, Date>).$gte = fromDate;
    }
    if (toDate) {
      (filters.uploadedAt as Record<string, Date>).$lte = toDate;
    }
  }

  // Búsqueda por texto usando regex (case-insensitive, búsqueda parcial)
  const safeQuery = escapeRegExp(query);
  const regex = new RegExp(safeQuery, 'i');
  filters.$or = [
    { filename: regex },
    { originalname: regex },
    { extractedContent: regex },
    { aiTags: regex },
    { aiSummary: regex }
  ];

  console.warn(`🔍 [MongoDB Fallback] Searching with query: "${query}"`);
  console.warn(`📊 [MongoDB Fallback] Filters:`, JSON.stringify(filters, null, 2));

  // Ejecutar búsqueda
  const total = await Document.countDocuments(filters);
  const mongoDocuments = await Document.find(filters)
    .sort({ uploadedAt: -1 })
    .skip(offset)
    .limit(limit)
    .lean();

  const took = Date.now() - startTime;

  console.warn(`✅ [MongoDB Fallback] Found ${total} documents in ${took}ms`);

  // Transformar documentos MongoDB al formato SearchDocument
  const searchDocs: SearchDocument[] = mongoDocuments.map((doc) => {
    const mongoDoc = doc as unknown as IDocument;
    return {
      id: mongoDoc._id.toString(),
      filename: mongoDoc.filename,
      originalname: mongoDoc.originalname,
      mimeType: mongoDoc.mimeType,
      extractedContent: mongoDoc.extractedContent,
      size: mongoDoc.size,
      uploadedBy: mongoDoc.uploadedBy.toString(),
      organization: mongoDoc.organization?.toString(),
      folder: mongoDoc.folder.toString(),
      uploadedAt: mongoDoc.uploadedAt.toISOString(),
      score: 1.0 // MongoDB no proporciona score de relevancia, asignar 1.0
    };
  });

  return {
    documents: searchDocs,
    total,
    took
  };
}

/**
 * Obtener sugerencias de autocompletado desde MongoDB
 */
async function getAutocompleteSuggestionsFromMongoDB(
  query: string,
  userId: string,
  organizationId?: string,
  limit: number = 5
): Promise<string[]> {
  const filters: Record<string, unknown> = {
    isDeleted: false
  };

  if (organizationId) {
    filters.organization = organizationId;
  } else {
    filters.uploadedBy = userId;
  }

  // Búsqueda por regex en nombre del archivo
  const regex = new RegExp(query, 'i');
  filters.$or = [
    { filename: regex },
    { originalname: regex }
  ];

  console.warn(`🔍 [MongoDB Autocomplete] Searching suggestions for: "${query}"`);

  const mongoDocuments = await Document.find(filters)
    .select('filename originalname')
    .limit(limit * 2) // Buscar el doble para eliminar duplicados
    .lean();

  // Extraer nombres únicos
  const suggestions: string[] = [];
  const seen = new Set<string>();

  for (const doc of mongoDocuments) {
    const mongoDoc = doc as unknown as IDocument;
    const name = mongoDoc.originalname || mongoDoc.filename || '';
    if (name && !seen.has(name)) {
      seen.add(name);
      suggestions.push(name);
      if (suggestions.length >= limit) break;
    }
  }

  return suggestions;
}

/**
 * Buscar documentos por nombre - CON FALLBACK A MONGODB
 */
export async function searchDocuments(params: SearchParams): Promise<SearchResult> {
  try {
    // Intentar con Elasticsearch primero
    console.warn(`🔍 [Search] Intentando búsqueda con Elasticsearch...`);
    const client = ElasticsearchClient.getInstance();
    const { query, userId, organizationId, mimeType, fromDate, toDate, limit = 20, offset = 0 } = params;

    // Construir filtros
    const filters: ESFilter[] = [];

    // Filtrar por organización si se proporciona, sino por usuario
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

    // Realizar búsqueda con query_string para mayor flexibilidad
    // Agregar wildcards automáticamente para búsqueda parcial
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

    const documents = result.hits.hits.map((hit) => {
      const doc: SearchDocument = {
        id: hit._id,
        score: hit._score ?? 0,
        ...(hit._source as ESSource)
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
    console.warn(`⚠️  [Search] Elasticsearch no disponible: ${errorMessage}`);
    console.warn(`🔄 [Search] Usando MongoDB como fallback...`);

    // FALLBACK a MongoDB
    try {
      return await searchDocumentsInMongoDB(params);
    } catch (mongoError: unknown) {
      const mongoErrorMessage = mongoError instanceof Error ? mongoError.message : 'Unknown error';
      console.error(`❌ [Search] Ambas búsquedas fallaron:`, {
        elasticsearch: errorMessage,
        mongodb: mongoErrorMessage
      });
      throw new HttpError(500, 'Error searching documents');
    }
  }
}

/**
 * Obtener sugerencias de autocompletado - CON FALLBACK A MONGODB
 */
export async function getAutocompleteSuggestions(
  query: string,
  userId: string,
  organizationId?: string,
  limit: number = 5
): Promise<string[]> {
  try {
    // Intentar con Elasticsearch primero
    console.warn(`🔍 [Autocomplete] Intentando sugerencias con Elasticsearch...`);
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

    const suggestions = result.hits.hits.map((hit): string => {
      const source = hit._source as ESSource;
      const name = source.originalname ?? source.filename ?? '';
      return String(name);
    });

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
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.warn(`⚠️  [Autocomplete] Elasticsearch no disponible: ${errorMessage}`);
    console.warn(`🔄 [Autocomplete] Usando MongoDB como fallback...`);

    // FALLBACK a MongoDB
    try {
      return await getAutocompleteSuggestionsFromMongoDB(query, userId, organizationId, limit);
    } catch (mongoError: unknown) {
      const mongoErrorMessage = mongoError instanceof Error ? mongoError.message : 'Unknown error';
      console.error(`❌ [Autocomplete] Ambas búsquedas fallaron:`, {
        elasticsearch: errorMessage,
        mongodb: mongoErrorMessage
      });
      // Retornar array vacío en lugar de lanzar error (autocompletado es no-crítico)
      return [];
    }
  }
}

export default {
  indexDocument,
  removeDocumentFromIndex,
  searchDocuments,
  getAutocompleteSuggestions
};
