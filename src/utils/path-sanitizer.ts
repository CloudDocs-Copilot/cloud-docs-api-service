/**
 * Path Sanitizer - Seguridad contra Path Traversal
 * 
 * Este módulo proporciona funciones para sanitizar y validar paths de archivos,
 * previniendo ataques de Path Traversal que intentan acceder a archivos fuera
 * del directorio permitido.
 */

import path from 'path';
import { promises as fs } from 'fs';

/**
 * Configuración de sanitización de paths
 */
export const PATH_SANITIZATION_CONFIG = {
  // Extensiones de archivo permitidas (whitelist)
  allowedExtensions: [
    '.txt', '.pdf', '.doc', '.docx', '.xls', '.xlsx',
    '.ppt', '.pptx', '.jpg', '.jpeg', '.png', '.gif',
    '.zip', '.rar', '.csv', '.json', '.xml'
  ],
  
  // Extensiones bloqueadas explícitamente (blacklist adicional)
  blockedExtensions: [
    '.exe', '.bat', '.cmd', '.sh', '.ps1', '.vbs',
    '.dll', '.so', '.dylib', '.app', '.msi', '.dmg',
    '.scr', '.com', '.pif', '.js', '.jar', '.bin'
  ],
  
  // Caracteres peligrosos en nombres de archivo
  dangerousChars: /[<>:"|?*\x00-\x1f]/g,
  
  // Patrones de Path Traversal
  traversalPatterns: [
    /\.\./,           // ..
    /\.\.\\/,         // ..\
    /\.\.\//,         // ../
    /%2e%2e/i,        // URL encoded ..
    /%252e%252e/i,    // Double URL encoded ..
    /\.\./,           // Unicode variations
  ],
  
  // Longitud máxima de path
  maxPathLength: 255,
  
  // Longitud máxima de nombre de archivo
  maxFileNameLength: 100,
};

/**
 * Interface para el resultado de validación de path
 */
export interface PathValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedPath?: string;
}

/**
 * Detecta intentos de Path Traversal
 */
function hasTraversalAttempt(filePath: string): boolean {
  return PATH_SANITIZATION_CONFIG.traversalPatterns.some(pattern => 
    pattern.test(filePath)
  );
}

/**
 * Valida la extensión de un archivo
 */
function isAllowedExtension(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  
  // Si hay extensiones permitidas definidas, solo permitir esas
  if (PATH_SANITIZATION_CONFIG.allowedExtensions.length > 0) {
    return PATH_SANITIZATION_CONFIG.allowedExtensions.includes(ext);
  }
  
  // De lo contrario, solo bloquear las extensiones prohibidas
  return !PATH_SANITIZATION_CONFIG.blockedExtensions.includes(ext);
}

/**
 * Sanitiza un nombre de archivo eliminando caracteres peligrosos
 */
function sanitizeFileName(fileName: string): string {
  // Eliminar caracteres peligrosos
  let sanitized = fileName.replace(PATH_SANITIZATION_CONFIG.dangerousChars, '_');
  
  // Eliminar espacios al inicio y final
  sanitized = sanitized.trim();
  
  // Reemplazar múltiples espacios consecutivos por uno solo
  sanitized = sanitized.replace(/\s+/g, ' ');
  
  // Eliminar puntos al inicio (archivos ocultos en Unix)
  sanitized = sanitized.replace(/^\.+/, '');
  
  return sanitized;
}

/**
 * Sanitiza y valida un path de archivo
 * 
 * @param filePath - Path a sanitizar
 * @param baseDir - Directorio base permitido (opcional)
 * @returns Resultado de validación con path sanitizado si es válido
 * 
 * @example
 * const result = sanitizePath('../../etc/passwd');
 * if (!result.isValid) {
 *   console.error(result.errors);
 * }
 */
export function sanitizePath(
  filePath: string,
  baseDir?: string
): PathValidationResult {
  const errors: string[] = [];

  // Validar longitud
  if (filePath.length > PATH_SANITIZATION_CONFIG.maxPathLength) {
    errors.push(`Path exceeds maximum length of ${PATH_SANITIZATION_CONFIG.maxPathLength} characters`);
    return { isValid: false, errors };
  }

  // Detectar intentos de Path Traversal
  if (hasTraversalAttempt(filePath)) {
    errors.push('Path traversal attempt detected');
    return { isValid: false, errors };
  }

  // Normalizar el path (elimina .., ., etc.)
  let normalizedPath = path.normalize(filePath);

  // Sanitizar todos los componentes del path usando whitelist
  // Solo permitir caracteres seguros: a-z, A-Z, 0-9, _, -, .
  const pathComponents = normalizedPath.split(path.sep).filter(p => p);
  const sanitizedComponents = pathComponents.map(component => 
    component.replace(/[^a-z0-9_.-]/gi, '_')
  );
  
  // Reconstruir el path con componentes sanitizados
  normalizedPath = sanitizedComponents.join(path.sep);

  // Si se proporciona baseDir, asegurar que el path está dentro
  if (baseDir) {
    const absoluteBase = path.resolve(baseDir);
    const absolutePath = path.resolve(baseDir, normalizedPath);

    // Verificar que el path resuelto está dentro del directorio base
    if (!absolutePath.startsWith(absoluteBase)) {
      errors.push('Path is outside allowed directory');
      return { isValid: false, errors };
    }
  }

  // Obtener el nombre del archivo
  const fileName = path.basename(normalizedPath);

  // Validar longitud del nombre de archivo
  if (fileName.length > PATH_SANITIZATION_CONFIG.maxFileNameLength) {
    errors.push(`File name exceeds maximum length of ${PATH_SANITIZATION_CONFIG.maxFileNameLength} characters`);
  }

  // Validar extensión
  if (fileName.includes('.') && !isAllowedExtension(fileName)) {
    const ext = path.extname(fileName);
    errors.push(`File extension '${ext}' is not allowed`);
  }

  // Sanitizar el nombre de archivo
  const sanitizedFileName = sanitizeFileName(fileName);
  const sanitizedPath = sanitizedComponents.length > 1 
    ? path.join(...sanitizedComponents.slice(0, -1), sanitizedFileName)
    : sanitizedFileName;

  return {
    isValid: errors.length === 0,
    errors,
    sanitizedPath: errors.length === 0 ? sanitizedPath : undefined,
  };
}

/**
 * Sanitiza un path y lanza un error si es inválido
 * 
 * @param filePath - Path a sanitizar
 * @param baseDir - Directorio base permitido (opcional)
 * @throws Error si el path es inválido
 * @returns Path sanitizado si es válido
 * 
 * @example
 * try {
 *   const safePath = sanitizePathOrThrow('uploads/file.txt', './storage');
 * } catch (error) {
 *   console.error(error.message);
 * }
 */
export function sanitizePathOrThrow(
  filePath: string,
  baseDir?: string
): string {
  const result = sanitizePath(filePath, baseDir);
  
  if (!result.isValid) {
    throw new Error(
      `Path validation failed: ${result.errors.join('. ')}`
    );
  }
  
  return result.sanitizedPath!;
}

/**
 * Verifica si un path está dentro de un directorio base de forma segura
 * 
 * @param filePath - Path a verificar
 * @param baseDir - Directorio base
 * @returns true si el path está dentro del directorio base
 */
export function isPathWithinBase(filePath: string, baseDir: string): boolean {
  const absoluteBase = path.resolve(baseDir);
  const absolutePath = path.resolve(baseDir, filePath);
  
  return absolutePath.startsWith(absoluteBase + path.sep) || 
         absolutePath === absoluteBase;
}

/**
 * Valida y sanitiza un path de archivo para descarga
 * Incluye verificación de existencia del archivo
 * 
 * @param filePath - Path del archivo
 * @param baseDir - Directorio base permitido
 * @returns Path sanitizado y validado
 * @throws Error si el path es inválido o el archivo no existe
 */
export async function validateDownloadPath(
  filePath: string,
  baseDir: string
): Promise<string> {
  // Sanitizar el path
  const sanitizedPath = sanitizePathOrThrow(filePath, baseDir);
  
  // Construir path absoluto
  const absolutePath = path.resolve(baseDir, sanitizedPath);
  
  // Verificar que está dentro del directorio base
  if (!isPathWithinBase(sanitizedPath, baseDir)) {
    throw new Error('Path is outside allowed directory');
  }
  
  // Verificar que el archivo existe
  try {
    const stats = await fs.stat(absolutePath);
    if (!stats.isFile()) {
      throw new Error('Path does not point to a file');
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('File does not exist');
    }
    throw error;
  }
  
  return absolutePath;
}

/**
 * Genera un nombre de archivo seguro basado en el nombre original
 * 
 * @param originalName - Nombre de archivo original
 * @param preserveExtension - Si debe preservar la extensión (default: true)
 * @returns Nombre de archivo sanitizado
 */
export function generateSafeFileName(
  originalName: string,
  preserveExtension: boolean = true
): string {
  const sanitized = sanitizeFileName(originalName);
  
  if (!preserveExtension) {
    return path.parse(sanitized).name;
  }
  
  const ext = path.extname(sanitized);
  const name = path.parse(sanitized).name;
  
  // Generar timestamp para evitar colisiones
  const timestamp = Date.now();
  
  return `${name}-${timestamp}${ext}`;
}

/**
 * Valida un array de paths
 * 
 * @param paths - Array de paths a validar
 * @param baseDir - Directorio base permitido (opcional)
 * @returns Array de resultados de validación
 */
export function validateMultiplePaths(
  paths: string[],
  baseDir?: string
): PathValidationResult[] {
  return paths.map(p => sanitizePath(p, baseDir));
}

/**
 * Verifica si todos los paths en un array son válidos
 * 
 * @param paths - Array de paths a validar
 * @param baseDir - Directorio base permitido (opcional)
 * @returns true si todos son válidos, false en caso contrario
 */
export function areAllPathsValid(
  paths: string[],
  baseDir?: string
): boolean {
  return paths.every(p => sanitizePath(p, baseDir).isValid);
}
