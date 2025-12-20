/**
 * File Helper
 * Funciones helper para manejo de archivos en tests
 */

import path from 'path';
import fs from 'fs';
import { request, app } from '../setup';
import { DocumentBuilder } from '../builders/document.builder';

/**
 * Crea un archivo temporal para pruebas
 */
export function createTempFile(
  filename: string,
  content: string,
  directory: string = __dirname
): string {
  const filePath = path.join(directory, filename);
  fs.writeFileSync(filePath, content);
  return filePath;
}

/**
 * Elimina un archivo temporal
 */
export function deleteTempFile(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * Elimina múltiples archivos temporales
 */
export function deleteTempFiles(filePaths: string[]): void {
  filePaths.forEach(filePath => deleteTempFile(filePath));
}

/**
 * Crea un archivo de prueba y lo sube usando la API
 */
export async function uploadTestFile(
  authToken: string,
  options?: {
    filename?: string;
    content?: string;
    mimeType?: string;
  }
): Promise<any> {
  const builder = new DocumentBuilder()
    .withFilename(options?.filename || 'test-file.txt')
    .withContent(options?.content || 'Test content')
    .withMimeType(options?.mimeType || 'text/plain');

  const filePath = builder.createTempFile();

  try {
    const response = await request(app)
      .post('/api/documents/upload')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', filePath);

    return response;
  } finally {
    DocumentBuilder.deleteTempFile(filePath);
  }
}

/**
 * Sube múltiples archivos
 */
export async function uploadMultipleFiles(
  authToken: string,
  count: number,
  prefix: string = 'file'
): Promise<any[]> {
  const results: any[] = [];

  for (let i = 0; i < count; i++) {
    const response = await uploadTestFile(authToken, {
      filename: `${prefix}-${i + 1}.txt`,
      content: `Content for ${prefix} ${i + 1}`
    });
    results.push(response.body);
  }

  return results;
}

/**
 * Verifica si un archivo existe en el sistema
 */
export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

/**
 * Lee el contenido de un archivo
 */
export function readFileContent(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Crea un buffer para pruebas
 */
export function createTestBuffer(content: string = 'Test content'): Buffer {
  return Buffer.from(content);
}

/**
 * Limpia archivos en directorio uploads/storage de prueba
 */
export function cleanupTestFiles(directory: string): void {
  if (fs.existsSync(directory)) {
    const files = fs.readdirSync(directory);
    files.forEach(file => {
      const filePath = path.join(directory, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isFile()) {
        fs.unlinkSync(filePath);
      }
    });
  }
}

/**
 * Obtiene el tamaño de un archivo
 */
export function getFileSize(filePath: string): number {
  const stats = fs.statSync(filePath);
  return stats.size;
}

/**
 * Crea un archivo con tamaño específico
 */
export function createFileWithSize(
  filename: string,
  sizeInBytes: number,
  directory: string = __dirname
): string {
  const filePath = path.join(directory, filename);
  const buffer = Buffer.alloc(sizeInBytes, 'a');
  fs.writeFileSync(filePath, buffer);
  return filePath;
}
