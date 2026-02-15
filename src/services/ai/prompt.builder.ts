/**
 * Template de prompt para RAG (Retrieval-Augmented Generation)
 *
 * Este módulo contiene funciones para construir prompts optimizados
 * que combinan contexto recuperado con la pregunta del usuario.
 */

/**
 * Construye un prompt estructurado para RAG
 *
 * El prompt resultante incluye:
 * - Instrucciones claras para el modelo
 * - Contexto recuperado de documentos
 * - La pregunta del usuario
 * - Restricciones sobre cómo responder
 *
 * @param question - Pregunta del usuario
 * @param contextChunks - Array de chunks de texto relevantes
 * @returns Prompt formateado listo para enviar al LLM
 */
export function buildPrompt(question: string, contextChunks: string[]): string {
  // Validar entrada
  if (!question || question.trim().length === 0) {
    throw new Error('Question cannot be empty');
  }

  if (!contextChunks || contextChunks.length === 0) {
    throw new Error('At least one context chunk is required');
  }

  // Filtrar chunks vacíos
  const validChunks = contextChunks
    .filter(chunk => chunk && chunk.trim().length > 0)
    .map(chunk => chunk.trim());

  if (validChunks.length === 0) {
    throw new Error('No valid context chunks provided');
  }

  // Construir sección de contexto
  const contextSection = validChunks
    .map((chunk, index) => {
      return `[Fragmento ${index + 1}]\n${chunk}`;
    })
    .join('\n\n---\n\n');

  // Construir prompt completo
  const prompt = `Eres un asistente de inteligencia artificial especializado en responder preguntas basándote únicamente en el contexto proporcionado.

Tu tarea es analizar los siguientes fragmentos de documentos y responder la pregunta del usuario de manera precisa y útil.

INSTRUCCIONES IMPORTANTES:
1. Solo utiliza la información presente en los fragmentos de contexto proporcionados
2. Si la respuesta no está en el contexto, indica claramente que no tienes suficiente información
3. No inventes información ni uses conocimiento externo
4. Cita el número de fragmento cuando sea relevante (ej: "Según el Fragmento 2...")
5. Sé conciso pero completo en tu respuesta
6. Si hay información contradictoria entre fragmentos, menciónalo

CONTEXTO:
${contextSection}

PREGUNTA DEL USUARIO:
${question.trim()}

RESPUESTA:`;

  return prompt;
}

/**
 * Construye un prompt simplificado sin instrucciones extensas
 * Útil para modelos que ya tienen instrucciones de sistema configuradas
 *
 * @param question - Pregunta del usuario
 * @param contextChunks - Array de chunks de texto relevantes
 * @returns Prompt simple formateado
 */
export function buildSimplePrompt(question: string, contextChunks: string[]): string {
  // Validar entrada
  if (!question || question.trim().length === 0) {
    throw new Error('Question cannot be empty');
  }

  if (!contextChunks || contextChunks.length === 0) {
    throw new Error('At least one context chunk is required');
  }

  // Filtrar chunks vacíos
  const validChunks = contextChunks
    .filter(chunk => chunk && chunk.trim().length > 0)
    .map(chunk => chunk.trim());

  if (validChunks.length === 0) {
    throw new Error('No valid context chunks provided');
  }

  // Unir contexto de forma simple
  const context = validChunks.join('\n\n');

  return `Contexto:\n${context}\n\nPregunta: ${question.trim()}\n\nResponde basándote únicamente en el contexto proporcionado:`;
}

/**
 * Construye un prompt para conversación con historial
 * Incluye mensajes anteriores para mantener contexto de la conversación
 *
 * @param question - Pregunta actual del usuario
 * @param contextChunks - Chunks relevantes de documentos
 * @param conversationHistory - Historial de mensajes previos
 * @returns Prompt con historial de conversación
 */
export function buildConversationalPrompt(
  question: string,
  contextChunks: string[],
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
): string {
  // Validar entrada
  if (!question || question.trim().length === 0) {
    throw new Error('Question cannot be empty');
  }

  if (!contextChunks || contextChunks.length === 0) {
    throw new Error('At least one context chunk is required');
  }

  // Construir contexto
  const validChunks = contextChunks
    .filter(chunk => chunk && chunk.trim().length > 0)
    .map(chunk => chunk.trim());

  if (validChunks.length === 0) {
    throw new Error('No valid context chunks provided');
  }

  const contextSection = validChunks
    .map((chunk, index) => `[Fragmento ${index + 1}]\n${chunk}`)
    .join('\n\n---\n\n');

  // Construir historial
  let historySection = '';
  if (conversationHistory && conversationHistory.length > 0) {
    historySection = conversationHistory
      .map(msg => {
        const role = msg.role === 'user' ? 'Usuario' : 'Asistente';
        return `${role}: ${msg.content}`;
      })
      .join('\n\n');

    historySection = `\n\nHISTORIAL DE CONVERSACIÓN:\n${historySection}\n`;
  }

  return `Eres un asistente especializado en responder preguntas basándote en documentos proporcionados.
${historySection}
CONTEXTO ACTUALIZADO:
${contextSection}

NUEVA PREGUNTA:
${question.trim()}

Responde basándote en el contexto y considerando la conversación previa:`;
}

/**
 * Construye un prompt para resumir información de múltiples chunks
 *
 * @param topic - Tema o pregunta general
 * @param contextChunks - Chunks a resumir
 * @returns Prompt para generar un resumen
 */
export function buildSummarizationPrompt(topic: string, contextChunks: string[]): string {
  if (!topic || topic.trim().length === 0) {
    throw new Error('Topic cannot be empty');
  }

  if (!contextChunks || contextChunks.length === 0) {
    throw new Error('At least one context chunk is required');
  }

  const validChunks = contextChunks
    .filter(chunk => chunk && chunk.trim().length > 0)
    .map(chunk => chunk.trim());

  if (validChunks.length === 0) {
    throw new Error('No valid context chunks provided');
  }

  const content = validChunks.join('\n\n');

  return `Resume la siguiente información sobre: ${topic.trim()}

CONTENIDO:
${content}

Proporciona un resumen claro y conciso que capture los puntos principales:`;
}

/**
 * Estima el número de tokens aproximado de un texto
 * Útil para validar que el prompt no exceda límites del modelo
 *
 * Estimación: ~1 token por cada 4 caracteres (aproximación para inglés/español)
 *
 * @param text - Texto a estimar
 * @returns Número aproximado de tokens
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  // Regla general: 1 token ≈ 4 caracteres
  // Esto es una aproximación; para cálculo exacto usar tiktoken
  return Math.ceil(text.length / 4);
}

/**
 * Trunca chunks para que el prompt total no exceda un límite de tokens
 *
 * @param contextChunks - Chunks originales
 * @param maxTokens - Límite máximo de tokens para el contexto
 * @returns Chunks truncados que caben en el límite
 */
export function truncateContext(contextChunks: string[], maxTokens: number): string[] {
  if (maxTokens <= 0) {
    throw new Error('maxTokens must be positive');
  }

  const truncated: string[] = [];
  let currentTokens = 0;

  for (const chunk of contextChunks) {
    const chunkTokens = estimateTokens(chunk);

    if (currentTokens + chunkTokens <= maxTokens) {
      truncated.push(chunk);
      currentTokens += chunkTokens;
    } else {
      // Intentar agregar parte del chunk si hay espacio
      const remainingTokens = maxTokens - currentTokens;
      if (remainingTokens > 50) {
        // Solo agregar si quedan al menos 50 tokens
        const charsToInclude = remainingTokens * 4;
        const partialChunk = chunk.substring(0, charsToInclude) + '...';
        truncated.push(partialChunk);
      }
      break;
    }
  }

  return truncated;
}
