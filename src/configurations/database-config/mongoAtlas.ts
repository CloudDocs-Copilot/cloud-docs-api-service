import { MongoClient, Db } from 'mongodb';

/**
 * Cliente MongoDB Atlas para vector search y embeddings
 *
 * Este módulo gestiona la conexión a MongoDB Atlas usando el driver nativo.
 * Se utiliza para almacenar y buscar embeddings vectoriales en document_chunks.
 *
 * NO usar Mongoose aquí - solo MongoClient nativo para compatibilidad con vector search.
 */

/**
 * URI de conexión a MongoDB Atlas
 * Se obtiene de la variable de entorno MONGO_ATLAS_URI
 */
const MONGO_ATLAS_URI = process.env.MONGO_ATLAS_URI || '';

/**
 * Nombre de la base de datos en Atlas
 */
const DATABASE_NAME = 'cloud_docs_ia';

/**
 * Cliente singleton de MongoDB Atlas
 */
let client: MongoClient | null = null;

/**
 * Base de datos singleton
 */
let database: Db | null = null;

/**
 * Conecta a MongoDB Atlas y retorna la instancia de la base de datos
 * Implementa patrón singleton - reutiliza la conexión existente
 *
 * @returns Instancia de la base de datos MongoDB
 * @throws Error si MONGO_ATLAS_URI no está configurado o la conexión falla
 */
export async function getDb(): Promise<Db> {
  // Si ya tenemos una conexión, reutilizarla
  if (database && client) {
    return database;
  }

  // Validar que la URI esté configurada
  if (!MONGO_ATLAS_URI || MONGO_ATLAS_URI.trim() === '') {
    throw new Error('MONGO_ATLAS_URI is not configured in environment variables');
  }

  try {
    console.log('[atlas] Connecting to MongoDB Atlas...');

    // Crear nuevo cliente con opciones recomendadas
    client = new MongoClient(MONGO_ATLAS_URI, {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000
    });

    // Conectar al cluster
    await client.connect();

    // Obtener referencia a la base de datos
    database = client.db(DATABASE_NAME);

    // Verificar conexión con ping
    await database.command({ ping: 1 });

    console.log('[atlas] MongoDB Atlas connected successfully');

    return database;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[atlas] MongoDB Atlas connection error:', errorMessage);

    // Limpiar referencias en caso de error
    client = null;
    database = null;

    throw new Error(`Failed to connect to MongoDB Atlas: ${errorMessage}`);
  }
}

/**
 * Cierra la conexión a MongoDB Atlas
 * Útil para cleanup en tests o shutdown de la aplicación
 */
export async function closeAtlasConnection(): Promise<void> {
  if (client) {
    try {
      await client.close();
      console.log('[atlas] MongoDB Atlas connection closed');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[atlas] Error closing MongoDB Atlas connection:', errorMessage);
    } finally {
      client = null;
      database = null;
    }
  }
}

/**
 * Verifica si hay una conexión activa a MongoDB Atlas
 *
 * @returns true si hay una conexión activa, false en caso contrario
 */
export function isConnected(): boolean {
  return client !== null && database !== null;
}

/**
 * Obtiene el cliente MongoDB para operaciones avanzadas
 * Úsalo solo si necesitas acceso directo al cliente
 *
 * @returns MongoClient instance o null si no está conectado
 */
export function getClient(): MongoClient | null {
  return client;
}
