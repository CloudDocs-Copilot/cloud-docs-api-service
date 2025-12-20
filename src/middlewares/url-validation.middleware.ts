/**
 * Middleware de Validación de URLs
 * 
 * Este middleware proporciona validación automática de URLs en los request bodies
 * para prevenir ataques SSRF y Open Redirect.
 */

import { Request, Response, NextFunction } from 'express';
import { validateUrl, URL_VALIDATION_CONFIG } from '../utils/url-validator';
import HttpError from '../models/error.model';

/**
 * Opciones de configuración del middleware
 */
export interface UrlValidationOptions {
  // Campos del body que contienen URLs a validar
  fields: string[];
  
  // Dominios permitidos (opcional - whitelist)
  allowedDomains?: string[];
  
  // Si debe fallar cuando encuentra una URL inválida (default: true)
  strict?: boolean;
  
  // Mensaje de error personalizado
  errorMessage?: string;
}

/**
 * Middleware para validar URLs en el request body
 * 
 * @param options - Opciones de configuración
 * @returns Middleware de Express
 * 
 * @example
 * router.post('/webhook', 
 *   validateUrlMiddleware({ fields: ['callbackUrl'], allowedDomains: ['example.com'] }),
 *   controller.handleWebhook
 * );
 */
export function validateUrlMiddleware(options: UrlValidationOptions) {
  const {
    fields,
    allowedDomains,
    strict = true,
    errorMessage = 'Invalid URL detected'
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: string[] = [];

    // Validar cada campo especificado
    for (const field of fields) {
      const value = req.body[field];

      // Si el campo no existe o está vacío, continuar
      if (!value) continue;

      // Si es un array de URLs, validar cada una
      if (Array.isArray(value)) {
        value.forEach((url: string, index: number) => {
          if (typeof url === 'string') {
            const result = validateUrl(url, allowedDomains);
            if (!result.isValid) {
              errors.push(`${field}[${index}]: ${result.errors.join(', ')}`);
            }
          }
        });
      } 
      // Si es una URL simple, validarla
      else if (typeof value === 'string') {
        const result = validateUrl(value, allowedDomains);
        if (!result.isValid) {
          errors.push(`${field}: ${result.errors.join(', ')}`);
        }
      }
    }

    // Si hay errores y el modo es estricto, rechazar la petición
    if (errors.length > 0 && strict) {
      return next(new HttpError(400, `${errorMessage}: ${errors.join('; ')}`));
    }

    // Continuar con la siguiente middleware
    next();
  };
}

/**
 * Middleware pre-configurado para validar webhooks y callbacks
 * Común en integraciones con servicios externos
 * 
 * @example
 * router.post('/webhook', validateWebhookUrl, controller.handleWebhook);
 */
export const validateWebhookUrl = validateUrlMiddleware({
  fields: ['webhookUrl', 'callbackUrl', 'redirectUrl'],
  errorMessage: 'Invalid webhook/callback URL'
});

/**
 * Middleware para validar URLs de imágenes/recursos externos
 * Útil cuando se permite a usuarios especificar URLs de imágenes
 * 
 * @param allowedDomains - Dominios permitidos para recursos
 * @returns Middleware configurado
 * 
 * @example
 * router.post('/profile', validateImageUrl(['cdn.example.com']), controller.updateProfile);
 */
export function validateImageUrl(allowedDomains?: string[]) {
  return validateUrlMiddleware({
    fields: ['imageUrl', 'avatarUrl', 'thumbnailUrl', 'iconUrl'],
    allowedDomains,
    errorMessage: 'Invalid image URL'
  });
}

/**
 * Middleware para validar URLs de redirección
 * Previene Open Redirect vulnerabilities
 * 
 * @param allowedDomains - Dominios permitidos para redirección
 * @returns Middleware configurado
 * 
 * @example
 * router.get('/redirect', validateRedirectUrl(['myapp.com']), controller.redirect);
 */
export function validateRedirectUrl(allowedDomains: string[]) {
  if (!allowedDomains || allowedDomains.length === 0) {
    throw new Error('allowedDomains is required for redirect URL validation');
  }

  return validateUrlMiddleware({
    fields: ['redirectUrl', 'returnUrl', 'continueUrl', 'nextUrl'],
    allowedDomains,
    strict: true,
    errorMessage: 'Invalid redirect URL. Redirection is only allowed to trusted domains'
  });
}

/**
 * Middleware para extraer y validar URLs de query parameters
 * 
 * @param paramNames - Nombres de los parámetros que contienen URLs
 * @param allowedDomains - Dominios permitidos (opcional)
 * @returns Middleware de Express
 * 
 * @example
 * router.get('/proxy', validateQueryUrl(['url'], ['trusted.com']), controller.proxy);
 */
export function validateQueryUrl(paramNames: string[], allowedDomains?: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: string[] = [];

    for (const param of paramNames) {
      const value = req.query[param];

      if (!value) continue;

      const urlString = Array.isArray(value) ? value[0] : value;

      if (typeof urlString === 'string') {
        const result = validateUrl(urlString, allowedDomains);
        if (!result.isValid) {
          errors.push(`${param}: ${result.errors.join(', ')}`);
        }
      }
    }

    if (errors.length > 0) {
      return next(new HttpError(400, `Invalid URL in query parameters: ${errors.join('; ')}`));
    }

    next();
  };
}

/**
 * Middleware para validar cualquier URL detectada en el request
 * Modo de seguridad agresivo - escanea todo el body
 * 
 * @param allowedDomains - Dominios permitidos
 * @returns Middleware de Express
 * 
 * @example
 * router.post('/api', scanForUrls(['trusted.com']), controller.handle);
 */
export function scanForUrls(allowedDomains?: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: string[] = [];
    
    // Función recursiva para buscar URLs en objetos
    function scanObject(obj: any, path: string = ''): void {
      if (typeof obj === 'string') {
        // Regex simple para detectar URLs
        const urlPattern = /https?:\/\/[^\s]+/gi;
        const matches = obj.match(urlPattern);
        
        if (matches) {
          matches.forEach(url => {
            const result = validateUrl(url, allowedDomains);
            if (!result.isValid) {
              errors.push(`${path}: ${result.errors.join(', ')}`);
            }
          });
        }
      } else if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
          scanObject(item, `${path}[${index}]`);
        });
      } else if (obj && typeof obj === 'object') {
        Object.keys(obj).forEach(key => {
          scanObject(obj[key], path ? `${path}.${key}` : key);
        });
      }
    }

    scanObject(req.body);

    if (errors.length > 0) {
      return next(new HttpError(400, `Suspicious URLs detected: ${errors.join('; ')}`));
    }

    next();
  };
}

/**
 * Middleware de información - agrega headers informativos sobre la política de URLs
 * Útil para debugging y documentación de API
 */
export function addUrlPolicyHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-URL-Policy-Schemes', URL_VALIDATION_CONFIG.allowedSchemes.join(', '));
  res.setHeader('X-URL-Policy-Max-Length', URL_VALIDATION_CONFIG.maxLength.toString());
  res.setHeader('X-URL-Policy-Private-IPs', 'blocked');
  next();
}

export default {
  validateUrlMiddleware,
  validateWebhookUrl,
  validateImageUrl,
  validateRedirectUrl,
  validateQueryUrl,
  scanForUrls,
  addUrlPolicyHeaders
};
