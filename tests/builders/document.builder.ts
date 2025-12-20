/**
 * Document Builder
 * Constructor de documentos de prueba con patrón builder
 */

import path from 'path';
import fs from 'fs';

interface DocumentData {
  filename: string;
  content: string;
  mimeType: string;
  size?: number;
}

export class DocumentBuilder {
  private documentData: DocumentData = {
    filename: 'default-file.txt',
    content: 'Default content',
    mimeType: 'text/plain'
  };

  /**
   * Establece el nombre del archivo
   */
  withFilename(filename: string): DocumentBuilder {
    this.documentData.filename = filename;
    return this;
  }

  /**
   * Establece el contenido del archivo
   */
  withContent(content: string): DocumentBuilder {
    this.documentData.content = content;
    return this;
  }

  /**
   * Establece el tipo MIME
   */
  withMimeType(mimeType: string): DocumentBuilder {
    this.documentData.mimeType = mimeType;
    return this;
  }

  /**
   * Establece el tamaño del archivo
   */
  withSize(size: number): DocumentBuilder {
    this.documentData.size = size;
    return this;
  }

  /**
   * Crea un documento PDF
   */
  asPdf(): DocumentBuilder {
    this.documentData.filename = 'document.pdf';
    this.documentData.mimeType = 'application/pdf';
    this.documentData.content = 'PDF content simulation';
    return this;
  }

  /**
   * Crea una imagen PNG
   */
  asPng(): DocumentBuilder {
    this.documentData.filename = 'image.png';
    this.documentData.mimeType = 'image/png';
    this.documentData.content = 'PNG image content';
    return this;
  }

  /**
   * Crea una imagen JPEG
   */
  asJpeg(): DocumentBuilder {
    this.documentData.filename = 'image.jpg';
    this.documentData.mimeType = 'image/jpeg';
    this.documentData.content = 'JPEG image content';
    return this;
  }

  /**
   * Crea un documento de texto
   */
  asText(): DocumentBuilder {
    this.documentData.filename = 'document.txt';
    this.documentData.mimeType = 'text/plain';
    return this;
  }

  /**
   * Crea un archivo con nombre malicioso (path traversal)
   */
  withMaliciousFilename(): DocumentBuilder {
    this.documentData.filename = '../../etc/passwd.txt';
    return this;
  }

  /**
   * Crea un archivo con extensión peligrosa
   */
  withDangerousExtension(): DocumentBuilder {
    this.documentData.filename = 'malware.exe';
    this.documentData.content = 'executable content';
    return this;
  }

  /**
   * Crea un archivo con nombre muy largo
   */
  withLongFilename(length: number = 300): DocumentBuilder {
    this.documentData.filename = 'a'.repeat(length) + '.txt';
    return this;
  }

  /**
   * Crea un archivo temporal en el sistema de archivos
   * IMPORTANTE: Debe limpiarse después de usarse
   */
  createTempFile(directory: string = __dirname): string {
    const filePath = path.join(directory, this.documentData.filename);
    fs.writeFileSync(filePath, this.documentData.content);
    return filePath;
  }

  /**
   * Elimina un archivo temporal del sistema de archivos
   */
  static deleteTempFile(filePath: string): void {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /**
   * Construye y retorna el objeto documento
   */
  build(): DocumentData {
    return { ...this.documentData };
  }

  /**
   * Retorna un Buffer con el contenido del documento
   */
  buildBuffer(): Buffer {
    return Buffer.from(this.documentData.content);
  }

  /**
   * Crea múltiples documentos
   */
  static buildMany(count: number, prefix: string = 'file'): DocumentData[] {
    const documents: DocumentData[] = [];
    for (let i = 0; i < count; i++) {
      documents.push(
        new DocumentBuilder()
          .withFilename(`${prefix}-${i + 1}.txt`)
          .withContent(`Content for ${prefix} ${i + 1}`)
          .build()
      );
    }
    return documents;
  }
}

/**
 * Función helper para crear un documento básico rápidamente
 */
export const createDocument = (overrides?: Partial<DocumentData>): DocumentData => {
  const builder = new DocumentBuilder();
  
  if (overrides?.filename) builder.withFilename(overrides.filename);
  if (overrides?.content) builder.withContent(overrides.content);
  if (overrides?.mimeType) builder.withMimeType(overrides.mimeType);
  if (overrides?.size) builder.withSize(overrides.size);
  
  return builder.build();
};
