/**
 * Delay Helper
 * Funciones para manejar delays en tests (útil para rate limiting)
 */

/**
 * Crea un delay asíncrono
 */
export const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Delay corto (100ms) para tests rápidos
 */
export const shortDelay = (): Promise<void> => delay(100);

/**
 * Delay medio (500ms) para evitar rate limiting
 */
export const mediumDelay = (): Promise<void> => delay(500);

/**
 * Delay largo (1000ms) para operaciones pesadas
 */
export const longDelay = (): Promise<void> => delay(1000);

/**
 * Ejecuta una función con delay entre ejecuciones
 */
export async function executeWithDelay<T>(fn: () => Promise<T>, delayMs: number = 500): Promise<T> {
  const result = await fn();
  await delay(delayMs);
  return result;
}

/**
 * Ejecuta múltiples funciones con delay entre cada una
 */
export async function executeMultipleWithDelay<T>(
  functions: Array<() => Promise<T>>,
  delayMs: number = 500
): Promise<T[]> {
  const results: T[] = [];

  for (const fn of functions) {
    const result = await fn();
    results.push(result);
    await delay(delayMs);
  }

  return results;
}

/**
 * Retry con delay exponencial
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 100
): Promise<T> {
  let lastError: Error | undefined;
  let currentDelay = initialDelayMs;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (i < maxRetries - 1) {
        await delay(currentDelay);
        currentDelay *= 2; // Exponential backoff
      }
    }
  }

  throw lastError ?? new Error('Retry failed');
}
