import 'dotenv/config';
import app from './app';
import { connectMongo } from './configurations/database-config/mongoDB';

/**
 * Puerto en el que correrá el servidor
 * Se obtiene de la variable de entorno PORT o usa 4000 por defecto
 */
const PORT = process.env.PORT || 4000;

/**
 * Función de inicio del servidor
 * Conecta a la base de datos y levanta el servidor Express
 */
async function start(): Promise<void> {
  try {
    await connectMongo();
    app.listen(PORT, () => console.log(`Backend server listening on port ${PORT}`));
  } catch (err) {
    console.error('Startup failed. Exiting process.');
    process.exit(1);
  }
}

start();
