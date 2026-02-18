/**
 * URL Validator - Seguridad contra SSRF y Open Redirect
 *
 * Este módulo proporciona funciones para validar URLs y prevenir:
 * - SSRF (Server-Side Request Forgery): Ataques donde el servidor hace peticiones maliciosas
 * - Open Redirect: Redirecciones a sitios maliciosos
 * - Acceso a recursos internos/privados
 */

import { URL } from 'url';

/**
 * Configuración de validación de URLs
 */
export const URL_VALIDATION_CONFIG = {
  // Esquemas permitidos
  allowedSchemes: ['http:', 'https:'],

  // Puertos bloqueados (puertos de servicios internos comunes)
  blockedPorts: [
    22, // SSH
    23, // Telnet
    25, // SMTP
    3306, // MySQL
    5432, // PostgreSQL
    6379, // Redis
    9200, // Elasticsearch
    27017, // MongoDB
    27018,
    27019,
    5984, // CouchDB
    8086, // InfluxDB
    9000 // MinIO
  ],

  // Rangos de IPs privadas (RFC 1918)
  privateIpRanges: [
    /^127\./, // Localhost
    /^10\./, // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[01])\./, // 172.16.0.0/12
    /^192\.168\./, // 192.168.0.0/16
    /^169\.254\./, // Link-local
    /^::1$/, // IPv6 localhost
    /^fe80:/, // IPv6 link-local
    /^fc00:/, // IPv6 unique local
    /^fd00:/ // IPv6 unique local
  ],

  // Dominios especiales bloqueados
  blockedDomains: [
    'localhost',
    'metadata.google.internal', // GCP metadata
    '169.254.169.254' // AWS/Azure metadata
  ],

  // Longitud máxima de URL
  maxLength: 2048
};

/**
 * Interface para el resultado de validación
 */
export interface UrlValidationResult {
  isValid: boolean;
  errors: string[];
  url?: URL;
}

/**
 * Valida si una IP es privada/interna
 */
function isPrivateIp(hostname: string): boolean {
  return URL_VALIDATION_CONFIG.privateIpRanges.some(regex => regex.test(hostname));
}

/**
 * Valida si un dominio está bloqueado
 */
function isBlockedDomain(hostname: string): boolean {
  const lowerHostname = hostname.toLowerCase();
  return URL_VALIDATION_CONFIG.blockedDomains.some(
    domain => lowerHostname === domain || lowerHostname.endsWith(`.${domain}`)
  );
}

/**
 * Valida si un puerto está bloqueado
 */
function isBlockedPort(port: string): boolean {
  const portNum = parseInt(port, 10);
  return URL_VALIDATION_CONFIG.blockedPorts.includes(portNum);
}

/**
 * Valida una URL contra ataques SSRF y Open Redirect
 *
 * @param urlString - URL a validar
 * @param allowedDomains - Lista opcional de dominios permitidos (whitelist)
 * @returns Resultado de validación con errores si existen
 *
 * @example
 * const result = validateUrl('https://example.com/path');
 * if (!result.isValid) {
 *   console.error(result.errors);
 * }
 */
export function validateUrl(urlString: string, allowedDomains?: string[]): UrlValidationResult {
  const errors: string[] = [];

  // Validar longitud
  if (urlString.length > URL_VALIDATION_CONFIG.maxLength) {
    errors.push(`URL exceeds maximum length of ${URL_VALIDATION_CONFIG.maxLength} characters`);
    return { isValid: false, errors };
  }

  // Intentar parsear la URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlString);
  } catch (error) {
    errors.push('Invalid URL format');
    return { isValid: false, errors };
  }

  // Validar esquema (protocolo)
  if (!URL_VALIDATION_CONFIG.allowedSchemes.includes(parsedUrl.protocol)) {
    errors.push(
      `Protocol '${parsedUrl.protocol}' is not allowed. Allowed protocols: ${URL_VALIDATION_CONFIG.allowedSchemes.join(', ')}`
    );
  }

  // Validar que no sea IP privada
  if (isPrivateIp(parsedUrl.hostname)) {
    errors.push('Access to private IP addresses is not allowed');
  }

  // Validar que no sea dominio bloqueado
  if (isBlockedDomain(parsedUrl.hostname)) {
    errors.push(`Domain '${parsedUrl.hostname}' is blocked`);
  }

  // Validar puerto bloqueado
  if (parsedUrl.port && isBlockedPort(parsedUrl.port)) {
    errors.push(`Port ${parsedUrl.port} is blocked`);
  }

  // Validar whitelist de dominios si se proporciona
  if (allowedDomains && allowedDomains.length > 0) {
    const isAllowed = allowedDomains.some(domain => {
      const lowerHostname = parsedUrl.hostname.toLowerCase();
      const lowerDomain = domain.toLowerCase();
      return lowerHostname === lowerDomain || lowerHostname.endsWith(`.${lowerDomain}`);
    });

    if (!isAllowed) {
      errors.push(`Domain '${parsedUrl.hostname}' is not in the allowed domains list`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    url: errors.length === 0 ? parsedUrl : undefined
  };
}

/**
 * Valida una URL y lanza un error si es inválida
 *
 * @param urlString - URL a validar
 * @param allowedDomains - Lista opcional de dominios permitidos
 * @throws Error si la URL es inválida
 * @returns URL parseada si es válida
 *
 * @example
 * try {
 *   const url = validateUrlOrThrow('https://example.com');
 * } catch (error) {
 *   console.error(error.message);
 * }
 */
export function validateUrlOrThrow(urlString: string, allowedDomains?: string[]): URL {
  const result = validateUrl(urlString, allowedDomains);

  if (!result.isValid) {
    throw new Error(`URL validation failed: ${result.errors.join('. ')}`);
  }

  return result.url!;
}

/**
 * Valida múltiples URLs de forma eficiente
 *
 * @param urls - Array de URLs a validar
 * @param allowedDomains - Lista opcional de dominios permitidos
 * @returns Array de resultados de validación
 */
export function validateMultipleUrls(
  urls: string[],
  allowedDomains?: string[]
): UrlValidationResult[] {
  return urls.map(url => validateUrl(url, allowedDomains));
}

/**
 * Verifica si todas las URLs en un array son válidas
 *
 * @param urls - Array de URLs a validar
 * @param allowedDomains - Lista opcional de dominios permitidos
 * @returns true si todas son válidas, false en caso contrario
 */
export function areAllUrlsValid(urls: string[], allowedDomains?: string[]): boolean {
  return urls.every(url => validateUrl(url, allowedDomains).isValid);
}

/**
 * Sanitiza una URL eliminando componentes potencialmente peligrosos
 * pero manteniendo la URL funcional
 *
 * @param urlString - URL a sanitizar
 * @returns URL sanitizada como string
 */
export function sanitizeUrl(urlString: string): string {
  try {
    const url = new URL(urlString);

    // Eliminar credenciales (username:password)
    url.username = '';
    url.password = '';

    // Eliminar fragmentos (#)
    url.hash = '';

    return url.toString();
  } catch (error) {
    throw new Error('Cannot sanitize invalid URL');
  }
}

/**
 * Extrae el dominio base de una URL para comparaciones
 *
 * @param urlString - URL de la cual extraer el dominio
 * @returns Dominio base
 */
export function extractBaseDomain(urlString: string): string {
  try {
    const url = new URL(urlString);
    return url.hostname.toLowerCase();
  } catch (error) {
    throw new Error('Cannot extract domain from invalid URL');
  }
}
