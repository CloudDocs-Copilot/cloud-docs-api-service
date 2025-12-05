import 'dotenv/config';
import app from './app';
import { connectMongo } from './configurations/database-config/mongoDB';

const PORT = process.env.PORT || 4000;

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
