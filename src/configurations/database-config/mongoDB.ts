import mongoose from 'mongoose';

/**
 * URI de conexión a MongoDB
 * Se obtiene de la variable de entorno MONGO_URI o usa un valor por defecto local
 */
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/clouddocs';

/**
 * Establece la conexión con la base de datos MongoDB
 * 
 * @throws Error si la conexión falla
 */
export async function connectMongo(): Promise<void> {
  try {
    console.log('[database] Connecting to MongoDB...',MONGO_URI);
    await mongoose.connect(MONGO_URI);
    console.log('[database] MongoDB connected');
  } catch (err: any) {
    console.error('[database] MongoDB connection error:', err.message);
    throw err;
  }
}

export { mongoose };
