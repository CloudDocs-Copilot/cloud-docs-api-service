/**
 * File Helper
 * Funciones helper para manejo de archivos en tests
 */

import path from 'path';
import fs from 'fs';
import { request, app } from '../setup';
import { bodyOf } from '.';
import type { Response } from 'supertest';
import { DocumentBuilder } from '../builders/document.builder';
import User from '../../src/models/user.model';

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
 * Extrae el userId del token JWT
 */
function extractUserIdFromToken(token: string): string | null {
  try {
    const parsed = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()) as unknown;
    if (typeof parsed === 'object' && parsed !== null) {
      const p = parsed as Record<string, unknown>;
      const id = typeof p.id === 'string' ? p.id : typeof p.userId === 'string' ? p.userId : null;
      return id;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Crea un archivo de prueba y lo sube usando la API
 * @param authData - Puede ser un token (string) o cookies (array de strings)
 */
export async function uploadTestFile(
  authData: string | string[],
  options?: {
    filename?: string;
    content?: string;
    mimeType?: string;
    folderId?: string;
    organizationId?: string;
  }
): Promise<Response> {
  const builder = new DocumentBuilder()
    .withFilename(options?.filename || 'test-file.txt')
    .withContent(options?.content || 'Test content')
    .withMimeType(options?.mimeType || 'text/plain');

  const filePath = builder.createTempFile();

  try {
    let token = '';
    const req = request(app).post('/api/documents/upload');

    // Usar cookies si es un array, de lo contrario usar Authorization header
    if (Array.isArray(authData)) {
      const tokenCookie = authData.find((cookie: string) => cookie.startsWith('token='));
      if (tokenCookie) {
        const cookieValue = tokenCookie.split(';')[0];
        req.set('Cookie', cookieValue);
        token = cookieValue.split('=')[1];
      }
    } else {
      req.set('Authorization', `Bearer ${authData}`);
      token = authData;
    }

    // Si no se proporciona folderId u organizationId, obtenerlos del usuario
    let folderId = options?.folderId;
    let organizationId = options?.organizationId;

    if (!folderId || organizationId === undefined) {
      const userId = extractUserIdFromToken(token);
      if (userId) {
        const user = await User.findById(userId);
        if (user) {
          if (!folderId && user.rootFolder) {
            folderId = user.rootFolder.toString();
          }
          if (organizationId === undefined && user.organization) {
            organizationId = user.organization.toString();
          }
        }
      }
    }

    // Construir campos del formulario
    req.attach('file', filePath);
    req.field('folderId', folderId || '');

    // Solo enviar organizationId si existe
    if (organizationId) {
      req.field('organizationId', organizationId);
    }

    const response = await req;

    return response as Response;
  } finally {
    DocumentBuilder.deleteTempFile(filePath);
  }
}

/**
 * Sube múltiples archivos
 * @param authData - Puede ser un token (string) o cookies (array de strings)
 */
export async function uploadMultipleFiles(
  authData: string | string[],
  count: number,
  prefix: string = 'file'
): Promise<unknown[]> {
  const results: unknown[] = [];

  for (let i = 0; i < count; i++) {
    const response = await uploadTestFile(authData, {
      filename: `${prefix}-${i + 1}.txt`,
      content: `Content for ${prefix} ${i + 1}`
    });
    results.push(bodyOf(response as Response));
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
