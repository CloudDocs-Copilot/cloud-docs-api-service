/**
 * Utilidad para extraer texto de archivos PDF y documentos Word
 * Utiliza pdf-parse para PDFs y mammoth para archivos Word
 */

import * as fs from 'fs/promises';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

/**
 * Extrae texto de un archivo PDF
 * @param filePath - Ruta completa al archivo PDF
 * @returns Texto extraído del PDF (máximo 1MB)
 */
export async function extractTextFromPDF(filePath: string): Promise<string> {
  try {
    // Leer archivo PDF
    const dataBuffer = await fs.readFile(filePath);
    
    // Usar pdf-parse (v1.x)
    const result = await pdfParse(dataBuffer);
    
    // Limpiar y normalizar el texto
    let text = result.text
      .replace(/\s+/g, ' ')  // Normalizar espacios en blanco
      .replace(/\n+/g, '\n')  // Normalizar saltos de línea
      .trim();
    
    // Limitar a 1MB (1,000,000 caracteres)
    const MAX_CONTENT_LENGTH = 1000000;
    if (text.length > MAX_CONTENT_LENGTH) {
      text = text.substring(0, MAX_CONTENT_LENGTH);
      console.warn(`⚠️  PDF content truncated to ${MAX_CONTENT_LENGTH} characters: ${filePath}`);
    }
    
    console.log(`📄 Extracted ${text.length} characters from PDF: ${filePath}`);
    return text;
    
  } catch (error) {
    console.error(`❌ Error extracting text from PDF ${filePath}:`, error);
    // No lanzar error, simplemente retornar vacío
    return '';
  }
}

/**
 * Extrae texto de un documento Word (.docx)
 * @param filePath - Ruta completa al archivo Word
 * @returns Texto extraído del documento (máximo 1MB)
 */
export async function extractTextFromWord(filePath: string): Promise<string> {
  try {
    // Convertir Word a texto usando mammoth
    const result = await mammoth.extractRawText({ path: filePath });
    
    // Limpiar y normalizar el texto
    let text = result.value
      .replace(/\s+/g, ' ')  // Normalizar espacios en blanco
      .replace(/\n+/g, '\n')  // Normalizar saltos de línea
      .trim();
    
    // Limitar a 1MB (1,000,000 caracteres)
    const MAX_CONTENT_LENGTH = 1000000;
    if (text.length > MAX_CONTENT_LENGTH) {
      text = text.substring(0, MAX_CONTENT_LENGTH);
      console.warn(`⚠️  Word content truncated to ${MAX_CONTENT_LENGTH} characters: ${filePath}`);
    }
    
    console.log(`📝 Extracted ${text.length} characters from Word: ${filePath}`);
    return text;
    
  } catch (error) {
    console.error(`❌ Error extracting text from Word ${filePath}:`, error);
    // No lanzar error, simplemente retornar vacío
    return '';
  }
}

/**
 * Verifica si un archivo es un PDF basándose en su MIME type
 * @param mimeType - MIME type del archivo
 * @returns true si es PDF
 */
export function isPDF(mimeType: string): boolean {
  return mimeType === 'application/pdf';
}

/**
 * Verifica si un archivo es un documento Word basándose en su MIME type
 * @param mimeType - MIME type del archivo
 * @returns true si es Word
 */
export function isWord(mimeType: string): boolean {
  return mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
         mimeType === 'application/msword';
}

/**
 * Extrae texto de un documento según su tipo
 * Soporta PDFs y documentos Word
 * @param filePath - Ruta completa al archivo
 * @param mimeType - MIME type del archivo
 * @returns Texto extraído o cadena vacía
 */
export async function extractContentFromDocument(
  filePath: string,
  mimeType: string
): Promise<string> {
  if (isPDF(mimeType)) {
    return extractTextFromPDF(filePath);
  }
  
  if (isWord(mimeType)) {
    return extractTextFromWord(filePath);
  }
  
  // Para otros tipos de documentos (texto plano, etc.)
  // se pueden agregar extractores específicos aquí
  
  // Por ahora, solo PDFs y Word
  return '';
}
