// Load environment variables first (handles .env, .env.local, .env.{NODE_ENV})
import './configurations/env-config';
import http from 'http';

import app from './app';
import { connectMongo } from './configurations/database-config/mongoDB';
import ElasticsearchClient from './configurations/elasticsearch-config';
import { startAutoDeletionJob } from './jobs/auto-deletion.job';
import { initSocket } from './socket/socket';
import { getAIProviderType, getAIProvider } from './services/ai/providers/provider.factory';

/**
 * Puerto en el que correrá el servidor
 * Se obtiene de la variable de entorno PORT o usa 4000 por defecto
 */
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

/**
 * Verifica si Elasticsearch está habilitado
 */
const isElasticsearchEnabled = (): boolean => {
  const enabled = process.env.ELASTICSEARCH_ENABLED;
  return enabled === 'true' || enabled === '1';
};

/**
 * Función de inicio del servidor
 * Conecta a la base de datos y levanta el servidor Express
 */
async function start(): Promise<void> {
  try {
    await connectMongo();

    // Verificar conexión con Elasticsearch solo si está habilitado
    if (isElasticsearchEnabled()) {
      const esConnected = await ElasticsearchClient.checkConnection();
      if (esConnected) {
        // Crear índice de documentos si no existe
        await ElasticsearchClient.createDocumentIndex();
      } else {
        console.warn(
          '⚠️  Elasticsearch enabled but not available. Search functionality will be limited.'
        );
      }
    } else {
      console.warn('ℹ️  Elasticsearch disabled. Search functionality will be limited.');
    }

    // Iniciar job de eliminación automática
    // Do not start background jobs during tests to avoid async work interfering with Jest
    if (process.env.NODE_ENV !== 'test' && !process.env.DISABLE_JOBS) {
      void startAutoDeletionJob();
    }

    // Create HTTP server (required for Socket.IO)
    const server = http.createServer(app);

    // Attach Socket.IO to server
    initSocket(server);

    server.listen(PORT, () => console.warn(`Backend server listening on port ${PORT}`));

    // Pre-warm LLM model for Ollama to reduce first-request latency
    // Skip in test environment to avoid interfering with tests
    if (process.env.NODE_ENV !== 'test') {
      try {
        const providerType = getAIProviderType();
        if (providerType === 'ollama') {
          // Run pre-warm asynchronously, do not block server startup
          void (async (): Promise<void> => {
            try {
              const provider = getAIProvider();
              console.warn('[prewarm] Detected Ollama provider, attempting pre-warm...');
              await provider.checkConnection();
              // Small dummy prompt to load model into memory
              const warmPrompt = 'Hola.';
              const warmOptions = { maxTokens: 8 } as const;
              await provider.generateResponse(warmPrompt, warmOptions as unknown as Record<string, unknown>);
              console.warn('[prewarm] Ollama pre-warm completed');
            } catch (e: unknown) {
              console.warn('[prewarm] Ollama pre-warm failed:', e instanceof Error ? e.message : String(e));
            }
          })();
        }
      } catch (e: unknown) {
        console.warn('[prewarm] Pre-warm skipped:', e instanceof Error ? e.message : String(e));
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Startup failed. Exiting process.', message);
    process.exit(1);
  }
}

void start();
