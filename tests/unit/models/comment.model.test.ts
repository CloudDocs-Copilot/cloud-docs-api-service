import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import CommentModel from '../../../src/models/comment.model';

describe('Comment Model', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    // Importante para asegurar creación de índices antes de consultarlos
    await CommentModel.init();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await CommentModel.deleteMany({});
  });

  const makeIds = () => ({
    documentId: new mongoose.Types.ObjectId(),
    orgId: new mongoose.Types.ObjectId(),
    userId: new mongoose.Types.ObjectId()
  });

  describe('Creation + defaults', () => {
    it('should create a comment with required fields', async () => {
      const { documentId, userId, orgId } = makeIds();

      const comment = await CommentModel.create({
        document: documentId,
        organization: orgId,
        createdBy: userId,
        content: 'Hola mundo'
      });

      expect(comment.document.toString()).toBe(documentId.toString());
      expect(comment.organization?.toString()).toBe(orgId.toString());
      expect(comment.createdBy.toString()).toBe(userId.toString());
      expect(comment.content).toBe('Hola mundo');

      // timestamps true
      expect(comment.createdAt).toBeInstanceOf(Date);
      expect(comment.updatedAt).toBeInstanceOf(Date);
    });

    it('should default organization to null when not provided', async () => {
      const { documentId, userId } = makeIds();

      const comment = await CommentModel.create({
        document: documentId,
        createdBy: userId,
        content: 'Sin organización'
      });

      expect(comment.organization).toBeNull();
    });

    it('should trim content', async () => {
      const { documentId, userId } = makeIds();

      const comment = await CommentModel.create({
        document: documentId,
        createdBy: userId,
        content: '   contenido con espacios   '
      });

      expect(comment.content).toBe('contenido con espacios');
    });
  });

  describe('Validations', () => {
    it('should require document', async () => {
      const { userId } = makeIds();

      await expect(
        CommentModel.create({
          // document missing
          createdBy: userId,
          content: 'Test'
        } as any)
      ).rejects.toThrow('Documento es requerido');
    });

    it('should require createdBy', async () => {
      const { documentId } = makeIds();

      await expect(
        CommentModel.create({
          document: documentId,
          // createdBy missing
          content: 'Test'
        } as any)
      ).rejects.toThrow('createdBy es requerido');
    });

    it('should require content', async () => {
      const { documentId, userId } = makeIds();

      await expect(
        CommentModel.create({
          document: documentId,
          createdBy: userId
          // content missing
        } as any)
      ).rejects.toThrow('Contenido es requerido');
    });

    it('should enforce minlength after trim (>= 1)', async () => {
      const { documentId, userId } = makeIds();

      await expect(
        CommentModel.create({
          document: documentId,
          createdBy: userId,
          content: '   ' // trim -> ''
        })
      ).rejects.toThrow();
    });

    it('should enforce maxlength (<= 2000)', async () => {
      const { documentId, userId } = makeIds();

      const tooLong = 'a'.repeat(2001);

      await expect(
        CommentModel.create({
          document: documentId,
          createdBy: userId,
          content: tooLong
        })
      ).rejects.toThrow('Contenido no puede exceder 2000 caracteres');
    });
  });

  describe('Timestamps', () => {
    it('should update updatedAt on save', async () => {
      const { documentId, userId } = makeIds();

      const comment = await CommentModel.create({
        document: documentId,
        createdBy: userId,
        content: 'Inicial'
      });

      const firstUpdatedAt = comment.updatedAt;

      // esperar un “tick” para asegurar diferencia de timestamp
      await new Promise(r => setTimeout(r, 5));

      comment.content = 'Actualizado';
      await comment.save();

      expect(comment.updatedAt.getTime()).toBeGreaterThan(firstUpdatedAt.getTime());
    });
  });

  describe('toJSON / toObject transforms', () => {
    it('toJSON should remove _id and versionKey, keep virtuals', async () => {
      const { documentId, userId } = makeIds();

      const comment = await CommentModel.create({
        document: documentId,
        createdBy: userId,
        content: 'JSON'
      });

      const json = comment.toJSON() as any;

      // transform: delete ret._id
      expect(json._id).toBeUndefined();

      // versionKey: false
      expect(json.__v).toBeUndefined();

      // virtuals: true -> por default Mongoose incluye "id" virtual
      // (si tu config global lo desactiva, puedes quitar esta aserción)
      expect(typeof json.id).toBe('string');
      expect(json.id.length).toBeGreaterThan(0);
    });

    it('toObject should remove _id and versionKey, keep virtuals', async () => {
      const { documentId, userId } = makeIds();

      const comment = await CommentModel.create({
        document: documentId,
        createdBy: userId,
        content: 'OBJ'
      });

      const obj = comment.toObject() as any;

      expect(obj._id).toBeUndefined();
      expect(obj.__v).toBeUndefined();
      expect(typeof obj.id).toBe('string');
      expect(obj.id.length).toBeGreaterThan(0);
    });
  });

  describe('Indexes', () => {
    it('should include single-field indexes (document, organization, createdBy) and compound indexes', async () => {
      // Asegurar que la colección exista y tenga al menos un doc
      const { documentId, userId } = makeIds();
      await CommentModel.create({
        document: documentId,
        createdBy: userId,
        content: 'Index bootstrap'
      });

      // init() ya corre en beforeAll, pero por si acaso
      await CommentModel.init();

      const indexes = await CommentModel.collection.getIndexes();
      const indexNames = Object.keys(indexes);

      // single-field indexes por "index: true" en el schema
      // (los nombres pueden variar según mongoose/mongo, por eso buscamos por patrón)
      const hasDocumentIndex = indexNames.some(n => n.includes('document_1'));
      const hasCreatedByIndex = indexNames.some(n => n.includes('createdBy_1'));
      const hasOrganizationIndex = indexNames.some(n => n.includes('organization_1'));

      expect(hasDocumentIndex).toBe(true);
      expect(hasCreatedByIndex).toBe(true);
      expect(hasOrganizationIndex).toBe(true);

      // compound indexes definidos explícitamente
      const hasDocCreatedAt = indexNames.some(
        n => n.includes('document_1') && n.includes('createdAt_-1')
      );
      const hasOrgCreatedAt = indexNames.some(
        n => n.includes('organization_1') && n.includes('createdAt_-1')
      );

      expect(hasDocCreatedAt).toBe(true);
      expect(hasOrgCreatedAt).toBe(true);
    });
  });
});
