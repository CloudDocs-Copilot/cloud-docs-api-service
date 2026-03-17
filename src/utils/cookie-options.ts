import { CookieOptions } from 'express';

/**
 * Opciones de cookie para el token JWT de autenticación.
 *
 * En producción (frontend en Vercel, backend en Render) los orígenes son distintos
 * (cross-site), por lo que se requiere:
 *   - SameSite=None  → permite envío cross-site
 *   - Secure=true    → obligatorio cuando SameSite=None (solo HTTPS)
 *
 * En desarrollo se usa:
 *   - SameSite=Lax   → protección razonable sin requerir HTTPS
 *   - Secure=false   → permite HTTP en localhost
 *
 * NODE_ENV se lee en tiempo de ejecución (no en importación) para que los
 * tests puedan cambiar el entorno antes de llamar al controlador.
 *
 * maxAge por defecto: 24 horas (en milisegundos).
 */
export const getAuthCookieOptions = (): CookieOptions => {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 24 horas
    path: '/'
  };
};

/**
 * Opciones para limpiar (clearCookie) el token JWT.
 * Deben coincidir exactamente con las opciones de set para que el navegador
 * identifique la cookie correctamente y la elimine.
 */
export const getAuthCookieClearOptions = (): CookieOptions => {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/'
  };
};

/**
 * Opciones para limpiar (clearCookie) el token CSRF.
 * Debe coincidir exactamente con las opciones usadas por csrf-csrf en csrf.middleware.ts
 * para que el navegador identifique la cookie correctamente y la elimine.
 *
 * Nota: La cookie CSRF es generada por csrf-csrf con httpOnly=true, secure=true en producción
 */
export const getCsrfCookieClearOptions = (): CookieOptions => {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/'
  };
};

// Retrocompatibilidad: constantes estáticas para uso fuera de tests
export const AUTH_COOKIE_OPTIONS: CookieOptions = getAuthCookieOptions();
export const AUTH_COOKIE_CLEAR_OPTIONS: CookieOptions = getAuthCookieClearOptions();
export const CSRF_COOKIE_CLEAR_OPTIONS: CookieOptions = getCsrfCookieClearOptions();
