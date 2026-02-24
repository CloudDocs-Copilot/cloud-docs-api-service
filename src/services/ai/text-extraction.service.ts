import fs from 'fs';
import path from 'path';
import * as pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import HttpError from '../../models/error.model';
// OCR configuration
const OCR_ENABLED = process.env.OCR_ENABLED === 'true';
const OCR_LANGUAGES = process.env.OCR_LANGUAGES || 'spa+eng';

/**
 * Tipos MIME soportados para extracción de texto
 */
export const SUPPORTED_MIME_TYPES = {
  // PDFs
  PDF: 'application/pdf',
  // Word Documents
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  DOC: 'application/msword',
  // Text files
  TXT: 'text/plain',
  // Markdown
  MD: 'text/markdown',
  // Images
  PNG: 'image/png',
  JPG: 'image/jpeg',
  TIFF: 'image/tiff',
  BMP: 'image/bmp'
} as const;

/**
 * Resultado de la extracción de texto
 */
export interface ITextExtractionResult {
  /** Texto extraído del documento */
  text: string;
  /** Número de caracteres extraídos */
  charCount: number;
  /** Número de palabras aproximado */
  wordCount: number;
  /** Tipo MIME del documento */
  mimeType: string;
  /** Metadata adicional (si está disponible) */
  metadata?: {
    pages?: number;
    author?: string;
    title?: string;
    subject?: string;
    creator?: string;
    producer?: string;
    creationDate?: Date;
    modificationDate?: Date;
  };
}

/**
 * Servicio de Extracción de Texto
 *
 * Extrae texto de diferentes formatos de documentos:
 * - PDFs (usando pdf-parse)
 * - DOCX (usando mammoth)
 * - DOC (usando mammoth)
 * - TXT (lectura directa)
 * - MD (lectura directa)
 */
export class TextExtractionService {
  /**
   * Extrae texto de un archivo según su tipo MIME
   *
   * @param filePath - Ruta completa al archivo en el filesystem
   * @param mimeType - Tipo MIME del archivo
   * @returns Resultado de la extracción con texto y metadata
   * @throws HttpError si el formato no es soportado o hay errores de lectura
   */
  async extractText(filePath: string, mimeType: string): Promise<ITextExtractionResult> {
    // Validar que el archivo existe
    try {
      const stats = await fs.promises.stat(filePath);
      if (!stats.isFile()) {
        throw new HttpError(400, 'Path is not a file');
      }
    } catch (err: unknown) {
      // If file does not exist, stat will throw an ENOENT error
      // Map that to a 404 File not found to keep existing behaviour
      // For other errors, rethrow to surface the original problem
      const anyErr = err as any;
      if (anyErr && anyErr.code === 'ENOENT') {
        throw new HttpError(404, 'File not found');
      }
      if (err instanceof HttpError) throw err;
      throw err;
    }

    console.log(`[text-extraction] Extracting text from ${path.basename(filePath)} (${mimeType})`);

    try {
      let result: ITextExtractionResult;

      switch (mimeType) {
        case SUPPORTED_MIME_TYPES.PDF:
          result = await this.extractFromPdf(filePath);
          // If PDF returned empty text and OCR enabled, try OCR fallback
          if (OCR_ENABLED && (!result.text || result.text.length === 0)) {
            console.log('[text-extraction] PDF returned empty text, attempting OCR fallback');
            result = await this.extractFromPdfWithOcr(filePath);
          }
          break;

        case SUPPORTED_MIME_TYPES.DOCX:
        case SUPPORTED_MIME_TYPES.DOC:
          result = await this.extractFromWord(filePath, mimeType);
          break;

        case SUPPORTED_MIME_TYPES.TXT:
        case SUPPORTED_MIME_TYPES.MD:
          result = await this.extractFromTextAsync(filePath, mimeType);
          break;

        case SUPPORTED_MIME_TYPES.PNG:
        case SUPPORTED_MIME_TYPES.JPG:
        case SUPPORTED_MIME_TYPES.TIFF:
        case SUPPORTED_MIME_TYPES.BMP:
          if (!OCR_ENABLED) {
            throw new HttpError(400, 'OCR is disabled on server');
          }
          result = await this.extractFromImage(filePath);
          break;

        default:
          throw new HttpError(
            400,
            `Unsupported file type: ${mimeType}. Supported types: PDF, DOCX, DOC, TXT, MD, PNG, JPG, TIFF, BMP`
          );
      }

      console.log(
        `[text-extraction] Extracted ${result.charCount} chars (${result.wordCount} words)`
      );

      return result;
    } catch (error: unknown) {
      // Si es un HttpError, propagarlo
      if (error instanceof HttpError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[text-extraction] Error extracting text:', errorMessage);

      throw new HttpError(500, `Failed to extract text: ${errorMessage}`);
    }
  }

  /**
   * Extrae texto de un archivo PDF
   *
   * @param filePath - Ruta al archivo PDF
   * @returns Resultado de la extracción
   */
  private async extractFromPdf(filePath: string): Promise<ITextExtractionResult> {
    const dataBuffer = await fs.promises.readFile(filePath);
    // pdf-parse se importa como namespace, necesitamos usar .default
    const data = await (pdfParse as any)(dataBuffer);

    // Extraer metadata si está disponible
    const metadata: ITextExtractionResult['metadata'] = {
      pages: data.numpages
    };

    // pdf-parse incluye info en data.info
    if (data.info) {
      if (data.info.Author) metadata.author = data.info.Author;
      if (data.info.Title) metadata.title = data.info.Title;
      if (data.info.Subject) metadata.subject = data.info.Subject;
      if (data.info.Creator) metadata.creator = data.info.Creator;
      if (data.info.Producer) metadata.producer = data.info.Producer;
      if (data.info.CreationDate) {
        metadata.creationDate = this.parsePdfDate(data.info.CreationDate);
      }
      if (data.info.ModDate) {
        metadata.modificationDate = this.parsePdfDate(data.info.ModDate);
      }
    }

    const text = data.text.trim();
    const wordCount = this.countWords(text);

    return {
      text,
      charCount: text.length,
      wordCount,
      mimeType: SUPPORTED_MIME_TYPES.PDF,
      metadata
    };
  }

  /**
   * Extrae texto de un documento Word (DOCX/DOC)
   *
   * @param filePath - Ruta al archivo Word
   * @param mimeType - Tipo MIME del archivo
   * @returns Resultado de la extracción
   */
  private async extractFromWord(
    filePath: string,
    mimeType: string
  ): Promise<ITextExtractionResult> {
    // mammoth extrae el texto del documento Word
    const result = await mammoth.extractRawText({ path: filePath });

    const text = result.value.trim();
    const wordCount = this.countWords(text);

    // Log de warnings si los hay
    if (result.messages.length > 0) {
      console.warn(
        '[text-extraction] Mammoth warnings:',
        result.messages.map(m => m.message).join(', ')
      );
    }

    return {
      text,
      charCount: text.length,
      wordCount,
      mimeType
    };
  }

  /**
   * Extrae texto de un archivo de texto plano (TXT/MD)
   *
   * @param filePath - Ruta al archivo de texto
   * @param mimeType - Tipo MIME del archivo
   * @returns Resultado de la extracción
   */
  // synchronous extractFromText removed in favor of async version

  private async extractFromTextAsync(
    filePath: string,
    mimeType: string
  ): Promise<ITextExtractionResult> {
    const text = (await fs.promises.readFile(filePath, 'utf-8')).trim();
    const wordCount = this.countWords(text);

    return {
      text,
      charCount: text.length,
      wordCount,
      mimeType
    };
  }

  /**
   * Extrae texto de una imagen usando tesseract.js
   */
  private async extractFromImage(filePath: string): Promise<ITextExtractionResult> {
    if (!OCR_ENABLED) {
      throw new HttpError(400, 'OCR is not enabled on this server');
    }

    // lazy require to avoid hard dependency when OCR not used / not installed
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createWorker } = require('tesseract.js');

    const worker = createWorker({
      logger: (m: any) => console.debug('[tesseract]', m)
    });

    try {
      await worker.load();
      await worker.loadLanguage(OCR_LANGUAGES);
      await worker.initialize(OCR_LANGUAGES);

      const { data } = await worker.recognize(filePath);
      const text = data && data.text ? data.text.trim() : '';
      const wordCount = this.countWords(text);

      return {
        text,
        charCount: text.length,
        wordCount,
        mimeType: 'image/*'
      };
    } finally {
      try {
        await worker.terminate();
      } catch (e) {
        // ignore
      }
    }
  }

  /**
   * Fallback OCR for PDFs: attempt to OCR the PDF file directly
   * (best-effort — may require additional rendering logic depending on environment)
   */
  private async extractFromPdfWithOcr(filePath: string): Promise<ITextExtractionResult> {
    if (!OCR_ENABLED) {
      return {
        text: '',
        charCount: 0,
        wordCount: 0,
        mimeType: SUPPORTED_MIME_TYPES.PDF
      };
    }

    // Best-effort: try running tesseract on the PDF path directly
    // Note: Depending on environment, tesseract.js may require pdf rendering support.
    try {
      const ocrResult = await this.extractFromImage(filePath);
      return {
        text: ocrResult.text,
        charCount: ocrResult.charCount,
        wordCount: ocrResult.wordCount,
        mimeType: SUPPORTED_MIME_TYPES.PDF
      };
    } catch (err) {
      console.warn(
        '[text-extraction] OCR fallback for PDF failed:',
        err instanceof Error ? err.message : err
      );
      return {
        text: '',
        charCount: 0,
        wordCount: 0,
        mimeType: SUPPORTED_MIME_TYPES.PDF
      };
    }
  }

  /**
   * Cuenta el número aproximado de palabras en un texto
   *
   * @param text - Texto a analizar
   * @returns Número de palabras
   */
  private countWords(text: string): number {
    if (!text || text.length === 0) return 0;

    // Dividir por espacios en blanco y filtrar strings vacíos
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Parsea una fecha PDF (formato: D:YYYYMMDDHHmmSSOHH'mm')
   *
   * @param pdfDate - String de fecha en formato PDF
   * @returns Date object o undefined si no se puede parsear
   */
  private parsePdfDate(pdfDate: string): Date | undefined {
    try {
      // Formato típico: D:20230515120000Z o D:20230515120000+02'00'
      // Eliminar el prefijo D: si existe
      const dateStr = pdfDate.replace(/^D:/, '');

      // Extraer componentes: YYYYMMDDHHmmSS
      const year = parseInt(dateStr.substring(0, 4), 10);
      const month = parseInt(dateStr.substring(4, 6), 10) - 1; // Months are 0-indexed
      const day = parseInt(dateStr.substring(6, 8), 10);
      const hour = parseInt(dateStr.substring(8, 10), 10);
      const minute = parseInt(dateStr.substring(10, 12), 10);
      const second = parseInt(dateStr.substring(12, 14), 10);

      return new Date(year, month, day, hour, minute, second);
    } catch (error) {
      console.warn('[text-extraction] Failed to parse PDF date:', pdfDate);
      return undefined;
    }
  }

  /**
   * Verifica si un tipo MIME es soportado para extracción de texto
   *
   * @param mimeType - Tipo MIME a verificar
   * @returns true si es soportado
   */
  isSupportedMimeType(mimeType: string): boolean {
    return Object.values(SUPPORTED_MIME_TYPES).includes(mimeType as any);
  }

  /**
   * Obtiene la lista de tipos MIME soportados
   *
   * @returns Array de tipos MIME soportados
   */
  getSupportedMimeTypes(): string[] {
    return Object.values(SUPPORTED_MIME_TYPES);
  }
}

/**
 * Instancia singleton del servicio de extracción de texto
 */
export const textExtractionService = new TextExtractionService();
