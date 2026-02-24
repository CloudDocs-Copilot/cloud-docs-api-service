// Load environment variables first (handles .env, .env.local, .env.{NODE_ENV})
import './configurations/env-config';
import http from 'http';

import app from './app';
import { connectMongo } from './configurations/database-config/mongoDB';
import ElasticsearchClient from './configurations/elasticsearch-config';
import { startAutoDeletionJob } from './jobs/auto-deletion.job';
import { initSocket } from './socket/socket';

/**
 * Puerto en el que correrá el servidor
 * Se obtiene de la variable de entorno PORT o usa 4000 por defecto
 */
const PORT = process.env.PORT || 4000;

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
      console.log('ℹ️  Elasticsearch disabled. Search functionality will be limited.');
    }

    // Iniciar job de eliminación automática
    startAutoDeletionJob();

    // Create HTTP server (required for Socket.IO)
    const server = http.createServer(app);

    // Attach Socket.IO to server
    initSocket(server);

    server.listen(PORT, () => console.log(`Backend server listening on port ${PORT}`));
  } catch (err) {
    console.error('Startup failed. Exiting process.');
    process.exit(1);
  }
}

start();
