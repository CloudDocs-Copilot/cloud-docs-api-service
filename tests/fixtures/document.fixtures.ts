/**
 * Document Fixtures
 * Datos de prueba predefinidos para documentos
 */

export interface DocumentFixture {
  filename: string;
  content: string;
  mimeType?: string;
}

/**
 * Documento de texto básico
 */
export const basicTextFile: DocumentFixture = {
  filename: 'test-file.txt',
  content: 'Test content',
  mimeType: 'text/plain'
};

/**
 * Documento para compartir
 */
export const shareableDocument: DocumentFixture = {
  filename: 'share-test.txt',
  content: 'Document to share',
  mimeType: 'text/plain'
};

/**
 * Documento PDF simulado
 */
export const pdfDocument: DocumentFixture = {
  filename: 'document.pdf',
  content: 'PDF content simulation',
  mimeType: 'application/pdf'
};

/**
 * Documento PNG simulado
 */
export const pngImage: DocumentFixture = {
  filename: 'image.png',
  content: 'PNG image content',
  mimeType: 'image/png'
};

/**
 * Documentos con nombres maliciosos para pruebas de seguridad
 */
export const maliciousFilenames = [
  {
    filename: '../../etc/passwd.txt',
    description: 'Path traversal with relative path',
    content: 'malicious content'
  },
  {
    filename: '%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    description: 'URL encoded path traversal',
    content: 'malicious content'
  },
  {
    filename: 'normal-file.txt',
    description: 'Valid filename without traversal',
    content: 'normal content'
  },
  {
    filename: 'file\x00.txt',
    description: 'Filename with null byte',
    content: 'null byte content'
  },
  {
    filename: '/etc/passwd',
    description: 'Absolute path',
    content: 'absolute path content'
  },
  {
    filename: 'file<>:|?*.txt',
    description: 'Dangerous characters',
    content: 'dangerous chars content'
  }
];

/**
 * Archivos con extensiones peligrosas
 */
export const dangerousExtensions = [
  {
    filename: 'malware.exe',
    content: 'executable content',
    expectedStatus: 400,
    description: 'Executable file'
  },
  {
    filename: 'script.sh',
    content: '#!/bin/bash\necho "malicious"',
    expectedStatus: 400,
    description: 'Shell script'
  },
  {
    filename: 'safe-file.txt',
    content: 'safe content',
    expectedStatus: [201, 400, 401], // puede variar según autenticación
    description: 'Safe text file'
  }
];

/**
 * Archivos con nombres extremadamente largos
 */
export const longFilenames = [
  {
    filename: 'a'.repeat(300) + '.txt',
    content: 'long filename content',
    description: 'Extremely long filename (300 chars)'
  },
  {
    filename: 'reasonable-name.txt',
    content: 'reasonable content',
    description: 'Reasonable filename length'
  }
];
