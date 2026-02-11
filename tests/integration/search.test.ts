import request from 'supertest';
import app from '../../src/app';
import DocumentModel from '../../src/models/document.model';
import OrganizationModel from '../../src/models/organization.model';
import UserModel from '../../src/models/user.model';
import MembershipModel from '../../src/models/membership.model';
import FolderModel from '../../src/models/folder.model';
import * as searchService from '../../src/services/search.service';
import jwt from 'jsonwebtoken';

// Desmockear el servicio de búsqueda para este test
jest.unmock('../../src/services/search.service');

describe('Search API - Elasticsearch Integration', () => {
  let authToken: string;
  let userId: string;
  let organizationId: string;
  let documentIds: string[] = [];

  beforeAll(async () => {
    // Crear usuario de prueba
    const user = await UserModel.create({
      name: 'Search Tester',
      email: 'searchtester@test.com',
      password: 'hashedpassword123',
      role: 'user'
    });
    userId = user._id.toString();

    // Crear organización
    const org = await OrganizationModel.create({
      name: 'Search Test Org',
      ownerId: userId,
      plan: 'enterprise',
      settings: {
        allowedFileTypes: ['application/pdf', 'image/png', 'image/jpeg', 'text/plain']
      }
    });
    organizationId = org._id.toString();

    // Crear membership
    await MembershipModel.create({
      userId: user._id,
      organizationId: org._id,
      role: 'owner',
      status: 'active'
    });

    // Crear carpeta raíz
    const folder = await FolderModel.create({
      name: 'Root',
      path: '/',
      organization: org._id,
      uploadedBy: user._id
    });

    // Crear documentos de prueba con diferentes nombres
    const testDocs = [
      { filename: 'zonificacion-2023.pdf', originalname: 'ZONIFICACION_CASA_NUEVA.pdf' },
      { filename: 'predial-recibo.pdf', originalname: 'Recibo Predial 2024.pdf' },
      { filename: 'constancia.pdf', originalname: 'Constancia zonificacion empresa.pdf' },
      { filename: 'factura-123.pdf', originalname: 'Factura Servicios Enero.pdf' },
      { filename: 'contrato-arrendamiento.pdf', originalname: 'Contrato Arrendamiento Local.pdf' }
    ];

    for (const doc of testDocs) {
      const document = await DocumentModel.create({
        filename: doc.filename,
        originalname: doc.originalname,
        path: `/uploads/${doc.filename}`,
        mimeType: 'application/pdf',
        size: 1024,
        uploadedBy: user._id,
        organization: org._id,
        folder: folder._id,
        uploadedAt: new Date()
      });
      documentIds.push(document._id.toString());

      // Indexar en Elasticsearch
      await searchService.indexDocument(document);
    }

    // Generar token JWT
    authToken = jwt.sign(
      { id: userId, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    // Esperar a que Elasticsearch indexe
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    // Limpiar documentos de Elasticsearch
    for (const id of documentIds) {
      await searchService.removeDocumentFromIndex(id);
    }

    // Limpiar base de datos
    await DocumentModel.deleteMany({});
    await FolderModel.deleteMany({});
    await MembershipModel.deleteMany({});
    await OrganizationModel.deleteMany({});
    await UserModel.deleteMany({});
  });

  describe('GET /api/search', () => {
    it('debe buscar documentos con búsqueda parcial (zonificacion)', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ q: 'zonificacion' })
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Organization-ID', organizationId);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.total).toBeGreaterThan(0);
    });

    it('debe buscar con búsqueda case-insensitive (PREDIAL)', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ q: 'PREDIAL' })
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Organization-ID', organizationId);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('debe buscar con palabra parcial (constan)', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ q: 'constan' })
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Organization-ID', organizationId);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('debe filtrar por tipo MIME', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ 
          q: 'pdf',
          mimeType: 'application/pdf'
        })
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Organization-ID', organizationId);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      response.body.data.forEach((doc: any) => {
        expect(doc.mimeType).toBe('application/pdf');
      });
    });

    it('debe respetar paginación (limit y offset)', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ 
          q: 'pdf',
          limit: 2,
          offset: 0
        })
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Organization-ID', organizationId);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeLessThanOrEqual(2);
    });

    it('debe retornar 400 si falta el parámetro q', async () => {
      const response = await request(app)
        .get('/api/search')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Organization-ID', organizationId);

      expect(response.status).toBe(400);
    });

    it('debe retornar 401 sin autenticación', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ q: 'test' });

      expect(response.status).toBe(401);
    });

    it('debe filtrar solo documentos de la organización', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ q: 'zonificacion' })
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Organization-ID', organizationId);

      expect(response.status).toBe(200);
      response.body.data.forEach((doc: any) => {
        expect(doc.organization).toBe(organizationId);
      });
    });
  });

  describe('GET /api/search/autocomplete', () => {
    it('debe retornar sugerencias de autocompletado', async () => {
      const response = await request(app)
        .get('/api/search/autocomplete')
        .query({ q: 'zonif' })
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Organization-ID', organizationId);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.suggestions)).toBe(true);
    });

    it('debe limitar el número de sugerencias', async () => {
      const response = await request(app)
        .get('/api/search/autocomplete')
        .query({ 
          q: 'a',
          limit: 3
        })
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Organization-ID', organizationId);

      expect(response.status).toBe(200);
      expect(response.body.suggestions.length).toBeLessThanOrEqual(3);
    });

    it('debe retornar 400 si falta el parámetro q', async () => {
      const response = await request(app)
        .get('/api/search/autocomplete')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Organization-ID', organizationId);

      expect(response.status).toBe(400);
    });
  });
});
