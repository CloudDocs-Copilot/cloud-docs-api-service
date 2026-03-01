import mongoose from 'mongoose';

/**
 * URI de conexión a MongoDB
 * Se obtiene de la variable de entorno MONGO_URI o usa un valor por defecto local
 */
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/clouddocs';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Establece la conexión con la base de datos MongoDB
 *
 * @throws Error si la conexión falla
 */
export async function connectMongo(): Promise<void> {
  try {
    console.warn('[database] Connecting to MongoDB...', MONGO_URI);
    await mongoose.connect(MONGO_URI);
    console.warn('[database] MongoDB connected');
  } catch (err: unknown) {
    console.error('[database] MongoDB connection error:', getErrorMessage(err));
    throw err;
  }
}

export { mongoose };
