import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app';

/**
 * Configuración global para tests de integración
 * 
 * Este archivo configura el entorno de pruebas:
 * - Conecta a una base de datos de prueba antes de ejecutar los tests
 * - Limpia las colecciones después de cada test para aislarlos
 * - Cierra la conexión después de todos los tests
 */

// Base de datos de prueba (puede usar MongoDB Memory Server para tests más rápidos)
const TEST_MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/clouddocs-test';

// Conectar antes de todos los tests
beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_MONGO_URI);
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
});

export { request, app };
