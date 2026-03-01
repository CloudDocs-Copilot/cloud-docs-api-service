/**
 * Utilidades para selección de campos de documentos
 * 
 * Centraliza la lógica de proyección de campos para garantizar consistencia
 * en todas las queries de documentos.
 */

/**
 * Campos básicos de documento (sin IA, sin contenido extraído)
 * Útil para listados rápidos donde no se necesita metadata IA
 */
export const BASIC_DOCUMENT_FIELDS =
  'filename originalname url uploadedBy organization folder path size mimeType uploadedAt sharedWith isDeleted createdAt updatedAt';

/**
 * Campos de metadata IA (sin extractedText que es pesado)
 * Incluye estado, clasificación, resumen y tags
 */
export const AI_METADATA_FIELDS =
  'aiProcessingStatus aiCategory aiConfidence aiTags aiSummary aiKeyPoints aiProcessedAt aiError';

/**
 * Todos los campos de documento incluyendo IA metadata
 * Excluye solo __v y extractedText (que debe pedirse explícitamente)
 */
export const FULL_DOCUMENT_FIELDS = `-__v`;

/**
 * Campos de documento con texto extraído
 * ADVERTENCIA: extractedText puede ser muy grande (>1MB)
 * Solo usar cuando sea absolutamente necesario
 */
export const DOCUMENT_WITH_EXTRACTED_TEXT = `${FULL_DOCUMENT_FIELDS} +extractedText`;

/**
 * Selección para listados de documentos
 * Incluye metadata IA pero excluye extractedText
 */
export const LIST_DOCUMENT_SELECT = FULL_DOCUMENT_FIELDS;

/**
 * Selección para detalle de documento individual
 * Incluye toda la metadata AI
 */
export const DETAIL_DOCUMENT_SELECT = FULL_DOCUMENT_FIELDS;

/**
 * Helper para determinar qué campos seleccionar según el contexto
 * 
 * @param context - Contexto de uso ('list', 'detail', 'basic', 'withText')
 * @returns String de proyección para .select()
 */
export function getDocumentSelect(
  context: 'list' | 'detail' | 'basic' | 'withText'
): string {
  switch (context) {
    case 'basic':
      return BASIC_DOCUMENT_FIELDS;
    case 'list':
      return LIST_DOCUMENT_SELECT;
    case 'detail':
      return DETAIL_DOCUMENT_SELECT;
    case 'withText':
      return DOCUMENT_WITH_EXTRACTED_TEXT;
    default:
      return FULL_DOCUMENT_FIELDS;
  }
}
