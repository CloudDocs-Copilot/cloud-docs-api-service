import { MongoClient, Db, MongoClientOptions } from 'mongodb';

/**
 * Cliente MongoDB Atlas para vector search y embeddings
 *
 * Este módulo gestiona la conexión a MongoDB Atlas usando el driver nativo.
 * Se utiliza para almacenar y buscar embeddings vectoriales en document_chunks.
 *
 * NO usar Mongoose aquí - solo MongoClient nativo para compatibilidad con vector search.
 */

/**
 * Obtiene la URI de conexión a MongoDB Atlas desde las variables de entorno
 * Se lee en tiempo de ejecución para que los tests puedan modificar `process.env`
 */
function getMongoAtlasUri(): string {
  return process.env.MONGO_ATLAS_URI || '';
}

/**
 * Flag para permitir certificados TLS inválidos (SOLO para desarrollo/testing)
 * En Windows, OpenSSL puede tener problemas con certificados CA de Atlas
 * Set MONGO_ATLAS_ALLOW_INVALID_TLS=true SOLO si tienes problemas de certificados
 * NUNCA usar en producción
 */
const ALLOW_INVALID_TLS = process.env.MONGO_ATLAS_ALLOW_INVALID_TLS === 'true';

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
  // Si ya tenemos una conexión, validar que la URI siga presente y reutilizarla
  if (database && client) {
    const currentUri = getMongoAtlasUri();
    if (!currentUri || currentUri.trim() === '') {
      throw new Error('MONGO_ATLAS_URI is not configured in environment variables');
    }
    console.warn('[atlas] ♻️  Reusing existing connection');
    return database;
  }

  // Validar que la URI esté configurada
  const MONGO_ATLAS_URI = getMongoAtlasUri();
  if (!MONGO_ATLAS_URI || MONGO_ATLAS_URI.trim() === '') {
    throw new Error('MONGO_ATLAS_URI is not configured in environment variables');
  }

  try {
    const connStart = Date.now();
    console.warn('[atlas] 🔌 Connecting to MongoDB Atlas...');

    // Crear nuevo cliente con opciones recomendadas
    // Opciones TLS robustas para Windows + Node.js
    const clientOptions: MongoClientOptions = {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      // Opciones TLS para compatibilidad Windows
      tls: true,
      tlsAllowInvalidCertificates: ALLOW_INVALID_TLS, // Solo true si env var está activada
      tlsAllowInvalidHostnames: false,
      // Retry writes para operaciones más robustas
      retryWrites: true,
      retryReads: true
    };

    if (ALLOW_INVALID_TLS) {
      console.warn(
        '[atlas] ⚠️  WARNING: TLS certificate validation is DISABLED. Only use in development!'
      );
    }

    client = new MongoClient(MONGO_ATLAS_URI, clientOptions);

    // Conectar al cluster
    await client.connect();

    // Obtener referencia a la base de datos
    database = client.db(DATABASE_NAME);

    // Verificar conexión con ping
    await database.command({ ping: 1 });

    console.warn(`[atlas] ✅ MongoDB Atlas connected successfully in ${Date.now() - connStart}ms`);

    return database;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[atlas] MongoDB Atlas connection error:', errorMessage);

    // Limpiar referencias en caso de error
    client = null;
    database = null;

    throw error;
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
      console.warn('[atlas] MongoDB Atlas connection closed');
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
