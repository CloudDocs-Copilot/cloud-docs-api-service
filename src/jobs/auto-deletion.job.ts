import cron from 'node-cron';
import { deletionService } from '../services/deletion.service';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Configuración de Jobs Programados para Eliminación Automática
 *
 * Este módulo configura cron jobs para:
 * - Eliminación automática de documentos expirados en papelera (30 días)
 *
 * GDPR Compliance:
 * - Cumple con el derecho al olvido (Artículo 17)
 * - Retención de datos limitada (Artículo 5)
 */

/**
 * Job: Eliminación automática de documentos expirados
 * Ejecuta diariamente a las 2:00 AM
 */
export const startAutoDeletionJob = (): void => {
  // Cron expresión: '0 2 * * *' = Todos los días a las 2:00 AM
  // Para testing: '*/5 * * * *' = Cada 5 minutos

  const cronExpression = process.env.AUTO_DELETE_CRON || '0 2 * * *';

  const handler = async () => {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] Running auto-deletion job...`);

    try {
      const deletedCount = await deletionService.autoDeleteExpiredDocuments();
      console.warn(`[${timestamp}] Auto-deletion completed. Deleted ${deletedCount} documents.`);
    } catch (error: unknown) {
      console.error(`[${timestamp}] Auto-deletion job failed:`, getErrorMessage(error));
    }
  };

  cron.schedule(cronExpression, handler);

  // In test environment, run the handler immediately to make tests deterministic
  if (process.env.NODE_ENV === 'test') {
    void handler();
  }

  console.warn(`Auto-deletion cron job scheduled: ${cronExpression}`);
};

/**
 * Job manual: Ejecuta eliminación automática inmediatamente (para testing)
 */
export const runAutoDeletionNow = async (): Promise<number> => {
  console.warn('Running manual auto-deletion...');
  const deletedCount = await deletionService.autoDeleteExpiredDocuments();
  console.warn(`Manual auto-deletion completed. Deleted ${deletedCount} documents.`);
  return deletedCount;
};
