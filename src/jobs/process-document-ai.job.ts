import DocumentModel from '../models/document.model';
import { textExtractionService } from '../services/ai/text-extraction.service';
import { documentProcessor } from '../services/document-processor.service';
import { indexDocument } from '../services/search.service';
import { getAIProvider } from '../services/ai/providers/provider.factory';

/**
 * Job de Procesamiento AI para Documentos (RFE-AI-002)
 *
 * Este job procesa un documento y:
 * 1. Extrae el texto del archivo
 * 2. Guarda el texto extraído en el documento
 * 3. Procesa chunks y genera embeddings
 * 4. Indexa el documento en Elasticsearch con contenido
 * 5. (Futuro) Clasifica el documento
 * 6. (Futuro) Genera resumen
 *
 * Este job se ejecuta asíncronamente después del upload
 * para no bloquear la respuesta al usuario.
 */

/**
 * Procesa un documento con IA
 *
 * @param documentId - ID del documento a procesar
 * @returns Promise<void>
 */
export async function processDocumentAI(documentId: string): Promise<void> {
  const startTime = Date.now();
  console.log(`[ai-job] Starting AI processing for document ${documentId}...`);

  try {
    // 1. Obtener documento
    const doc = await DocumentModel.findById(documentId);

    if (!doc) {
      throw new Error(`Document ${documentId} not found`);
    }

    // Verificar que no esté ya procesado o en procesamiento
    if (doc.aiProcessingStatus === 'completed') {
      console.log(`[ai-job] Document ${documentId} already processed, skipping`);
      return;
    }

    if (doc.aiProcessingStatus === 'processing') {
      console.log(`[ai-job] Document ${documentId} already being processed, skipping`);
      return;
    }

    // 2. Actualizar estado a 'processing'
    doc.aiProcessingStatus = 'processing';
    await doc.save();

    // 3. Extraer texto del documento
    console.log(`[ai-job] Extracting text from ${doc.mimeType} file...`);

    // Verificar si el tipo MIME es soportado
    if (!textExtractionService.isSupportedMimeType(doc.mimeType)) {
      console.log(`[ai-job] Document ${documentId} has unsupported MIME type: ${doc.mimeType}`);
      doc.aiProcessingStatus = 'completed'; // Marcar como completado sin procesar
      doc.aiProcessedAt = new Date();
      await doc.save();
      return;
    }

    const extractionResult = await textExtractionService.extractText(doc.path, doc.mimeType);

    if (!extractionResult.text || extractionResult.text.trim().length === 0) {
      console.log(`[ai-job] No text extracted from document ${documentId}`);
      doc.aiProcessingStatus = 'completed';
      doc.aiProcessedAt = new Date();
      await doc.save();
      return;
    }

    // 4. Guardar texto extraído en el documento
    doc.extractedText = extractionResult.text;
    await doc.save();

    console.log(
      `[ai-job] Extracted ${extractionResult.text.length} characters from document ${documentId}`
    );

    // 5. Procesar chunks + embeddings (vector search)
    if (doc.organization) {
      console.log(`[ai-job] Processing chunks and embeddings for document ${documentId}...`);
      const processingResult = await documentProcessor.processDocument(
        doc._id.toString(),
        doc.organization.toString(),
        extractionResult.text
      );
      console.log(
        `[ai-job] Created ${processingResult.chunksCreated} chunks for document ${documentId}`
      );
    } else {
      console.log(
        `[ai-job] Skipping chunk processing - document ${documentId} has no organization`
      );
    }

    // 6. Indexar en Elasticsearch con contenido
    try {
      console.log(`[ai-job] Indexing document ${documentId} in Elasticsearch...`);
      await indexDocument(doc, extractionResult.text);
      console.log(`[ai-job] Document ${documentId} indexed successfully`);
    } catch (esError: any) {
      // No fallar todo el procesamiento si Elasticsearch falla
      console.error(
        `[ai-job] Failed to index document ${documentId} in Elasticsearch:`,
        esError.message
      );
    }

    // 7. Clasificar documento (RFE-AI-003)
    try {
      console.log(`[ai-job] Classifying document ${documentId}...`);
      const provider = getAIProvider();
      const classification = await provider.classifyDocument(extractionResult.text);
      doc.aiCategory = classification.category;
      doc.aiConfidence = classification.confidence;
      doc.aiTags = classification.tags;
      console.log(
        `[ai-job] Document ${documentId} classified as "${classification.category}" (confidence: ${classification.confidence})`
      );
    } catch (classifyError: any) {
      // No fallar todo el procesamiento si clasificación falla
      console.error(`[ai-job] Failed to classify document ${documentId}:`, classifyError.message);
      // Dejar los campos en null/undefined
    }

    // 8. Generar resumen (RFE-AI-007)
    try {
      console.log(`[ai-job] Summarizing document ${documentId}...`);
      const provider = getAIProvider();
      const summary = await provider.summarizeDocument(extractionResult.text);
      doc.aiSummary = summary.summary;
      doc.aiKeyPoints = summary.keyPoints;
      console.log(`[ai-job] Document ${documentId} summarized successfully`);
    } catch (summarizeError: any) {
      // No fallar todo el procesamiento si resumen falla
      console.error(`[ai-job] Failed to summarize document ${documentId}:`, summarizeError.message);
      // Dejar los campos en null/undefined
    }

    // 9. Marcar como completado
    doc.aiProcessingStatus = 'completed';
    doc.aiProcessedAt = new Date();
    doc.aiError = null; // Limpiar errores anteriores si los había
    await doc.save();

    const duration = Date.now() - startTime;
    console.log(`[ai-job] ✅ Document ${documentId} processed successfully in ${duration}ms`);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(
      `[ai-job] ❌ Failed to process document ${documentId} after ${duration}ms:`,
      error.message
    );

    // Actualizar documento con error
    try {
      const doc = await DocumentModel.findById(documentId);
      if (doc) {
        doc.aiProcessingStatus = 'failed';
        doc.aiError = error.message.substring(0, 500); // Truncar a 500 chars
        await doc.save();
      }
    } catch (saveError: any) {
      console.error(
        `[ai-job] Failed to save error state for document ${documentId}:`,
        saveError.message
      );
    }

    // Re-throw para que el caller pueda manejar el error si es necesario
    throw error;
  }
}

/**
 * Procesa múltiples documentos pendientes
 * Útil para reprocesar documentos que fallaron o procesar backlog
 *
 * @param limit - Número máximo de documentos a procesar
 * @returns Número de documentos procesados exitosamente
 */
export async function processPendingDocuments(limit: number = 10): Promise<number> {
  console.log(`[ai-job] Processing up to ${limit} pending documents...`);

  try {
    // Buscar documentos con estado 'pending' o 'failed'
    const documents = await DocumentModel.find({
      aiProcessingStatus: { $in: ['pending', 'failed'] },
      isDeleted: false
    })
      .limit(limit)
      .select('_id filename')
      .lean();

    if (documents.length === 0) {
      console.log('[ai-job] No pending documents found');
      return 0;
    }

    console.log(`[ai-job] Found ${documents.length} pending documents`);

    let successCount = 0;

    for (const doc of documents) {
      try {
        await processDocumentAI(doc._id.toString());
        successCount++;
      } catch (error: any) {
        console.error(`[ai-job] Failed to process document ${doc._id}:`, error.message);
        // Continuar con el siguiente documento
      }
    }

    console.log(
      `[ai-job] Batch processing completed: ${successCount}/${documents.length} successful`
    );
    return successCount;
  } catch (error: any) {
    console.error('[ai-job] Failed to process pending documents:', error.message);
    throw error;
  }
}

/**
 * Reprocesar un documento que ya fue procesado
 * Útil cuando se actualiza el contenido o se quiere volver a clasificar
 *
 * @param documentId - ID del documento a reprocesar
 * @returns Promise<void>
 */
export async function reprocessDocument(documentId: string): Promise<void> {
  console.log(`[ai-job] Reprocessing document ${documentId}...`);

  const doc = await DocumentModel.findById(documentId);

  if (!doc) {
    throw new Error(`Document ${documentId} not found`);
  }

  // Resetear estado para forzar reprocesamiento
  doc.aiProcessingStatus = 'pending';
  doc.aiError = null;
  await doc.save();

  // Procesar
  await processDocumentAI(documentId);
}
