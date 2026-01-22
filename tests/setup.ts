import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app';

/**
 * Configuración global para tests de integración
 * 
 * Este archivo configura el entorno de pruebas:
 * - Conecta a una base de datos de prueba antes de ejecutar los tests
 * - Limpia las colecciones después de cada test para aislarlos
 * - Cierra la conexión después de todos los tests
 */

let mongoServer: MongoMemoryServer;

// Conectar antes de todos los tests
beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  }
});

// Limpiar colecciones después de cada test para asegurar aislamiento
afterEach(async () => {
  if (mongoose.connection.readyState === 1) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  }
});

// Desconectar después de todos los tests para liberar recursos
afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
});

// Ensure the environment is set to 'test' to skip rate limiting
process.env.NODE_ENV = 'test';

export { request, app };
